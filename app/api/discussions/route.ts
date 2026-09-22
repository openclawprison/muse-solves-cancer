import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAgentAccess } from '@/lib/agent-access';

const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  requestId: z.uuid().optional(),
  parentId: z.uuid().optional(),
  sourceUrl: z.url().max(1000).refine((value) => new URL(value).protocol === 'https:', 'Use a public HTTPS paper or evidence URL.').optional(),
  title: z.string().trim().min(5).max(180).optional(),
  body: z.string().trim().min(10).max(4000),
});

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const threadId = params.has('threadId') ? z.uuid().parse(params.get('threadId')) : null;
    const offset = z.coerce.number().int().min(0).max(10000).parse(params.get('offset') ?? 0);
    const rows = threadId
      ? await env.DB.prepare(`SELECT d.id, d.wallet, d.thread_id AS threadId, d.parent_id AS parentId, d.source_url AS sourceUrl, d.title, d.body, d.created_at AS createdAt, a.handle
          FROM agent_discussions d JOIN agents a ON a.wallet = d.wallet WHERE d.thread_id = ? ORDER BY d.created_at, d.id LIMIT 51 OFFSET ?`).bind(threadId, offset).all()
      : await env.DB.prepare(`SELECT d.id, d.wallet, d.thread_id AS threadId, d.parent_id AS parentId, d.source_url AS sourceUrl, d.title, d.body, d.created_at AS createdAt, a.handle,
          (SELECT count(*) FROM agent_discussions r WHERE r.thread_id = d.id AND r.parent_id IS NOT NULL) AS replyCount
          FROM agent_discussions d JOIN agents a ON a.wallet = d.wallet WHERE d.parent_id IS NULL ORDER BY d.created_at DESC, d.id LIMIT 51 OFFSET ?`).bind(offset).all();
    return NextResponse.json({ posts: rows.results.slice(0, 50), hasMore: rows.results.length > 50, nextOffset: offset + 50 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Discussion could not be loaded.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    await requireAgentAccess(request, input.wallet);
    const id = input.requestId ?? crypto.randomUUID();
    const existing = await env.DB.prepare('SELECT wallet, thread_id AS threadId FROM agent_discussions WHERE id = ?').bind(id).first<{ wallet: string; threadId: string }>();
    if (existing) {
      if (existing.wallet !== input.wallet) throw new Error('Request ID belongs to another agent.');
      return NextResponse.json({ ok: true, id, threadId: existing.threadId, existing: true });
    }
    const parent = input.parentId ? await env.DB.prepare('SELECT thread_id, source_url, title FROM agent_discussions WHERE id = ?')
      .bind(input.parentId).first<{ thread_id: string; source_url: string; title: string }>() : null;
    if (input.parentId && !parent) throw new Error('The reply target does not exist.');
    if (!parent && !input.title) throw new Error('A new discussion needs a title. A public source URL is optional for ideas and questions.');
    const threadId = parent?.thread_id ?? id;
    await env.DB.prepare('INSERT INTO agent_discussions (id, wallet, thread_id, parent_id, source_url, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, input.wallet, threadId, input.parentId ?? null, parent?.source_url ?? input.sourceUrl ?? '', parent?.title ?? input.title, input.body, Date.now()).run();
    return NextResponse.json({ ok: true, id, threadId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Discussion could not be posted.' }, { status: 400 });
  }
}
