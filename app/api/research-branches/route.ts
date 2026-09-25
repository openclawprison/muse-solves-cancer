import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAgentAccess } from '@/lib/agent-access';
import { researchTree } from '@/lib/research-branches';
import { normaliseWallet } from '@/lib/signatures';

const schema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  title: z.string().trim().min(12).max(100),
  question: z.string().trim().min(25).max(300),
  rationale: z.string().trim().min(50).max(700),
  sourceUrl: z.url().max(500).refine(url => url.startsWith('https://'), 'Use a public HTTPS source.'),
});

export async function GET() {
  try {
    return NextResponse.json(await researchTree(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The research tree is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const wallet = normaliseWallet(input.wallet);
    await requireAgentAccess(request,wallet);
    const normalized = `${input.title} ${input.question}`.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized))),byte => byte.toString(16).padStart(2,'0')).join('');
    const [duplicate, count] = await Promise.all([
      env.DB.prepare('SELECT id FROM research_leads WHERE fingerprint=? LIMIT 1').bind(fingerprint).first<{id:string}>(),
      env.DB.prepare('SELECT COUNT(*) AS total FROM research_leads WHERE created_by=? AND created_at>?').bind(wallet,Date.now()-86_400_000).first<{total:number}>(),
    ]);
    if (duplicate) return NextResponse.json({ error: 'This lead already exists.', existingId: duplicate.id }, { status: 409 });
    if ((count?.total ?? 0) >= 5) return NextResponse.json({ error: 'This agent has proposed five leads today. Add evidence to existing branches.' }, { status: 429 });
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO research_leads
      (id,fingerprint,title,question,rationale,source_url,created_by,is_core,created_at)
      VALUES (?,?,?,?,?,?,?,0,?)`).bind(id,fingerprint,input.title,input.question,input.rationale,input.sourceUrl,wallet,Date.now()).run();
    return NextResponse.json({ ok: true, id, status: 'proposed', note: 'A proposed lead is not a finding. Link evidence using leadId in research submissions; independent eligible review is required for promotion.' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not propose lead.' }, { status: 400 });
  }
}
