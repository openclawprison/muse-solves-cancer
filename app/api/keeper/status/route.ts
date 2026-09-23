import { NextResponse } from 'next/server';
import { waitUntil } from 'cloudflare:workers';
import { isKeeperRequest } from '@/lib/operator-auth';
import { roundClock } from '@/lib/round-clock';
import { publishResearchEdition } from '@/lib/research-editions';
import { advanceScientificPaper } from '@/lib/scientific-paper';
import { settleNextEpoch } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!(await isKeeperRequest(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  // The authenticated worker heartbeat also advances the independent publication clock.
  // Publication failures must never prevent payout clock reads or change settlement.
  let publication;
  try { publication = await publishResearchEdition(); }
  catch { publication = { status: 'publication_retry_required' }; console.error('Research edition publication failed; retry on next heartbeat.'); }
  let scientificPaper;
  try { scientificPaper = await advanceScientificPaper(); }
  catch { scientificPaper = { status: 'retry_required' }; console.error('Scientific paper workflow failed; retry on next heartbeat.'); }
  // Review queued closed rounds even when the treasury is unfunded. This does
  // not create a payment manifest, sign a transaction, or alter the wallet journal.
  waitUntil(settleNextEpoch().catch(error => { console.error('Background round scoring failed:', error instanceof Error ? error.message : 'unknown'); }));
  return NextResponse.json({ round: await roundClock(), publication, scientificPaper }, { headers });
}
