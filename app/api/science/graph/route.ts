import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const [counts, claimRows, evidenceRows, edgeRows, verificationRows, challengeRows] = await Promise.all([
    env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS value FROM evidence_sources'),
      env.DB.prepare('SELECT COUNT(*) AS value FROM claims'),
      env.DB.prepare('SELECT COUNT(*) AS value FROM verification_runs'),
      env.DB.prepare('SELECT COUNT(*) AS value FROM challenges'),
      env.DB.prepare("SELECT COUNT(*) AS value FROM consensus_snapshots WHERE verdict IN ('supported', 'refuted')"),
      env.DB.prepare('SELECT COUNT(*) AS value FROM validator_attestations'),
    ]),
    env.DB.prepare(
      `SELECT c.id, c.claim_type AS claimType, c.claim_text AS claimText, c.evidence_hash AS evidenceHash,
              c.extractor_wallet AS extractorWallet, c.created_at AS createdAt,
              cs.verdict, cs.confidence_bps AS confidenceBps, cs.calculation_hash AS consensusHash,
              (SELECT COUNT(*) FROM validator_attestations va WHERE va.claim_id = c.id AND va.consensus_hash = cs.calculation_hash) AS validatorCount
       FROM claims c
       LEFT JOIN consensus_snapshots cs ON cs.id = (
         SELECT id FROM consensus_snapshots WHERE claim_id = c.id ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY c.created_at DESC LIMIT 40`,
    ).all(),
    env.DB.prepare(
      `SELECT hash, source_type AS sourceType, external_id AS externalId, canonical_url AS canonicalUrl,
              title, content_hash AS contentHash, ingested_at AS ingestedAt
       FROM evidence_sources ORDER BY ingested_at DESC LIMIT 24`,
    ).all(),
    env.DB.prepare(
      `SELECT id, source_claim_id AS sourceClaimId, target_claim_id AS targetClaimId, relation, rationale
       FROM claim_edges ORDER BY created_at DESC LIMIT 80`,
    ).all(),
    env.DB.prepare(
      `SELECT id, claim_id AS claimId, specialization, method, tool_name AS toolName, result,
              confidence_bps AS confidenceBps, output_hash AS outputHash, artifact_url AS artifactUrl, created_at AS createdAt
       FROM verification_runs ORDER BY created_at DESC LIMIT 40`,
    ).all(),
    env.DB.prepare(
      `SELECT id, claim_id AS claimId, reason, evidence_url AS evidenceUrl, challenge_hash AS challengeHash, created_at AS createdAt
       FROM challenges ORDER BY created_at DESC LIMIT 30`,
    ).all(),
  ]);
  const countValues = counts.map((result) => Number((result.results?.[0] as { value?: number } | undefined)?.value ?? 0));
  return NextResponse.json({
    protocol: 'MUSE_MACHINE_SCIENCE_V1',
    counts: {
      evidence: countValues[0], claims: countValues[1], verifications: countValues[2], challenges: countValues[3],
      decisiveConsensus: countValues[4], attestations: countValues[5],
    },
    thresholds: { independentVerifiers: 2, decisiveRatioBps: 6667, validatorAttestations: 2 },
    evidence: evidenceRows.results ?? [],
    claims: claimRows.results ?? [],
    edges: edgeRows.results ?? [],
    verifications: verificationRows.results ?? [],
    challenges: challengeRows.results ?? [],
  });
}
