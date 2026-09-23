import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { latestScientificPaper } from '@/lib/scientific-paper';
export const dynamic = 'force-dynamic';
export async function GET() {
  const paper = await latestScientificPaper();
  const working = await env.DB.prepare('SELECT edition_id,status,stage,updated_at FROM scientific_papers ORDER BY edition_id DESC LIMIT 1').first();
  return NextResponse.json({ paper, working }, { headers: { 'Cache-Control': 'no-store' } });
}
