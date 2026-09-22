import { NextResponse } from 'next/server';
import { getOperatorStatus } from '@/lib/rewards';
import { isOperatorUser } from '@/lib/operator-auth';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET() {
  if (!(await isOperatorUser())) return NextResponse.json({ error: 'Operator access required.' }, { status: 401, headers: privateHeaders });
  try {
    return NextResponse.json(await getOperatorStatus(), { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operator status is unavailable.';
    return NextResponse.json({ status: 'error', error: message }, { status: 500, headers: privateHeaders });
  }
}
