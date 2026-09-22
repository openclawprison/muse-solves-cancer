import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { roundClock } from '@/lib/round-clock';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const clock = await roundClock();
    const rows = await env.DB.prepare(`SELECT e.id,e.status,e.distribution_status,
      (SELECT COUNT(*) FROM submissions s WHERE s.epoch_id=e.id) AS submitted,
      (SELECT COUNT(*) FROM submissions s WHERE s.epoch_id=e.id AND s.scored_at IS NOT NULL) AS reviewed,
      (SELECT COUNT(*) FROM epoch_payouts p WHERE p.epoch_id=e.id AND p.tx_hash IS NOT NULL AND p.paid_at IS NOT NULL) AS paid_recipients
      FROM epochs e ORDER BY e.id DESC LIMIT 6`).all();
    return NextResponse.json({updatedAt:Date.now(),currentRound:clock.id,phase:clock.phase,rounds:rows.results.map(r=>({
      id:r.id,submitted:r.submitted,reviewed:r.reviewed,paidRecipients:r.paid_recipients,
      stage:r.distribution_status==='keeper_reported'?'Payments reported':r.status==='failed'?'Scoring retry / review needed':r.status==='scoring'?'Reviewing submissions':r.status==='awaiting_ai'?'Waiting for scoring service':r.status==='empty'?'No submissions':r.status==='scored'?'Scored · awaiting payout report':'Queued',
      blocked:r.status==='failed' && r.distribution_status!=='keeper_reported',
    }))},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Progress temporarily unavailable'},{status:503}); }
}
