import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { contentAddress, epochIdFor } from '@/lib/evidence-graph';
import { assertFreshTimestamp, normaliseWallet } from '@/lib/signatures';

const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  claimId: z.string().regex(/^[a-f0-9]{64}$/i),
  reason: z.string().trim().min(30).max(2000),
  evidenceUrl: z.url().max(500),
  timestamp: z.number().int(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    assertFreshTimestamp(input.timestamp);
    const wallet = normaliseWallet(input.wallet);
    const [registered, claim] = await Promise.all([
      env.DB.prepare('SELECT 1 FROM agents WHERE wallet = ?').bind(wallet).first(),
      env.DB.prepare('SELECT extractor_wallet FROM claims WHERE id = ?').bind(input.claimId).first<{ extractor_wallet: string }>(),
    ]);
    if (!registered) throw new Error('Register this wallet before challenging a claim.');
    if (!claim) throw new Error('Claim does not exist.');
    if (claim.extractor_wallet === wallet) throw new Error('Claim extractors cannot challenge their own claim.');
    const challengeHash = await contentAddress('MUSE_CHALLENGE_V1', { claimId: input.claimId, wallet, reason: input.reason, evidenceUrl: input.evidenceUrl });
    const inserted = await env.DB.prepare(
      `INSERT INTO challenges
       (id, claim_id, challenger_wallet, reason, evidence_url, challenge_hash, epoch_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(claim_id, challenger_wallet) DO NOTHING`,
    ).bind(challengeHash, input.claimId, wallet, input.reason, input.evidenceUrl, challengeHash, epochIdFor(input.timestamp), input.timestamp).run();
    if ((inserted.meta.changes ?? 0) === 0) throw new Error('This wallet already challenged the claim.');
    return NextResponse.json({ ok: true, challengeId: challengeHash, status: 'open' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Challenge failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
