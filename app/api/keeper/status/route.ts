import { NextResponse } from 'next/server';
import { isKeeperRequest } from '@/lib/operator-auth';
import { roundClock } from '@/lib/round-clock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!(await isKeeperRequest(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  return NextResponse.json({ round: await roundClock() }, { headers });
}
