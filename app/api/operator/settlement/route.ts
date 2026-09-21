import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isOperatorRequest } from '@/lib/operator-auth';
import { roundStartedAt } from '@/lib/round-clock';
import { isRoundClosed } from '@/lib/round-clock';

const hex = z.string().regex(/^[a-f0-9]{64}$/i);
const schema = z.object({
  epochId: z.number().int().nonnegative(),
  manifestHash: hex,
  merkleRoot: hex,
  totalRewardUnits: z.string().regex(/^\d+$/),
  commitTxHash: z.string().min(32).max(120).nullable(),
  payouts: z.array(z.object({
    index: z.number().int().nonnegative(),
    wallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    score: z.number().int().positive(),
    amountRewardUnits: z.string().regex(/^[1-9]\d*$/),
    txHash: z.string().min(32).max(120).nullable(),
  })).min(1).max(1000),
});

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    if (!(await isRoundClosed(input.epochId))) throw new Error('Round is still open.');
    if (new Set(input.payouts.map((payout) => payout.wallet)).size !== input.payouts.length) throw new Error('Duplicate payout wallet.');
    if (input.payouts.reduce((sum, payout) => sum + BigInt(payout.amountRewardUnits), 0n) !== BigInt(input.totalRewardUnits)) throw new Error('Payout total does not match the manifest.');
    const existing = await env.DB.prepare('SELECT distribution_hash FROM epochs WHERE id = ?').bind(input.epochId).first<{ distribution_hash: string | null }>();
    if (existing?.distribution_hash && existing.distribution_hash !== input.manifestHash) throw new Error('This epoch is bound to another manifest.');
    const now = Date.now();
    const statements = [env.DB.prepare(
      `INSERT INTO epochs (id, status, model, submission_count, eligible_count, total_points, reward_budget_wei, vault_balance_wei, distribution_status, distribution_tx_hash, distribution_hash, opened_at, scored_at, distributed_at)
       VALUES (?, 'scored', 'muse-rewards-v1', 0, ?, ?, ?, ?, 'keeper_reported', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET reward_budget_wei = excluded.reward_budget_wei,
         vault_balance_wei = excluded.vault_balance_wei, distribution_status = 'keeper_reported',
         distribution_tx_hash = COALESCE(excluded.distribution_tx_hash, epochs.distribution_tx_hash), distribution_hash = excluded.distribution_hash,
         distributed_at = excluded.distributed_at`,
    ).bind(input.epochId, input.payouts.length, input.payouts.reduce((sum, payout) => sum + payout.score, 0), input.totalRewardUnits, input.totalRewardUnits, input.commitTxHash, input.manifestHash, await roundStartedAt(input.epochId), now, now)];
    for (const payout of input.payouts) {
      statements.push(env.DB.prepare(
        `INSERT INTO epoch_payouts (id, epoch_id, wallet, score, allocation_ppm, amount_wei, status, tx_hash, created_at, paid_at)
         VALUES (?, ?, ?, ?, 0, ?, 'keeper_reported', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = 'keeper_reported', tx_hash = COALESCE(excluded.tx_hash, epoch_payouts.tx_hash),
           paid_at = excluded.paid_at`,
      ).bind(`${input.epochId}:${payout.index}`, input.epochId, payout.wallet, payout.score, payout.amountRewardUnits, payout.txHash, now, now));
    }
    await env.DB.batch(statements);
    return NextResponse.json({ ok: true, status: 'keeper_reported', payoutCount: input.payouts.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement report rejected.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
