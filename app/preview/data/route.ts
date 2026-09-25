import { NextResponse } from 'next/server';
import { getPreviewData } from '../preview-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getPreviewData(), { headers: { 'Cache-Control': 'no-store' } });
}
