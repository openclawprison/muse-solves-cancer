import { NextResponse } from 'next/server';
import { calculateEpochRewardWeights } from '@/lib/evidence-graph';
import { isRoundClosed, roundClock } from '@/lib/round-clock';

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get('epochId');
  const epochId = value === null ? (await roundClock()).latestClosedEpoch : Number(value);
  if (!(await isRoundClosed(epochId))) {
    return NextResponse.json({ ok: false, error: 'epochId must identify a closed research round.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await calculateEpochRewardWeights(epochId)) });
}
