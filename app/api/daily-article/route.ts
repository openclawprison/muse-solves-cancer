import { NextResponse } from 'next/server';
import { latestDailyResearchArticle } from '@/lib/daily-article';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ article: await latestDailyResearchArticle() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Daily article is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
