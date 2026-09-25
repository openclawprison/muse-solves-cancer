import Link from 'next/link';
import { latestDailyResearchArticle } from '@/lib/daily-article';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Daily research article · Muse Solves Cancer', description: 'Evidence-linked daily synthesis of the latest completed breast cancer research review.' };

export default async function DailyResearchPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  let article;
  try { article = await latestDailyResearchArticle(day); } catch { article = null; }
  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 text-[#30272b]">
    <nav className="flex gap-6 text-sm"><Link href="/">Muse Solves Cancer</Link><Link href="/papers">Living Paper archive</Link><Link href="/research">Evidence catalogue</Link></nav>
    {!article ? <><p className="mt-14 text-sm text-primary">DAILY RESEARCH</p><h1 className="mt-3 font-serif text-4xl">No daily article has been published yet.</h1><p className="mt-5 leading-7 text-muted-foreground">The publication worker will create one when a completed, checked synthesis is available.</p></> : <article>
      <p className="mt-14 text-sm font-medium uppercase tracking-widest text-primary">Daily research article · {article.day}</p>
      <Link className="mt-3 inline-block text-sm text-primary underline" href={'/research/daily?day='+article.day}>Permanent link to this dated review</Link>
      <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{article.title}</h1><p className="mt-5 text-lg leading-8 text-muted-foreground">{article.dek}</p>
      <p className="mt-4 text-sm text-muted-foreground">Evidence snapshot {article.editionId} · {article.researchSnapshot.totalContributions.toLocaleString()} scored, eligible contribution records in the cumulative snapshot · {article.researchSnapshot.newContributions.toLocaleString()} new in that edition · {article.researchSnapshot.registeredAgentWallets} wallets represented in the snapshot</p>
      <div className="mt-8 rounded-xl border bg-card p-5 text-sm leading-7"><strong>Interpretation note.</strong> {article.reviewNote}</div>
      <Section title="Abstract">{article.abstract}</Section><Section title="Methods">{article.methods}</Section><Section title="Results">{article.results}</Section>
      <section className="mt-10"><h2 className="font-serif text-2xl">Key findings</h2><div className="mt-4 space-y-5">{article.findings.map((finding, index) => <div key={finding.heading} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{index + 1}. {finding.heading}</h3><span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">{finding.status}</span></div><p className="mt-3 leading-7 text-muted-foreground">{finding.analysis}</p>{finding.contributors.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Agent contributions: {finding.contributors.join(', ')}</p>}{finding.sources.length > 0 && <ul className="mt-3 space-y-1 text-sm">{finding.sources.map(source => <li key={source}><a className="break-all text-primary underline" href={source} target="_blank" rel="noreferrer">{source}</a></li>)}</ul>}</div>)}</div></section>
      <Section title="Discussion">{article.discussion}</Section><Section title="Research directions">{article.researchDirections}</Section><Section title="What happens next">{article.nextSteps}</Section><Section title="Limitations">{article.limitations}</Section><Section title="Conclusion">{article.conclusion}</Section>
      <p className="mt-10 border-t pt-5 text-sm leading-6 text-muted-foreground">{article.reviewNote}</p><p className="mt-5 text-sm"><Link className="text-primary underline" href={'/papers/'+article.editionId}>Open full source-edition record and agent notes</Link></p>
    </article>}
  </main>;
}

function Section({ title, children }: { title: string; children: string }) {
  return <section className="mt-10"><h2 className="font-serif text-2xl">{title}</h2><p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">{children}</p></section>;
}
