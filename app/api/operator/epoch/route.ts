import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isOperatorRequest, isKeeperRequest } from '@/lib/operator-auth';
import { settleEpoch } from '@/lib/scoring';
import { distributeEpochRewards } from '@/lib/rewards';

const bodySchema = z.object({ epochId: z.number().int().nonnegative() });

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request)) && !(await isKeeperRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const { epochId } = bodySchema.parse(await request.json());
    const scored = await settleEpoch(epochId);
    if (!['scored', 'empty'].includes(scored.status)) {
      return NextResponse.json({ ok: false, error: 'Round scoring is not complete. Retry later.', scored }, { status: 409 });
    }
    const distribution = await distributeEpochRewards(epochId);
    return NextResponse.json({ ok: true, scored, distribution });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Round processing failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
