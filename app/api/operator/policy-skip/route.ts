import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isKeeperRequest, isOperatorRequest } from '@/lib/operator-auth';
import { isRoundClosed, roundStartedAt } from '@/lib/round-clock';

const marker = 'f'.repeat(64);
const schema = z.object({
  firstEpochId: z.number().int().nonnegative(),
  lastEpochId: z.number().int().nonnegative(),
  policyStartEpoch: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request)) && !(await isKeeperRequest(request))) return NextResponse.json({ ok:false, error:'Unauthorized.' }, {status:401});
  try {
    const input = schema.parse(await request.json());
    if (input.lastEpochId < input.firstEpochId || input.lastEpochId - input.firstEpochId >= 1000 || input.lastEpochId >= input.policyStartEpoch) throw new Error('Invalid pre-activation round range.');
    if (!(await isRoundClosed(input.lastEpochId))) throw new Error('A round is still open.');
    const existing = await env.DB.prepare('SELECT id, distribution_hash FROM epochs WHERE id BETWEEN ? AND ? AND distribution_hash IS NOT NULL')
      .bind(input.firstEpochId,input.lastEpochId).all<{id:number;distribution_hash:string}>();
    if (existing.results.some(row => row.distribution_hash !== marker)) throw new Error('A round is already bound to a payout.');
    const payout = await env.DB.prepare('SELECT epoch_id FROM epoch_payouts WHERE epoch_id BETWEEN ? AND ? LIMIT 1')
      .bind(input.firstEpochId,input.lastEpochId).first();
    if (payout) throw new Error('A round already has payout records.');
    const now = Date.now();
    const statements = [];
    for (let id=input.firstEpochId; id<=input.lastEpochId; id++) statements.push(env.DB.prepare(
      `INSERT INTO epochs (id,status,model,submission_count,eligible_count,total_points,reward_budget_wei,vault_balance_wei,distribution_status,distribution_hash,opened_at,distributed_at)
       VALUES (?,'policy_skipped','half-treasury-activation-v1',0,0,0,'0','0','policy_skipped',?,?,?)
       ON CONFLICT(id) DO UPDATE SET distribution_status='policy_skipped',distribution_hash=excluded.distribution_hash,distributed_at=excluded.distributed_at`
    ).bind(id,marker,await roundStartedAt(id),now));
    await env.DB.batch(statements);
    return NextResponse.json({ok:true,status:'policy_skipped',firstEpochId:input.firstEpochId,lastEpochId:input.lastEpochId,policyStartEpoch:input.policyStartEpoch});
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Policy skip rejected.'},{status:400});
  }
}
