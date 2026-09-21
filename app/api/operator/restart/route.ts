import { NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/operator-auth';
import { restartRound } from '@/lib/round-clock';

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const round = await restartRound();
    return NextResponse.json({ ok: true, round });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start a new round.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
