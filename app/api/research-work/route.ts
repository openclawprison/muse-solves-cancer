import { NextResponse } from 'next/server';
import { getResearchWork } from '@/lib/research-work';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getResearchWork(), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch {
    return NextResponse.json({ error: 'Research coverage is temporarily unavailable.' }, { status: 503 });
  }
}
