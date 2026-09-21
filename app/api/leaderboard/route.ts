import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { agents, epochPayouts, epochs, rewardEvents, submissions } from '@/db/schema';

const HOUR_MS = 20 * 60 * 1000;

export async function GET() {
  const currentEpoch = Math.floor(Date.now() / HOUR_MS);
  const db = getDb();
  const [latestSubmission, latestScience] = await Promise.all([
    db.select({ epochId: submissions.epochId }).from(submissions).orderBy(desc(submissions.epochId)).limit(1),
    db.select({ epochId: rewardEvents.epochId }).from(rewardEvents).orderBy(desc(rewardEvents.epochId)).limit(1),
  ]);
  const epochId = Math.max(latestSubmission[0]?.epochId ?? 0, latestScience[0]?.epochId ?? 0, currentEpoch);

  const [epoch] = await db.select().from(epochs).where(eq(epochs.id, epochId)).limit(1);
  const rows = await db
    .select({
      id: submissions.id,
      wallet: submissions.wallet,
      handle: agents.handle,
      missionId: submissions.missionId,
      title: submissions.title,
      evidenceUrl: submissions.evidenceUrl,
      workType: submissions.workType,
      paperSection: submissions.paperSection,
      status: submissions.status,
      score: submissions.score,
      scoreReason: submissions.scoreReason,
      allocationPpm: submissions.allocationPpm,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .leftJoin(agents, eq(submissions.wallet, agents.wallet))
    .orderBy(desc(submissions.score), desc(submissions.createdAt));
  const scienceRows = await db
    .select({
      id: rewardEvents.id,
      wallet: rewardEvents.wallet,
      handle: agents.handle,
      eventType: rewardEvents.eventType,
      objectId: rewardEvents.objectId,
      points: rewardEvents.points,
      epochId: rewardEvents.epochId,
    })
    .from(rewardEvents)
    .leftJoin(agents, eq(rewardEvents.wallet, agents.wallet))
    .orderBy(desc(rewardEvents.createdAt));

  const byWallet = new Map<
    string,
    {
      wallet: string;
      handle: string;
      score: number | null;
      allocationPpm: number;
      status: string;
      works: Array<{ id: string; title: string; missionId: string; evidenceUrl: string; workType: string; paperSection: string | null; score: number | null; reason: string | null }>;
    }
  >();
  for (const row of rows) {
    const item = byWallet.get(row.wallet) ?? {
      wallet: row.wallet,
      handle: row.handle ?? row.wallet,
      score: row.score === null ? null : 0,
      allocationPpm: 0,
      status: 'awaiting score',
      works: [],
    };
    if (row.score !== null) item.score = (item.score ?? 0) + row.score;
    item.allocationPpm += row.allocationPpm ?? 0;
    item.status = row.status;
    item.works.push({
      id: row.id,
      title: row.title,
      missionId: row.missionId,
      evidenceUrl: row.evidenceUrl,
      workType: row.workType,
      paperSection: row.paperSection,
      score: row.score,
      reason: row.scoreReason,
    });
    byWallet.set(row.wallet, item);
  }
  for (const row of scienceRows) {
    const item = byWallet.get(row.wallet) ?? {
      wallet: row.wallet,
      handle: row.handle ?? row.wallet,
      score: 0,
      allocationPpm: 0,
      status: 'verified science event',
      works: [],
    };
    item.score = (item.score ?? 0) + row.points;
    item.status = 'verified science event';
    item.works.push({
      id: row.id,
      title: row.eventType.replaceAll('-', ' '),
      missionId: 'machine-science',
      evidenceUrl: '/science',
      workType: row.eventType,
      paperSection: null,
      score: row.points,
      reason: `Deterministic ${row.eventType.replaceAll('-', ' ')} reward under the public machine-science rule set.`,
    });
    byWallet.set(row.wallet, item);
  }

  const leaderboard = [...byWallet.values()]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((item, index) => ({ rank: index + 1, ...item }));
  const payoutRows = await db.select().from(epochPayouts);
  const payoutsByWallet = new Map<string, { amountWei: bigint; status: string | null; txHash: string | null }>();
  for (const payout of payoutRows) {
    const key = payout.wallet.toLowerCase();
    const existing = payoutsByWallet.get(key) ?? { amountWei: 0n, status: null, txHash: null };
    existing.amountWei += BigInt(payout.amountWei);
    existing.status = payout.status;
    existing.txHash = payout.txHash;
    payoutsByWallet.set(key, existing);
  }
  const leaderboardWithPayouts = leaderboard.map((item) => {
    const payout = payoutsByWallet.get(item.wallet.toLowerCase());
    return {
      ...item,
      payoutAmountWei: payout ? payout.amountWei.toString() : null,
      payoutStatus: payout?.status ?? null,
      payoutTxHash: payout?.txHash ?? null,
    };
  });

  return NextResponse.json({
    epoch: {
      id: epochId,
      startsAt: new Date(epochId * HOUR_MS).toISOString(),
      endsAt: new Date((epochId + 1) * HOUR_MS).toISOString(),
      isOpen: epochId >= currentEpoch,
      status: epoch?.status ?? (epochId >= currentEpoch ? 'open' : 'awaiting settlement'),
      model: epoch?.model ?? null,
      submissionCount: rows.length,
      eligibleCount: epoch?.eligibleCount ?? 0,
      totalPoints: epoch?.totalPoints ?? 0,
      rewardBudgetWei: epoch?.rewardBudgetWei ?? null,
      distributionStatus: epoch?.distributionStatus ?? 'not_ready',
      distributionTxHash: epoch?.distributionTxHash ?? null,
    },
    leaderboard: leaderboardWithPayouts,
  });
}
