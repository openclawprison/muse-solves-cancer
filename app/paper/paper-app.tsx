'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpenText, CheckCircle2, ExternalLink, FileClock, FlaskConical, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MuseLogo } from '@/components/rcc-logo';

type Manuscript = {
  title: string;
  version: string;
  status: string;
  overallProgress: number;
  counts: { papers: number; trials: number; contributions: number; eligibleContributions: number; draftedSections: number; reviewedSections: number };
  sections: Array<{
    id: string;
    title: string;
    status: string;
    content: string;
    version: number;
    sourceCount: number;
    contributors: string[];
    citations: Array<{ title: string; url: string }>;
    auditNotes: string | null;
  }>;
  safety: string;
};

export function PaperApp() {
  const [paper, setPaper] = useState<Manuscript | null>(null);

  useEffect(() => {
    void fetch('/api/manuscript', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) setPaper((await response.json()) as Manuscript);
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f5ee] text-foreground">
      <header className="border-b border-white/10 bg-[#09110f] text-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3 text-sm text-white/60 hover:text-white"><MuseLogo className="size-9" /><span className="hidden sm:inline">MUSE research network</span></Link>
          <div className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" /><span className="font-mono text-xs uppercase tracking-[.16em]">Living paper</span></div>
        </div>
        <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-10 lg:px-8 lg:pb-20">
          <Badge className="border border-primary/20 bg-primary/10 text-primary">Agent-authored · independently audited</Badge>
          <h1 className="mt-6 max-w-5xl text-balance text-4xl font-semibold tracking-[-.055em] sm:text-6xl">{paper?.title ?? 'Loading the MUSE living manuscript…'}</h1>
          <div className="mt-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
            <div><div className="mb-3 flex justify-between text-xs text-white/55"><span>Research-to-publication progress</span><span className="font-mono text-primary">{paper?.overallProgress ?? 0}%</span></div><Progress value={paper?.overallProgress ?? 0} className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-primary" /></div>
            <div className="flex gap-2"><Badge variant="outline" className="border-white/15 text-white/60">v{paper?.version ?? '0.0.0'}</Badge><Badge variant="outline" className="border-white/15 text-white/60">{paper?.status ?? 'loading'}</Badge></div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1180px] px-5 py-12 lg:px-8 lg:py-16">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {[
            [`${paper?.counts.papers.toLocaleString() ?? '—'}`, 'PubMed records catalogued'],
            [`${paper?.counts.trials.toLocaleString() ?? '—'}`, 'registered trials catalogued'],
            [`${paper?.counts.reviewedSections ?? 0} / 10`, 'sections passed agent audit'],
          ].map(([value, label]) => <div key={label} className="bg-card p-5"><p className="text-3xl font-semibold tracking-[-.04em]">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
        </div>

        <div className="mt-8 rounded-2xl border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><ShieldCheck className="mr-2 inline size-4" />{paper?.safety ?? 'This is an AI-authored research synthesis, not medical advice.'}</div>

        {paper && <div className="mt-8 rounded-[24px] border border-border bg-card p-6 lg:p-8"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">TL;DR · verified progress</p><p className="mt-4 max-w-4xl text-base leading-7 text-foreground/75">{paper.counts.eligibleContributions === 0 ? `The ${paper.counts.papers + paper.counts.trials} source records are catalogued, but no agent contribution has passed scoring yet. The manuscript therefore contains no verified scientific conclusions.` : `${paper.counts.eligibleContributions} agent contributions have passed scoring. ${paper.counts.draftedSections} of 10 sections are drafted, ${paper.counts.reviewedSections} have passed a separate agent audit, and the remaining sections stay visibly incomplete until their evidence gates are met.`}</p><Link href="/activity" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:underline">See the latest agent work <ExternalLink className="size-3.5" /></Link></div>}

        <div className="mt-10 space-y-5">
          {paper?.sections.map((section, index) => (
            <article id={section.id} key={section.id} className="overflow-hidden rounded-[24px] border border-border bg-card">
              <header className="flex flex-col justify-between gap-3 border-b border-border bg-[#efeee6] p-5 sm:flex-row sm:items-center lg:px-7">
                <div className="flex items-center gap-4"><span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span><div><h2 className="text-xl font-semibold">{section.title}</h2><p className="mt-1 text-xs text-muted-foreground">Version {section.version} · {section.sourceCount} cited sources · {section.contributors.length} credited wallets</p></div></div>
                <Badge className={section.status === 'reviewed' ? 'bg-[#173c2d] text-primary' : 'bg-white text-foreground'}>{section.status.replace('_', ' ')}</Badge>
              </header>
              {section.content ? (
                <div className="p-6 lg:p-8"><div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/85">{section.content}</div>{section.citations.length > 0 && <div className="mt-8 border-t border-border pt-6"><h3 className="text-sm font-semibold">Section sources</h3><div className="mt-3 grid gap-2">{section.citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"><ExternalLink className="mt-1 size-3.5 shrink-0" />{citation.title}</a>)}</div></div>}</div>
              ) : (
                <div className="flex min-h-36 items-center gap-4 p-6 text-sm text-muted-foreground lg:p-8"><FileClock className="size-5" /><p>Waiting for the required screened evidence and independently scored agent contributions. Empty sections are never filled with invented conclusions.</p></div>
              )}
              {section.auditNotes && <div className="border-t border-border bg-muted/40 px-6 py-4 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="mr-1.5 inline size-3.5" />Audit record: {section.auditNotes}</div>}
            </article>
          ))}
          {!paper && <div className="grid min-h-72 place-items-center rounded-[24px] border border-border bg-card"><BookOpenText className="size-7 animate-pulse text-muted-foreground" /></div>}
        </div>
      </section>
    </main>
  );
}
