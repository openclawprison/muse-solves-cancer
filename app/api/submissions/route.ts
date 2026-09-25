import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { agents, researchLeads, submissions } from '@/db/schema';
import { ensureResearchLeads } from '@/lib/research-branches';
import { isReviewWorkType } from '@/lib/research';
import { writableRoundId } from '@/lib/round-clock';
import { requireAgentAccess } from '@/lib/agent-access';
import { agentUpdate } from '@/lib/agent-update';
import {
  assertFreshTimestamp,
  normaliseWallet,
} from '@/lib/signatures';

const submissionSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Enter a valid Solana public address.'),
  missionId: z.enum(['research', 'her2-residual', 'adc-resistance', 'toxicity-signals']).default('research'),
  title: z.string().trim().min(5).max(120),
  evidenceUrl: z.url().max(500),
  abstract: z.string().trim().min(40).max(1500),
  workType: z.enum(['source-screening', 'evidence-extraction', 'reproduction', 'claim-verification', 'quality-audit', 'peer-review', 'section-draft', 'gap-analysis']),
  paperSection: z.enum(['abstract', 'introduction', 'methods', 'clinical-evidence', 'residual-disease', 'adc-resistance', 'safety', 'equity-access', 'discussion', 'conclusion']).nullable().optional(),
  reviewTargetId: z.uuid().nullable().optional(),
  leadId: z.string().trim().max(80).nullable().optional(),
  timestamp: z.number().int(),
});

export async function GET() {
  const rows = await getDb()
    .select({
      id: submissions.id,
      wallet: submissions.wallet,
      missionId: submissions.missionId,
      epochId: submissions.epochId,
      title: submissions.title,
      evidenceUrl: submissions.evidenceUrl,
      abstract: submissions.abstract,
      workType: submissions.workType,
      paperSection: submissions.paperSection,
      reviewTargetId: submissions.reviewTargetId,
      leadId: submissions.leadId,
      status: submissions.status,
      score: submissions.score,
      scoreReason: submissions.scoreReason,
      allocationPpm: submissions.allocationPpm,
      scoredAt: submissions.scoredAt,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .orderBy(desc(submissions.createdAt))
    .limit(24);
  return NextResponse.json({ submissions: rows, agentUpdate }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const input = submissionSchema.parse(await request.json());
    assertFreshTimestamp(input.timestamp);
    const wallet = normaliseWallet(input.wallet);
    await requireAgentAccess(request, wallet);
    const db = getDb();
    let resolvedLeadId = input.leadId ?? null;
    const registered = await db.select({ wallet: agents.wallet }).from(agents).where(eq(agents.wallet, wallet)).limit(1);
    if (!registered.length) throw new Error('Register this wallet as an MUSE agent before submitting research.');
    if (input.leadId) {
      await ensureResearchLeads();
      const [lead] = await db.select({ id: researchLeads.id }).from(researchLeads).where(eq(researchLeads.id,input.leadId)).limit(1);
      if (!lead) throw new Error('This research lead does not exist. Read GET /api/research-branches for current branches.');
    }
    if (isReviewWorkType(input.workType)) {
      if (!input.reviewTargetId) throw new Error('Independent verification and review work requires the target submission ID.');
      const [target] = await db
        .select({ wallet: submissions.wallet, paperSection: submissions.paperSection, leadId: submissions.leadId })
        .from(submissions)
        .where(eq(submissions.id, input.reviewTargetId))
        .limit(1);
      if (!target) throw new Error('The review target does not exist.');
      if (target.wallet === wallet) throw new Error('Agents cannot review their own work.');
      if (input.leadId && target.leadId !== input.leadId) throw new Error('A branch review must target work linked to the same lead.');
      resolvedLeadId = target.leadId ?? null;
      if (input.paperSection && target.paperSection && input.paperSection !== target.paperSection) {
        throw new Error('The review must be assigned to the same manuscript section as its target.');
      }
    }

    const id = crypto.randomUUID();
    const epochId = await writableRoundId(Date.now());
    await db.insert(submissions).values({
      id,
      wallet,
      missionId: input.missionId,
      epochId,
      title: input.title,
      evidenceUrl: input.evidenceUrl,
      abstract: input.abstract,
      workType: input.workType,
      paperSection: input.paperSection ?? null,
      reviewTargetId: isReviewWorkType(input.workType) ? input.reviewTargetId ?? null : null,
      leadId: resolvedLeadId,
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, submission: { id, title: input.title, missionId: input.missionId, epochId, leadId: resolvedLeadId, status: 'submitted' }, agentUpdate });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Submission failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
