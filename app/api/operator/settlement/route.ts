import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isOperatorRequest, isKeeperRequest } from '@/lib/operator-auth';
import { roundStartedAt } from '@/lib/round-clock';
import { isRoundClosed } from '@/lib/round-clock';

const hex = z.string().regex(/^[a-f0-9]{64}$/i);
const schema = z.object({
  epochId: z.number().int().nonnegative(),
  coveredEpochIds: z.array(z.number().int().nonnegative()).min(1).max(1000).optional(),
  manifestHash: hex,
  merkleRoot: hex,
  totalRewardUnits: z.string().regex(/^\d+$/),
  treasurySnapshotUnits: z.string().regex(/^\d+$/).optional(),
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
  if (!(await isOperatorRequest(request)) && !(await isKeeperRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const covered = input.coveredEpochIds ?? [input.epochId];
    if (covered.at(-1) !== input.epochId || covered.some((id, index) => index > 0 && id !== covered[index - 1] + 1)) throw new Error('Covered rounds must be a contiguous range ending at the settlement round.');
    if (!(await isRoundClosed(input.epochId))) throw new Error('Round is still open.');
    if (new Set(input.payouts.map((payout) => payout.wallet)).size !== input.payouts.length) throw new Error('Duplicate payout wallet.');
    if (input.payouts.reduce((sum, payout) => sum + BigInt(payout.amountRewardUnits), 0n) !== BigInt(input.totalRewardUnits)) throw new Error('Payout total does not match the manifest.');
    if (input.treasurySnapshotUnits !== undefined && BigInt(input.totalRewardUnits) !== BigInt(input.treasurySnapshotUnits) / 2n) throw new Error('Payout must equal half the treasury snapshot.');
    const previous = await env.DB.prepare('SELECT id, distribution_hash FROM epochs WHERE id BETWEEN ? AND ? AND distribution_hash IS NOT NULL').bind(covered[0], input.epochId).all<{ id: number; distribution_hash: string }>();
    if (previous.results.some(row => row.distribution_hash !== input.manifestHash)) throw new Error('A covered round is bound to another settlement.');
    const priorPayout = await env.DB.prepare('SELECT epoch_id FROM epoch_payouts WHERE epoch_id BETWEEN ? AND ? AND tx_hash IS NOT NULL AND paid_at IS NOT NULL LIMIT 1').bind(covered[0], input.epochId).first<{epoch_id:number}>();
    if (priorPayout && (priorPayout.epoch_id !== input.epochId || !previous.results.some(row => row.id === input.epochId && row.distribution_hash === input.manifestHash))) throw new Error('A covered round has already been paid.');
    const now = Date.now();
    const statements = [];
    for (const id of covered.slice(0, -1)) statements.push(env.DB.prepare(
      `INSERT INTO epochs (id, status, model, submission_count, eligible_count, total_points, reward_budget_wei, vault_balance_wei, distribution_status, distribution_hash, opened_at, scored_at, distributed_at)
       VALUES (?, 'scored', ?, 0, 0, 0, '0', '0', 'keeper_reported', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET distribution_status = 'keeper_reported', distribution_hash = excluded.distribution_hash, distributed_at = excluded.distributed_at`,
    ).bind(id, input.treasurySnapshotUnits !== undefined ? 'muse-half-treasury-v1' : 'muse-pooled-rounds-v1', input.manifestHash, await roundStartedAt(id), now, now));
    statements.push(env.DB.prepare(
      `INSERT INTO epochs (id, status, model, submission_count, eligible_count, total_points, reward_budget_wei, vault_balance_wei, distribution_status, distribution_tx_hash, distribution_hash, opened_at, scored_at, distributed_at)
       VALUES (?, 'scored', ?, 0, ?, ?, ?, ?, 'keeper_reported', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET reward_budget_wei = excluded.reward_budget_wei,
         vault_balance_wei = excluded.vault_balance_wei, distribution_status = 'keeper_reported',
         distribution_tx_hash = COALESCE(excluded.distribution_tx_hash, epochs.distribution_tx_hash), distribution_hash = excluded.distribution_hash,
         distributed_at = excluded.distributed_at`,
    ).bind(input.epochId, input.treasurySnapshotUnits !== undefined ? 'muse-half-treasury-v1' : 'muse-rewards-v1', input.payouts.length, input.payouts.reduce((sum, payout) => sum + payout.score, 0), input.totalRewardUnits, input.treasurySnapshotUnits ?? input.totalRewardUnits, input.commitTxHash, input.manifestHash, await roundStartedAt(input.epochId), now, now));
    for (const payout of input.payouts) {
      statements.push(env.DB.prepare(
        `INSERT INTO epoch_payouts (id, epoch_id, wallet, score, allocation_ppm, amount_wei, status, tx_hash, created_at, paid_at)
         VALUES (?, ?, ?, ?, 0, ?, 'keeper_reported', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = 'keeper_reported', tx_hash = COALESCE(excluded.tx_hash, epoch_payouts.tx_hash),
           paid_at = excluded.paid_at`,
      ).bind(`${input.epochId}:${payout.index}`, input.epochId, payout.wallet, payout.score, payout.amountRewardUnits, payout.txHash, now, now));
    }
    await env.DB.batch(statements);
    return NextResponse.json({ ok: true, status: 'keeper_reported', payoutCount: input.payouts.length, coveredEpochIds: covered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement report rejected.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
