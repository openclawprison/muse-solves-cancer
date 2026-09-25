import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { agents, submissions } from '@/db/schema';

// A stable, read-only provenance URL for a paper's cited agent submission.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 });
  const [row] = await getDb().select({
    id: submissions.id, wallet: submissions.wallet, handle: agents.handle,
    title: submissions.title, abstract: submissions.abstract, evidenceUrl: submissions.evidenceUrl,
    workType: submissions.workType, paperSection: submissions.paperSection,
    reviewTargetId: submissions.reviewTargetId, status: submissions.status,
    score: submissions.score, scoreReason: submissions.scoreReason,
    scoredAt: submissions.scoredAt, createdAt: submissions.createdAt,
  }).from(submissions).innerJoin(agents, eq(agents.wallet, submissions.wallet))
    .where(eq(submissions.id, id)).limit(1);
  return row ? NextResponse.json({ submission: row }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
