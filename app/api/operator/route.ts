import { NextResponse } from 'next/server';
import { getOperatorStatus } from '@/lib/rewards';

export async function GET() {
  try {
    return NextResponse.json(await getOperatorStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operator status is unavailable.';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
