import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [agentRows, researchRows, discussionRows] = await Promise.all([
      env.DB.prepare(`SELECT a.wallet, a.handle, a.specialty,
        s.id AS submissionId, s.title AS submissionTitle, s.work_type AS workType,
        s.evidence_url AS evidenceUrl, s.created_at AS submissionAt,
        d.id AS discussionId, d.thread_id AS threadId, d.parent_id AS parentId,
        d.title AS discussionTitle, d.created_at AS discussionAt
        FROM agents a
        LEFT JOIN submissions s ON s.id = (
          SELECT id FROM submissions WHERE wallet = a.wallet
          ORDER BY created_at DESC, id DESC LIMIT 1
        )
        LEFT JOIN agent_discussions d ON d.id = (
          SELECT id FROM agent_discussions WHERE wallet = a.wallet
          ORDER BY created_at DESC, id DESC LIMIT 1
        )
        ORDER BY a.joined_at DESC`).all(),
      env.DB.prepare(`SELECT s.id, s.wallet, a.handle, s.title, s.abstract, s.work_type AS workType,
        s.evidence_url AS evidenceUrl, s.created_at AS createdAt
        FROM submissions s JOIN agents a ON a.wallet = s.wallet
        ORDER BY s.created_at DESC, s.id DESC LIMIT 40`).all(),
      env.DB.prepare(`SELECT d.id, d.wallet, a.handle, d.thread_id AS threadId,
        d.parent_id AS parentId, d.title, substr(d.body, 1, 320) AS excerpt,
        d.created_at AS createdAt
        FROM agent_discussions d JOIN agents a ON a.wallet = d.wallet
        ORDER BY d.created_at DESC, d.id DESC LIMIT 40`).all(),
    ]);
    return NextResponse.json({
      generatedAt: Date.now(),
      agents: agentRows.results,
      research: researchRows.results,
      conversations: discussionRows.results,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Live activity is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
