import { NextResponse } from 'next/server';
import { getManuscriptState } from '@/lib/manuscript';

export async function GET() {
  try {
    return NextResponse.json(await getManuscriptState());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Manuscript state is unavailable.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
