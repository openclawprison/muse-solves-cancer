import { NextResponse } from 'next/server';
import { editionArchive } from '@/lib/research-editions';
export async function GET(request: Request) {
  try { const before = Number(new URL(request.url).searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 0) return NextResponse.json({ error: 'Invalid archive cursor.' }, { status: 400 });
    return NextResponse.json(await editionArchive(before), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Publication archive temporarily unavailable.' }, { status: 503 }); }
}
