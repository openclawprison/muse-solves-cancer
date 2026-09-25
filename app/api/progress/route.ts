import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { roundClock } from '@/lib/round-clock';

export const dynamic = 'force-dynamic';

type Row = { id: number; status: string; distribution_status: string | null; submitted: number; reviewed: number; paid_recipients: number; total_batches: number; completed_batches: number };

export async function GET() {
  try {
    const clock = await roundClock();
    const latestClosed = clock.latestClosedEpoch;
    const first = Math.max(0, latestClosed - 5);
    const rows = await env.DB.prepare(`SELECT e.id,e.status,e.distribution_status,
      (SELECT COUNT(*) FROM submissions s WHERE s.epoch_id=e.id) AS submitted,
      (SELECT COUNT(*) FROM submissions s WHERE s.epoch_id=e.id AND s.scored_at IS NOT NULL) AS reviewed,
      (SELECT COUNT(*) FROM epoch_payouts p WHERE p.epoch_id=e.id AND p.tx_hash IS NOT NULL AND p.paid_at IS NOT NULL) AS paid_recipients,
      (SELECT COUNT(*) FROM scoring_batches b WHERE b.epoch_id=e.id) AS total_batches,
      (SELECT COUNT(*) FROM scoring_batches b WHERE b.epoch_id=e.id AND b.scores_json IS NOT NULL) AS completed_batches
      FROM epochs e WHERE e.id BETWEEN ? AND ? ORDER BY e.id DESC`).bind(first, latestClosed).all<Row>();
    const byId = new Map(rows.results.map(row => [row.id, row]));
    const ids = Array.from({ length: latestClosed - first + 1 }, (_, index) => latestClosed - index);
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) {
      const counts = await env.DB.batch(missing.map(id => env.DB.prepare('SELECT COUNT(*) AS submitted FROM submissions WHERE epoch_id=?').bind(id)));
      for (let index = 0; index < missing.length; index++) byId.set(missing[index], {
        id: missing[index], status: 'queued', distribution_status: null, submitted: Number((counts[index].results[0] as {submitted?: number})?.submitted ?? 0),
        reviewed: 0, paid_recipients: 0, total_batches: 0, completed_batches: 0,
      });
    }
    const paid = await env.DB.prepare('SELECT MAX(epoch_id) AS id FROM epoch_payouts WHERE tx_hash IS NOT NULL AND paid_at IS NOT NULL').first<{ id: number | null }>();
    const skipped = paid?.id == null ? null : await env.DB.prepare(`SELECT COUNT(*) AS count FROM epochs
      WHERE id > ? AND id <= ? AND distribution_status = 'policy_skipped'`).bind(paid.id, latestClosed).first<{count:number}>();
    const coverage = paid?.id == null ? null : await env.DB.prepare(`SELECT MIN(id) AS first, MAX(id) AS last, COUNT(*) AS count FROM epochs
      WHERE distribution_hash = (SELECT distribution_hash FROM epochs WHERE id = ?) AND distribution_status = 'keeper_reported'`).bind(paid.id).first<{first:number|null;last:number|null;count:number}>();
    return NextResponse.json({ updatedAt: Date.now(), currentRound: clock.id, phase: clock.phase, latestClosedRound: latestClosed,
      lastReportedPaymentRound: paid?.id ?? null,
      lastPaymentCoverage: coverage?.first == null ? null : {first:coverage.first,last:coverage.last,count:coverage.count},
      closedRoundsSinceLastPayment: paid?.id == null ? null : Math.max(0, latestClosed - paid.id - (skipped?.count ?? 0)),
      rounds: ids.map(id => { const row = byId.get(id)!; return {
        id, submitted: row.submitted, reviewed: row.reviewed, paidRecipients: row.paid_recipients,
        totalBatches: row.total_batches, completedBatches: row.completed_batches,
        stage: row.distribution_status === 'keeper_reported' ? 'Payments reported'
          : row.distribution_status === 'policy_skipped' ? 'Pre-activation round · no payout'
          : row.status === 'failed' ? 'Scoring retry / review needed'
          : row.status === 'scoring' ? 'Reviewing submissions'
          : row.status === 'awaiting_ai' ? 'Waiting for scoring service'
          : row.status === 'empty' ? 'No submissions'
          : row.status === 'scored' ? 'Scored · awaiting funded payout'
          : 'Queued for scoring',
        blocked: row.status === 'failed' && row.distribution_status !== 'keeper_reported' && row.distribution_status !== 'policy_skipped',
      }; }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Progress temporarily unavailable' }, { status: 503 }); }
}
