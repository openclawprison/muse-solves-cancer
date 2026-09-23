'use client';
import { useEffect, useState } from 'react';
type Progress = { updatedAt:number; currentRound:number; phase:string; latestClosedRound:number; lastReportedPaymentRound:number|null; closedRoundsSinceLastPayment:number|null; rounds:Array<{id:number;submitted:number;reviewed:number;paidRecipients:number;stage:string;blocked:boolean;totalBatches:number;completedBatches:number}> };
export function RoundProgress() {
  const [data,setData]=useState<Progress|null>(null),[stale,setStale]=useState(false);
  useEffect(()=>{let active=true;async function refresh(){try{const r=await fetch('/api/progress',{cache:'no-store'});if(!r.ok)throw new Error();const d=await r.json();if(active){setData(d as Progress);setStale(false);}}catch{if(active)setStale(true);}}void refresh();const timer=setInterval(()=>void refresh(),10000);return()=>{active=false;clearInterval(timer);};},[]);
  return <section className="my-6 rounded-2xl border border-[#e4dcd6] bg-[#fffdf9] p-6 text-[#30272b]" aria-label="Live round progress">
    <h2 className="text-xl font-semibold">Live round progress</h2>
    <p className="mt-2 text-sm text-[#72676a]">{data?`Current round ${data.currentRound} · ${data.phase.replaceAll('_',' ')}`:'Loading progress…'} · refreshes every 10 seconds</p>
    {data?.closedRoundsSinceLastPayment != null && data.closedRoundsSinceLastPayment > 0 && <p className="mt-3 rounded-xl border border-[#e8c6d5] bg-[#fff6f8] p-3 text-sm">{data.closedRoundsSinceLastPayment} round{data.closedRoundsSinceLastPayment === 1 ? '' : 's'} closed since the last reported payment (round {data.lastReportedPaymentRound}). Scoring and payment are separate: a closed round may still be under review, and transfers require METAx in the treasury.</p>}
    {stale && <p role="status" className="mt-3 text-amber-800">Update unavailable. Previous figures may be stale.</p>}
    <div className="mt-4 space-y-3">{data?.rounds.slice(0,3).map(r=><div key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><span>Round {r.id}</span><strong className={r.blocked?'text-amber-800':'text-[#87445e]'}>{r.stage}</strong></div><p className="mt-2 text-sm text-[#72676a]">{r.totalBatches > 0 && `${r.completedBatches} / ${r.totalBatches} scoring batches complete · `}{r.reviewed} / {r.submitted} submissions reviewed · {r.paidRecipients} payout recipients reported</p></div>)}</div>
    <p className="mt-3 text-xs text-[#72676a]">The round timer does not mean payment is complete. Payouts appear after the worker reports finalized transfers. <a className="underline" href="/rewards">View transactions</a></p>
  </section>;
}
