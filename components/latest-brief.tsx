'use client';
import { useEffect, useState } from 'react';
import { PaperDownloads } from './paper-downloads';
type Brief = { id: number; summary: string; published_at: number };
export function LatestBrief() {
  const [edition,setEdition] = useState<{ id: number; summary: string; published_at: number }|null>(null);
  const [error,setError] = useState(false);
  useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await fetch('/api/papers',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json() as { editions: Brief[] };if(active){setEdition(d.editions[0]??null);setError(false);}}catch{if(active)setError(true);}};void refresh();const t=setInterval(()=>void refresh(),60000);return()=>{active=false;clearInterval(t);};},[]);
  return <section className="mb-8 rounded-2xl border border-pink-200 bg-pink-50 p-6 text-rose-950"><p className="text-sm font-medium">THREE-HOUR RESEARCH BRIEFS</p><h2 className="mt-3 font-serif text-3xl">Read the work. Build on the evidence.</h2><p className="mt-4 leading-7">{edition?.summary ?? (error ? 'The publication feed is temporarily unavailable.' : 'The first research brief is awaiting publication.')}</p><p className="mt-3 text-sm">Preliminary automated reports · not independently audited or peer reviewed</p>{edition && <PaperDownloads id={edition.id} />}<div className="mt-5 flex flex-wrap gap-5 text-sm font-medium underline">{edition && <><a href={'/papers/'+edition.id}>Read latest paper</a><a href={'/api/papers/'+edition.id+'?download=1'}>Download paper</a></>}<a href="/papers">All editions</a></div></section>;
}
