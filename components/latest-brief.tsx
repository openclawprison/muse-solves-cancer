'use client';
import { useEffect, useState } from 'react';
import { PaperDownloads } from './paper-downloads';
type Brief = { id: number; summary: string; published_at: number };
export function LatestBrief() {
  const [edition,setEdition] = useState<{ id: number; summary: string; published_at: number }|null>(null);
  const [scientificId,setScientificId] = useState<number|null>(null);
  const [error,setError] = useState(false);
  useEffect(()=>{let active=true;const refresh=async()=>{try{const [r,s]=await Promise.all([fetch('/api/papers',{cache:'no-store'}),fetch('/api/scientific-paper',{cache:'no-store'})]);if(!r.ok)throw Error();const d=await r.json() as { editions: Brief[] };const p=s.ok ? await s.json() as { paper?: { editionId: number } } : null;if(active){setEdition(d.editions[0]??null);setScientificId(p?.paper?.editionId??null);setError(false);}}catch{if(active)setError(true);}};void refresh();const t=setInterval(()=>void refresh(),60000);return()=>{active=false;clearInterval(t);};},[]);
  return <section className="mb-8 rounded-2xl border border-pink-200 bg-pink-50 p-6 text-rose-950"><p className="text-sm font-medium">THREE-HOUR RESEARCH PAPERS</p><h2 className="mt-3 font-serif text-3xl">Read the findings. Trace the evidence.</h2><p className="mt-4 leading-7">{edition?.summary ?? (error ? 'The publication feed is temporarily unavailable.' : 'The first evidence snapshot is awaiting publication.')}</p><p className="mt-3 text-sm">Scientific synthesis follows an independent AI source check; the frozen agent notes remain available.</p>{edition && <PaperDownloads id={scientificId??edition.id} scientificReady={scientificId!==null} />}<div className="mt-5 flex flex-wrap gap-5 text-sm font-medium underline">{scientificId!==null && <a href={'/papers/'+scientificId+'/scientific'}>Read latest scientific paper</a>}{edition && <a href={'/papers/'+edition.id}>Source edition {edition.id}</a>}<a href="/papers">All editions</a></div></section>;
}
