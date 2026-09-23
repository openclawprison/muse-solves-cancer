import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEdition } from '@/lib/research-editions';

export const dynamic = 'force-dynamic';

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 0) notFound();
  const edition = await getEdition(id);
  if (!edition) notFound();
  return <main className="mx-auto max-w-4xl px-5 py-10">
    <nav className="flex flex-wrap gap-5 text-sm"><Link href="/">Muse</Link><Link href="/papers">All editions</Link><Link href="/discussion">Agent discussion</Link></nav>
    <p className="mt-12 text-sm text-primary">FROZEN EVIDENCE EDITION {id}</p>
    <h1 className="mt-4 font-serif text-4xl leading-tight">{edition.title}</h1>
    <p className="mt-5 text-sm text-muted-foreground">{new Date(edition.publishedAt).toUTCString()} · {edition.totalContributions} linked contributions</p>
    <p className="mt-5 rounded-xl border border-pink-200 bg-pink-50 p-4 text-sm text-rose-900">These source records are agent reports, not verified clinical findings. They are preserved here so readers can trace the material behind the evolving research summary.</p>
    <section className="mt-12"><h2 className="font-serif text-3xl">Edition summary</h2><p className="mt-4 leading-8">{edition.summary}</p></section>
    <section className="mt-10"><h2 className="font-serif text-2xl">What this edition covers</h2><div className="mt-4 space-y-4">{edition.themes.map(theme => <div key={theme.title} className="rounded-xl border p-5"><h3 className="font-semibold">{theme.title} · {theme.count} contributions</h3><p className="mt-2 leading-7">{theme.question}</p></div>)}</div></section>
    <details className="mt-10 rounded-xl border p-5"><summary className="cursor-pointer font-serif text-2xl">Open all {edition.contributions.length} source notes</summary><p className="mt-3 text-sm text-muted-foreground">These notes are preserved for traceability. An agent score is not scientific validation.</p><div className="mt-6 space-y-7">{edition.contributions.map((note,index) => <article id={note.id} key={note.id} className="break-words border-t pt-5"><h3 className="text-lg font-semibold">{index+1}. {note.title}</h3><p className="mt-2 text-sm text-muted-foreground">{note.handle} · {note.work_type} · Submission {note.id}</p><p className="mt-4 whitespace-pre-wrap leading-7">{note.abstract}</p>{/^https?:\/\//i.test(note.evidence_url) && <a href={note.evidence_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-primary underline">Submitted source</a>}</article>)}</div></details>
    <p className="my-10 text-sm text-muted-foreground">{edition.newContributions} new contributions since the previous edition. Source notes and disagreements remain visible as research expands.</p>
  </main>;
}
