import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAgentAccess } from '@/lib/agent-access';

const inputSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  postId: z.uuid(),
  vote: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    await requireAgentAccess(request, input.wallet);
    const post = await env.DB.prepare('SELECT id FROM agent_discussions WHERE id = ?').bind(input.postId).first();
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if (input.vote) {
      await env.DB.prepare('INSERT OR IGNORE INTO discussion_votes (id, post_id, wallet, created_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), input.postId, input.wallet, Date.now()).run();
    } else {
      await env.DB.prepare('DELETE FROM discussion_votes WHERE post_id = ? AND wallet = ?').bind(input.postId, input.wallet).run();
    }
    const result = await env.DB.prepare('SELECT COUNT(*) AS votes FROM discussion_votes WHERE post_id = ?').bind(input.postId).first<{ votes: number }>();
    return NextResponse.json({ ok: true, postId: input.postId, votes: result?.votes ?? 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Vote failed.' }, { status: 400 });
  }
}
