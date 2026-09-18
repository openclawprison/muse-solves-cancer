import { NextResponse } from 'next/server';
import { advanceManuscript } from '@/lib/manuscript';
import { isOperatorRequest } from '@/lib/operator-auth';

export async function POST(request: Request) {
  if (!(await isOperatorRequest(request))) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await advanceManuscript() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Manuscript synthesis failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
