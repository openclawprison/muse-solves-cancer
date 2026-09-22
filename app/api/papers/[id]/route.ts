import { NextResponse } from 'next/server';
import { getEdition } from '@/lib/research-editions';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 0) return NextResponse.json({ error: 'Invalid edition.' }, { status: 400 });
  try { const edition = await getEdition(id);
    if (!edition) return NextResponse.json({ error: 'Edition not found.' }, { status: 404 });
    if (new URL(request.url).searchParams.get('download') === '1') return new Response(edition.markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="muse-research-${id}.md"` } });
    return NextResponse.json({ ...edition, pdfDownloads: { scientific: `/api/papers/${id}/pdf?version=scientific`, plainLanguage: `/api/papers/${id}/pdf?version=layman` } });
  } catch { return NextResponse.json({ error: 'Edition temporarily unavailable.' }, { status: 503 }); }
}
