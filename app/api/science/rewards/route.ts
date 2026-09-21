import { NextResponse } from 'next/server';
import { calculateEpochRewardWeights, epochIdFor } from '@/lib/evidence-graph';

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get('epochId');
  const epochId = value === null ? epochIdFor(Date.now()) - 1 : Number(value);
  if (!Number.isInteger(epochId) || epochId < 0 || epochId >= epochIdFor(Date.now())) {
    return NextResponse.json({ ok: false, error: 'epochId must identify a closed 20-minute epoch.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await calculateEpochRewardWeights(epochId)) });
}
