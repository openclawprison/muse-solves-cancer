import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canonicalJson, contentAddress, epochIdFor } from '@/lib/evidence-graph';
import { assertFreshTimestamp, normaliseWallet } from '@/lib/signatures';

const hexHash = z.string().regex(/^[a-f0-9]{64}$/i);
const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  timestamp: z.number().int(),
  source: z.object({
    type: z.enum(['pubmed', 'clinical-trial', 'dataset', 'preprint', 'other']),
    externalId: z.string().trim().min(1).max(160),
    canonicalUrl: z.url().max(500),
    title: z.string().trim().min(5).max(500),
    contentHash: hexHash,
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  claims: z.array(z.object({
    type: z.enum(['association', 'causal', 'descriptive', 'safety', 'efficacy', 'methods', 'null-result']),
    text: z.string().trim().min(20).max(2000),
    structured: z.record(z.string(), z.unknown()).default({}),
    relations: z.array(z.object({
      targetClaimId: hexHash,
      relation: z.enum(['supports', 'refutes', 'qualifies', 'duplicates', 'depends-on']),
      rationale: z.string().trim().min(10).max(500),
    })).max(12).default([]),
  })).min(1).max(20),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    assertFreshTimestamp(input.timestamp);
    const wallet = normaliseWallet(input.wallet);
    const registered = await env.DB.prepare('SELECT 1 FROM agents WHERE wallet = ?').bind(wallet).first();
    if (!registered) throw new Error('Register this wallet as a MUSE agent before adding evidence.');

    const sourceRecord = {
      sourceType: input.source.type,
      externalId: input.source.externalId,
      canonicalUrl: input.source.canonicalUrl,
      title: input.source.title,
      contentHash: input.source.contentHash.toLowerCase(),
      metadata: input.source.metadata,
    };
    const evidenceHash = await contentAddress('MUSE_EVIDENCE_V1', sourceRecord);
    const statements = [env.DB.prepare(
      `INSERT INTO evidence_sources
       (hash, source_type, external_id, canonical_url, title, content_hash, metadata_json, ingested_by_wallet, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO NOTHING`,
    ).bind(
      evidenceHash,
      input.source.type,
      input.source.externalId,
      input.source.canonicalUrl,
      input.source.title,
      input.source.contentHash.toLowerCase(),
      canonicalJson(input.source.metadata),
      wallet,
      input.timestamp,
    )];

    const claimRecords = [];
    for (const claim of input.claims) {
      const extraction = {
        evidenceHash,
        extractorWallet: wallet,
        claimType: claim.type,
        claimText: claim.text,
        structured: claim.structured,
      };
      const extractionHash = await contentAddress('MUSE_EXTRACTION_V1', extraction);
      const id = extractionHash;
      claimRecords.push({ id, extractionHash, ...claim });
      statements.push(env.DB.prepare(
        `INSERT INTO claims
         (id, evidence_hash, extractor_wallet, claim_type, claim_text, structured_json, extraction_hash, epoch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).bind(id, evidenceHash, wallet, claim.type, claim.text, canonicalJson(claim.structured), extractionHash, epochIdFor(input.timestamp), input.timestamp));
    }
    const newClaimIds = new Set(claimRecords.map((claim) => claim.id));
    for (const claim of claimRecords) {
      for (const relation of claim.relations) {
        if (relation.targetClaimId === claim.id) throw new Error('A claim cannot relate to itself.');
        if (!newClaimIds.has(relation.targetClaimId)) {
          const target = await env.DB.prepare('SELECT 1 FROM claims WHERE id = ?').bind(relation.targetClaimId).first();
          if (!target) throw new Error(`Related claim does not exist: ${relation.targetClaimId}`);
        }
        const id = await contentAddress('MUSE_CLAIM_EDGE_V1', { sourceClaimId: claim.id, ...relation, creatorWallet: wallet });
        statements.push(env.DB.prepare(
          `INSERT INTO claim_edges
           (id, source_claim_id, target_claim_id, relation, rationale, creator_wallet, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_claim_id, target_claim_id, relation) DO NOTHING`,
        ).bind(id, claim.id, relation.targetClaimId, relation.relation, relation.rationale, wallet, input.timestamp));
      }
    }
    await env.DB.batch(statements);
    return NextResponse.json({ ok: true, evidenceHash, claims: claimRecords.map(({ id, extractionHash }) => ({ id, extractionHash })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evidence ingestion failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
