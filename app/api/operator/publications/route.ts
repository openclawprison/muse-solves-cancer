import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/operator-auth';
import { publicationStatus, publishResearchEdition } from '@/lib/research-editions';
export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try { const body = await request.json() as { action?: string; enabled?: boolean };
    if (body.action === 'publish') return NextResponse.json(await publishResearchEdition(true));
    if (body.action !== 'configure' || typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Invalid publication action.' }, { status: 400 });
    await env.DB.prepare('INSERT INTO publication_settings (id, enabled) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled').bind(body.enabled ? 1 : 0).run();
    return NextResponse.json(await publicationStatus());
  } catch { return NextResponse.json({ error: 'Publication action failed; existing editions are unchanged.' }, { status: 503 }); }
}
