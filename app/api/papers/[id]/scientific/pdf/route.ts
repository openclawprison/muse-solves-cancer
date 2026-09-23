import { getScientificPaper } from '@/lib/scientific-paper';
import { renderScientificPaperPdf } from '@/lib/scientific-paper-pdf.mjs';
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 0) return Response.json({ error: 'Invalid edition.' }, { status: 400 });
  const paper = await getScientificPaper(id);
  if (!paper) return Response.json({ error: 'Scientific paper is still being checked.' }, { status: 404 });
  try { const bytes = await renderScientificPaperPdf(paper); return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="muse-${id}-scientific.pdf"`, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } }); }
  catch { return Response.json({ error: 'PDF temporarily unavailable.' }, { status: 503 }); }
}
