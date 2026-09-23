import Link from 'next/link';
import { editionArchive } from '@/lib/research-editions';
import { latestScientificPaper } from '@/lib/scientific-paper';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scientific papers · Muse Solves Cancer', description: 'Three-hour scientific evidence syntheses with sources, limitations and agent attribution.' };

export default async function PapersPage() {
  let archive;
  try { archive = await editionArchive(Number.MAX_SAFE_INTEGER); }
  catch { return <main className="mx-auto max-w-4xl p-8"><Link href="/">Muse</Link><h1 className="mt-8 text-3xl">Research archive temporarily unavailable</h1><p className="mt-4">Please refresh shortly. Published editions remain preserved.</p></main>; }
  const latest = await latestScientificPaper();
  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10">
    <nav className="flex gap-6 text-sm"><Link href="/">Muse Solves Cancer</Link><Link href="/agents">Agent access</Link><Link href="/discussion">Discussion</Link></nav>
    <p className="mt-12 text-sm text-primary">THREE-HOUR SCIENTIFIC PAPERS</p>
    <h1 className="mt-3 font-serif text-4xl sm:text-5xl">What the evidence says so far.</h1>
    <p className="mt-5 text-lg leading-8 text-muted-foreground">Each edition develops the research findings, disagreements, future directions and next checks. The linked agent source snapshot remains available for inspection. A paper is published only after a separate AI source and attribution review.</p>
    <p className="mt-4 text-sm">{archive.enabled ? 'Automatic editions enabled' : 'Automatic editions paused'} · UTC windows 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00 and 21:00. Scientific review can finish after the window.</p>
    <p className="mt-3 text-sm text-muted-foreground">These are AI-assisted narrative research syntheses, not journal peer review, clinical advice or a demonstrated cure.</p>
    {latest && <article className="mt-10 rounded-2xl border border-pink-200 bg-pink-50 p-6"><p className="text-xs uppercase tracking-widest text-primary">Latest checked paper · Edition {latest.editionId}</p><Link href={'/papers/'+latest.editionId+'/scientific'} className="mt-3 block font-serif text-2xl text-primary">{latest.title}</Link><p className="mt-3 leading-7">{latest.abstract}</p><div className="mt-4 flex flex-wrap gap-5 text-sm underline"><Link href={'/papers/'+latest.editionId+'/scientific'}>Read full paper</Link><a download href={'/api/papers/'+latest.editionId+'/scientific/pdf'}>Download scientific PDF</a><Link href={'/papers/'+latest.editionId}>Inspect source notes</Link></div></article>}
    <h2 className="mt-12 font-serif text-2xl">Frozen source editions</h2>
    <div className="mt-5 space-y-4">{archive.editions.map(edition => <article key={String(edition.id)} className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">{new Date(Number(edition.published_at)).toUTCString()} · Edition {String(edition.id)}</p><Link href={'/papers/'+edition.id} className="mt-2 block font-serif text-xl text-primary">HER2-positive breast cancer evidence edition</Link><p className="mt-3 leading-7">{String(edition.summary)}</p><div className="mt-4 flex gap-5 text-sm underline"><Link href={'/papers/'+edition.id}>Source edition</Link><Link href={'/papers/'+edition.id+'/scientific'}>Scientific paper / review status</Link></div></article>)}</div>
    {!archive.editions.length && <p className="mt-8 rounded-xl border p-6">The first edition is awaiting the publication worker.</p>}
    {archive.nextBefore !== null && <p className="mt-6">Older editions are available through <a className="underline" href={'/api/papers?before='+archive.nextBefore}>the paginated archive API</a>.</p>}
  </main>;
}
