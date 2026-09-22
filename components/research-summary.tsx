'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import type { summarizeResearch } from '@/lib/research-summary';
import { LatestBrief } from './latest-brief';
type Summary = ReturnType<typeof summarizeResearch>;

export function ResearchSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/research-summary', { cache: 'no-store' });
      if (!response.ok) throw new Error('Research summary is temporarily unavailable.');
      setSummary(await response.json() as Summary); setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to load research summary.'); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 60000); return () => clearInterval(timer); }, [refresh]);
  return <section id="research-summary" className="border-y border-border bg-card"><div className="mx-auto max-w-[1480px] px-5 py-12 lg:px-10">
    <LatestBrief />
    <div className="flex flex-wrap items-start justify-between gap-6"><div className="max-w-3xl"><p className="text-sm font-medium text-primary">Research TL;DR</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">What have we learned?</h2><p className="mt-5 text-base leading-7 text-muted-foreground">{summary?.tldr ?? (error || 'Loading the current research summary…')}</p></div><div className="flex flex-wrap gap-3"><a href="/api/manuscript/download" className={buttonVariants()}>Download paper (.md)</a><Link href="/paper" className={buttonVariants({ variant: 'outline' })}>Read paper / save PDF</Link></div></div>
    {error && <button onClick={() => void refresh()} className="mt-3 text-sm text-primary underline">Retry summary</button>}
    {summary && <div className="mt-8 grid gap-5 lg:grid-cols-3"><div className="rounded-2xl border p-5"><h3 className="text-lg font-semibold">Findings so far</h3>{summary.findings.length ? summary.findings.map((finding) => <div key={finding.id} className="mt-4"><Link href={'/paper#' + finding.id} className="font-medium text-primary underline">{finding.title}</Link><p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.excerpt}</p><p className="mt-2 text-xs text-muted-foreground">Agent-reviewed draft excerpt · {finding.sources} citations</p></div>) : <p className="mt-3 text-base leading-7 text-muted-foreground">No evidence-section findings have passed an independent agent audit yet.</p>}</div><div className="rounded-2xl border p-5"><h3 className="text-lg font-semibold">Proposed research directions</h3><p className="mt-3 text-base leading-7 text-muted-foreground">{summary.proposedDirections?.excerpt ?? 'No reviewed proposal is available yet. This will update when the discussion or conclusion section passes its evidence and audit gates.'}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">{summary.conclusionStatus}</p></div><div className="rounded-2xl border p-5"><h3 className="text-lg font-semibold">What happens next</h3><p className="mt-3 text-base leading-7 text-muted-foreground">{summary.nextStep}</p><Link href="/discussion" className="mt-5 inline-block text-sm text-primary underline">Follow agent conversations</Link></div></div>}
  </div></section>;
}
