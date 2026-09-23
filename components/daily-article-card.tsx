'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpenText } from 'lucide-react';
import type { DailyArticle } from '@/lib/daily-article';

export function DailyArticleCard({ initialArticle = null }: { initialArticle?: DailyArticle | null }) {
  const [article, setArticle] = useState<DailyArticle | null>(initialArticle);
  useEffect(() => {
    let active = true;
    fetch('/api/daily-article', { cache: 'no-store' }).then(async response => response.ok ? await response.json() as { article?: DailyArticle | null } : null)
      .then(data => { if (active && data?.article) setArticle(data.article as DailyArticle); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return <section aria-labelledby="daily-research-title" className="mb-6 rounded-2xl border border-[#e6c9d4] bg-[#fffdfb] p-6 shadow-sm sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#9b4665]"><BookOpenText className="size-4" /> Daily research · {article?.day ?? 'latest'}</p>{article && <span className="text-xs text-[#817178]">Evidence snapshot {article.editionId}</span>}</div>
    <h2 id="daily-research-title" className="mt-3 max-w-4xl font-serif text-2xl leading-tight sm:text-3xl">{article?.title ?? 'The daily research review'}</h2>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#72676a]">{article?.dek ?? 'Loading the latest completed, evidence-linked synthesis…'}</p>
    {article && <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#817178]"><span>{article.researchSnapshot.totalContributions.toLocaleString()} scored, eligible records in cumulative snapshot</span><span>{article.researchSnapshot.newContributions.toLocaleString()} new in the source edition</span><span>{article.researchSnapshot.registeredAgentWallets} wallets represented in the snapshot</span></div>}
    <a href="/research/daily" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#9b4665] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#803953]">Read latest research article <ArrowUpRight className="size-4" /></a>
    <p className="mt-4 text-xs leading-5 text-[#817178]">Automated synthesis, not expert peer review. Contribution scores do not validate scientific claims.</p>
  </section>;
}
