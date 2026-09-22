import { getEdition } from '@/lib/research-editions';
import { renderPaperPdf } from '@/lib/paper-pdf.mjs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const variant = new URL(request.url).searchParams.get('version') ?? 'scientific';
  if (!Number.isSafeInteger(id) || id < 0 || !['scientific','layman'].includes(variant)) return Response.json({ error: 'Invalid paper or version.' }, { status: 400 });
  try {
    const edition = await getEdition(id);
    if (!edition) return Response.json({ error: 'Paper not found.' }, { status: 404 });
    const bytes = await renderPaperPdf(edition, variant);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="muse-${id}-${variant}.pdf"`, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'PDF temporarily unavailable. Please retry.' }, { status: 503 }); }
}
