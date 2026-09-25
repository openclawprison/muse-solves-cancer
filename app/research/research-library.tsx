'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, FlaskConical, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { researchManifest } from '@/lib/research';
import { ResearchTree } from '@/components/research-tree';

type Paper = { id: string; pmid: string; title: string; journal: string | null; publicationDate: string | null; evidenceLevel: string; screeningStatus: string; sourceUrl: string; fullTextUrl: string | null };
type Trial = { id: string; nctId: string; title: string; phases: string[]; overallStatus: string | null; enrollment: number | null; resultsAvailable: boolean; scopeLabel: string; screeningStatus: string; sourceUrl: string };
type PageData = { records: Array<Paper | Trial> };

export function ResearchLibrary() {
  const [kind, setKind] = useState<'papers' | 'trials'>('papers');
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<Array<Paper | Trial>>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const pageCount = kind === 'papers' ? researchManifest.pubmed.pages : researchManifest.trials.pages;
  const total = kind === 'papers' ? researchManifest.pubmed.selectedCount : researchManifest.trials.selectedCount;

  useEffect(() => {
    void fetch(`/data/research/${kind}/${String(page).padStart(3, '0')}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Page unavailable');
        const data = (await response.json()) as PageData;
        setRecords(data.records);
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [kind, page]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => {
      const id = 'pmid' in record ? record.pmid : record.nctId;
      return `${record.title} ${id}`.toLowerCase().includes(needle);
    });
  }, [query, records]);

  function chooseKind(next: 'papers' | 'trials') {
    setLoading(true);
    setKind(next);
    setPage(1);
    setQuery('');
  }

  function movePage(next: number) {
    setLoading(true);
    setPage(next);
  }

  return (
    <main className="min-h-screen bg-[#f6f5ee] text-foreground">
      <section className="border-b border-border bg-card text-foreground">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 lg:px-8"><Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> MUSE research network</Link><div className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" /><span className="font-mono text-xs uppercase tracking-[.16em]">Evidence catalogue</span></div></div>
        <div className="mx-auto max-w-[1320px] px-5 pb-7 pt-7 lg:px-8"><Badge className="border border-primary/20 bg-primary/10 text-primary">Research · live branches and source library</Badge><h1 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl">Follow the questions, not just the papers.</h1></div>
      </section>

      <ResearchTree />
      <section className="mx-auto max-w-[1320px] px-5 py-10 lg:px-8 lg:py-14">
        <div className="mb-6"><h2 className="font-serif text-3xl">Source library</h2><p className="mt-2 max-w-3xl text-base leading-7 text-muted-foreground">{researchManifest.note} These {researchManifest.totalSources.toLocaleString()} records are a catalogue, not all reviewed findings.</p></div>
        <div className="grid gap-4 rounded-[24px] border border-border bg-card p-4 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:p-5">
          <div className="flex rounded-full border border-border bg-muted p-1"><button onClick={() => chooseKind('papers')} className={`rounded-full px-4 py-2 text-xs font-medium ${kind === 'papers' ? 'bg-[#101a17] text-white' : 'text-muted-foreground'}`}>Papers · {researchManifest.pubmed.selectedCount.toLocaleString()}</button><button onClick={() => chooseKind('trials')} className={`rounded-full px-4 py-2 text-xs font-medium ${kind === 'trials' ? 'bg-[#101a17] text-white' : 'text-muted-foreground'}`}>Trials · {researchManifest.trials.selectedCount.toLocaleString()}</button></div>
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-10" placeholder={`Search this page of ${kind} by title or identifier`} /></div>
          <div className="flex items-center justify-end gap-2"><Button variant="outline" size="icon" disabled={page <= 1 || loading} onClick={() => movePage(Math.max(1, page - 1))} aria-label="Previous page"><ChevronLeft /></Button><span className="min-w-24 text-center font-mono text-xs text-muted-foreground">{page} / {pageCount}</span><Button variant="outline" size="icon" disabled={page >= pageCount || loading} onClick={() => movePage(Math.min(pageCount, page + 1))} aria-label="Next page"><ChevronRight /></Button></div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-card">
          {loading ? <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading catalogue page…</div> : filtered.map((record, index) => {
            const paper = 'pmid' in record ? record : null;
            const trial = 'nctId' in record ? record : null;
            return <a key={record.id} href={paper?.fullTextUrl ?? record.sourceUrl} target="_blank" rel="noreferrer" className={`grid gap-4 p-5 transition hover:bg-[#f1f0e8] sm:grid-cols-[120px_1fr_auto] sm:items-start lg:p-6 ${index ? 'border-t border-border' : ''}`}><div><p className="font-mono text-[10px] text-muted-foreground">{paper ? `PMID ${paper.pmid}` : trial?.nctId}</p><Badge variant="secondary" className="mt-3 font-normal">{paper?.evidenceLevel ?? trial?.phases.join(' / ').replaceAll('_', ' ') ?? 'Registered study'}</Badge></div><div><h2 className="max-w-4xl text-base font-semibold leading-6">{record.title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{paper ? `${paper.journal ?? 'Journal unavailable'} · ${paper.publicationDate ?? 'date unavailable'}` : `${trial?.scopeLabel} · ${trial?.overallStatus?.replaceAll('_', ' ') ?? 'status unavailable'} · ${trial?.enrollment?.toLocaleString() ?? '—'} enrolled`}</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-amber-400" />{record.screeningStatus.replaceAll('_', ' ')}<ArrowUpRight className="size-3.5" /></div></a>;
          })}
          {!loading && filtered.length === 0 && <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">No records match on this page.</div>}
        </div>
        <div className="mt-5 flex flex-col justify-between gap-3 text-xs leading-5 text-muted-foreground sm:flex-row"><p><BookOpen className="mr-1.5 inline size-3.5" />Publication metadata from NCBI PubMed; trial metadata from ClinicalTrials.gov. No endorsement implied.</p><p>Page {page} shows up to 250 of {total.toLocaleString()} records.</p></div>
      </section>
    </main>
  );
}
