import { env } from 'cloudflare:workers';
import { requireAgentAccess } from '@/lib/agent-access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canonicalJson, contentAddress, insertRewardEvent, recomputeConsensus, verificationPoints } from '@/lib/evidence-graph';
import { writableRoundId } from '@/lib/round-clock';
import { assertFreshTimestamp, normaliseWallet, verifyWalletMessage } from '@/lib/signatures';

const hexHash = z.string().regex(/^[a-f0-9]{64}$/i);
const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  claimId: hexHash,
  specialization: z.enum(['literature', 'clinical-trials', 'statistics', 'methods', 'safety', 'biology']),
  method: z.enum(['source-check', 'clinical-context', 'methods-audit', 'statistical-reproduction']),
  toolName: z.string().trim().min(2).max(120),
  result: z.enum(['supports', 'refutes', 'inconclusive']),
  confidenceBps: z.number().int().min(0).max(10_000),
  inputHash: hexHash,
  outputHash: hexHash,
  artifactUrl: z.url().max(500),
  metrics: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.number().int(),
  signature: z.string().trim().min(80).max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    assertFreshTimestamp(input.timestamp);
    const wallet = normaliseWallet(input.wallet);
    const { signature, ...signedPayload } = input;
    if (signature) await verifyWalletMessage(wallet, `MUSE_VERIFICATION_SUBMISSION_V1\n${canonicalJson(signedPayload)}`, signature);
    else await requireAgentAccess(request, wallet);
    const registered = await env.DB.prepare('SELECT 1 FROM agents WHERE wallet = ?').bind(wallet).first();
    if (!registered) throw new Error('Register this wallet before submitting a verification.');
    const claim = await env.DB.prepare('SELECT extractor_wallet FROM claims WHERE id = ?').bind(input.claimId).first<{ extractor_wallet: string }>();
    if (!claim) throw new Error('Claim does not exist.');
    if (claim.extractor_wallet === wallet) throw new Error('Claim extractors cannot verify their own claim.');
    const record = { ...signedPayload, wallet, inputHash: input.inputHash.toLowerCase(), outputHash: input.outputHash.toLowerCase() };
    const receivedAt = Date.now();
    const epochId = await writableRoundId(receivedAt);
    const id = await contentAddress('MUSE_VERIFICATION_V1', record);
    const inserted = await env.DB.prepare(
      `INSERT INTO verification_runs
       (id, claim_id, verifier_wallet, specialization, method, tool_name, result, confidence_bps,
        input_hash, output_hash, artifact_url, metrics_json, epoch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(claim_id, verifier_wallet) DO NOTHING`,
    ).bind(
      id, input.claimId, wallet, input.specialization, input.method, input.toolName, input.result,
      input.confidenceBps, input.inputHash.toLowerCase(), input.outputHash.toLowerCase(), input.artifactUrl,
      JSON.stringify(input.metrics), epochId, receivedAt,
    ).run();
    if ((inserted.meta.changes ?? 0) === 0) throw new Error('This wallet already verified the claim.');
    await insertRewardEvent({ wallet, epochId, eventType: input.method, objectId: id, points: verificationPoints(input.method), createdAt: receivedAt });
    const consensus = await recomputeConsensus(input.claimId, receivedAt, epochId);
    return NextResponse.json({ ok: true, verificationId: id, points: verificationPoints(input.method), consensus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
