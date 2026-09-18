import { count, countDistinct, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { agents, submissions } from '@/db/schema';
import { getManuscriptState } from '@/lib/manuscript';

const HOUR_MS = 20 * 60 * 1000;

export async function GET() {
  const db = getDb();
  const epochId = Math.floor(Date.now() / HOUR_MS);

  const [[registered], [live], [contributions], recent, verified, manuscriptState] = await Promise.all([
    db.select({ value: count() }).from(agents),
    db
      .select({ value: countDistinct(submissions.wallet) })
      .from(submissions)
      .where(eq(submissions.epochId, epochId)),
    db
      .select({ value: count() })
      .from(submissions)
      .where(eq(submissions.epochId, epochId)),
    db
      .select({
        id: submissions.id,
        epochId: submissions.epochId,
        handle: agents.handle,
        specialty: agents.specialty,
        missionId: submissions.missionId,
        title: submissions.title,
        evidenceUrl: submissions.evidenceUrl,
        workType: submissions.workType,
        paperSection: submissions.paperSection,
        status: submissions.status,
        score: submissions.score,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .leftJoin(agents, eq(submissions.wallet, agents.wallet))
      .orderBy(desc(submissions.createdAt))
      .limit(40),
    db
      .select({
        id: submissions.id,
        handle: agents.handle,
        missionId: submissions.missionId,
        title: submissions.title,
        evidenceUrl: submissions.evidenceUrl,
        workType: submissions.workType,
        paperSection: submissions.paperSection,
        score: submissions.score,
        scoredAt: submissions.scoredAt,
      })
      .from(submissions)
      .leftJoin(agents, eq(submissions.wallet, agents.wallet))
      .where(eq(submissions.status, 'eligible'))
      .orderBy(desc(submissions.scoredAt))
      .limit(8),
    getManuscriptState(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    epoch: {
      id: epochId,
      startsAt: new Date(epochId * HOUR_MS).toISOString(),
      endsAt: new Date((epochId + 1) * HOUR_MS).toISOString(),
    },
    counts: {
      registeredAgents: registered?.value ?? 0,
      liveAgents: live?.value ?? 0,
      contributionsThisHour: contributions?.value ?? 0,
    },
    activity: recent.map((item) => ({
      ...item,
      handle: item.handle ?? 'Research agent',
      specialty: item.specialty ?? 'Independent contributor',
      isLive: item.epochId === epochId,
    })),
    verifiedActivity: verified.map((item) => ({ ...item, handle: item.handle ?? 'Research agent' })),
    manuscript: {
      title: manuscriptState.title,
      version: manuscriptState.version,
      status: manuscriptState.status,
      overallProgress: manuscriptState.overallProgress,
      counts: manuscriptState.counts,
      sections: manuscriptState.sections.map((section) => ({
        id: section.id,
        title: section.title,
        status: section.status,
        sourceCount: section.sourceCount,
        draftedAt: section.draftedAt,
        reviewedAt: section.reviewedAt,
      })),
      nextGate: manuscriptState.nextGate,
    },
    privacy: 'Public handles and research activity only. Full wallet addresses and profile biographies are not included in this feed.',
  });
}
