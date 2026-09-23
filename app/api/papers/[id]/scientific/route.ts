import { getScientificPaper } from '@/lib/scientific-paper';
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 0) return Response.json({ error: 'Invalid edition.' }, { status: 400 });
  const paper = await getScientificPaper(id);
  return paper ? Response.json(paper, { headers: { 'Cache-Control': 'public, max-age=300' } }) : Response.json({ error: 'Scientific paper is still being checked.' }, { status: 404 });
}
