import { NextResponse } from 'next/server';
import { runHourlyRewardCycle } from '@/lib/rewards';
import { isOperatorRequest } from '@/lib/operator-auth';

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const cycle = await runHourlyRewardCycle();
    return NextResponse.json({ ok: true, cycle });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The 20-minute reward cycle failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
