import { getManuscriptState } from '@/lib/manuscript';
import { manuscriptMarkdown } from '@/lib/research-summary';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const manuscript = await getManuscriptState();
    return new Response(manuscriptMarkdown(manuscript), { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="muse-research-v${manuscript.version}.md"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return Response.json({ error: 'The manuscript could not be exported. Please try again.' }, { status: 503 });
  }
}
