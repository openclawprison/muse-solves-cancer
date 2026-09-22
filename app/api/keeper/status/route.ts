import { NextResponse } from 'next/server';
import { isKeeperRequest } from '@/lib/operator-auth';
import { roundClock } from '@/lib/round-clock';
import { publishResearchEdition } from '@/lib/research-editions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!(await isKeeperRequest(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  // The authenticated worker heartbeat also advances the independent publication clock.
  // Publication failures must never prevent payout clock reads or change settlement.
  let publication;
  try { publication = await publishResearchEdition(); }
  catch { publication = { status: 'publication_retry_required' }; console.error('Research edition publication failed; retry on next heartbeat.'); }
  return NextResponse.json({ round: await roundClock(), publication }, { headers });
}
