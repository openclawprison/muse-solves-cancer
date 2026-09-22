import { NextResponse } from 'next/server';
import { getManuscriptState } from '@/lib/manuscript';
import { summarizeResearch } from '@/lib/research-summary';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(summarizeResearch(await getManuscriptState()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Research summary is temporarily unavailable.' }, { status: 503 });
  }
}
