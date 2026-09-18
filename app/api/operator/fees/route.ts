import { NextResponse } from 'next/server';
import { collectCreatorFees } from '@/lib/rewards';
import { isOperatorRequest } from '@/lib/operator-auth';

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, fees: await collectCreatorFees() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Solana fee sweep failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
