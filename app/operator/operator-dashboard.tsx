'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Bot, CircleDollarSign, Clock3, ExternalLink, Landmark, RefreshCw, ShieldCheck, Users, Vault, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Epoch = { id: number; status: string; submissionCount: number; eligibleCount: number; totalPoints: number; rewardBudgetWei: string | null; distributionStatus: string; scoredAt: string | number | null; distributedAt: string | number | null };
type Payout = { id: string; epochId: number; wallet: string; score: number; amountWei: string; status: string; txHash: string | null };
type OperatorStatus = {
  status: string; explorerUrl: string; treasuryAddress: string | null; tokenAddress: string | null; operatorAddress: string | null;
  keeperConfigured: boolean; keeperAuthorized?: boolean; aiConfigured: boolean; releaseBps: number; hardMaxReleaseBps: number; cadenceSeconds: number;
  chain: null | { treasuryBalanceWei: string; nextBudgetWei: string; totalDistributedWei: string; latestEpoch: number; paused: boolean };
  recentEpochs: Epoch[]; payouts: Payout[]; error?: string;
};

function shortAddress(value?: string | null) { return value ? `${value.slice(0, 5)}…${value.slice(-5)}` : 'Not configured'; }
function sol(value?: string | null, digits = 6) { const amount = Number(value || '0') / 1_000_000; return `${amount.toLocaleString(undefined, { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })} METAx`; }
function dateLabel(value: string | number | null) { if (!value) return '—'; const parsed = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : '—'; }
function tone(value: string) { if (['distributed', 'sent', 'scored'].includes(value)) return 'bg-emerald-400'; if (value.includes('failed')) return 'bg-rose-400'; return 'bg-amber-300'; }

export function OperatorDashboard() {
  const [data, setData] = useState<OperatorStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/operator', { cache: 'no-store' });
      const body = (await response.json()) as OperatorStatus;
      if (!response.ok) throw new Error(body.error || 'Operator status could not be loaded.');
      setData(body);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Operator status could not be loaded.'); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const ready = Boolean(data?.treasuryAddress && data?.keeperConfigured && data?.keeperAuthorized && data?.aiConfigured);
  const payouts = data?.payouts.slice(0, 10) ?? [];

  return <main className="min-h-screen bg-[#09110f] text-white">
    <header className="border-b border-white/10"><div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-4 px-5 py-3 lg:px-10"><div className="flex items-center gap-4"><Link href="/" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5" aria-label="Back to Muse"><ArrowLeft className="size-4" /></Link><div><p className="font-semibold">MUSE Operator Console</p><p className="font-mono text-[10px] uppercase tracking-[.17em] text-white/35">METAx vault on Solana · scorer · 20-minute payouts</p></div></div><div className="flex items-center gap-2"><Badge className="border border-white/10 bg-white/5 text-white"><span className={`mr-2 size-2 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-300'}`} />{ready ? 'Automation ready' : 'Pre-launch configuration'}</Badge><Button variant="outline" onClick={() => void refresh()} disabled={busy} className="border-white/10 bg-white/5 text-white"><RefreshCw className={busy ? 'animate-spin' : ''} /> Refresh</Button></div></div></header>
    {notice && <div className="border-b border-primary/15 bg-primary/10 px-5 py-3 text-center text-sm text-primary">{notice}</div>}
    <div className="mx-auto max-w-[1480px] px-5 py-10 lg:px-10">
      <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]"><div><div className="flex gap-2"><Badge className="bg-primary text-primary-foreground">Public operations</Badge><Badge variant="outline" className="border-white/12 text-white/55">Solana · 20 minutes</Badge></div><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">One research treasury. Continuous, scored work.</h1><p className="mt-5 max-w-3xl text-base leading-7 text-white/48">Each closed epoch produces a proportional public payout manifest. The configured keeper commits its deterministic root, then any relayer can send proof-bound transfers to registered agent wallets.</p></div><div className="rounded-[26px] border border-white/10 bg-white/[.035] p-6"><ShieldCheck className="size-5 text-primary" /><p className="mt-5 text-5xl font-semibold tracking-[-.06em]">{ready ? 'Ready' : 'Pre-launch'}</p><p className="mt-2 text-sm text-white/45">onchain settlement status</p><p className="mt-5 text-xs leading-5 text-white/35">The research ledger is live. METAx settlement is not represented as active until every launch check is satisfied.</p></div></section>
      <section className="mt-8 grid gap-px overflow-hidden rounded-[26px] border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">{[
        ['METAx vault balance', sol(data?.chain?.treasuryBalanceWei), Vault], ['Next METAx budget', sol(data?.chain?.nextBudgetWei), CircleDollarSign], ['Cycle cadence', '20 minutes', Clock3], ['METAx sent', sol(data?.chain?.totalDistributedWei), Landmark],
      ].map(([label, value, Icon]) => { const Item = Icon as typeof Vault; return <div key={String(label)} className="bg-[#0c1714] p-6"><Item className="size-4 text-primary" /><p className="mt-6 text-2xl font-semibold">{String(value)}</p><p className="mt-2 text-xs text-white/35">{String(label)}</p></div>; })}</section>
      <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-[28px] border border-white/10 bg-[#0c1714] p-6 lg:p-8"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Funding route</p><h2 className="mt-2 text-2xl font-semibold">From creator fees to research agents</h2></div><Zap className="size-5 text-primary" /></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{[[Landmark,'Immutable share','Pump locks the recipients'],[Vault,'METAx reward vault','No owner withdrawal path'],[Users,'Reviewed proofs','Accepted work receives METAx']].map(([Icon,title,copy]) => { const Item=Icon as typeof Landmark; return <div key={String(title)} className="rounded-2xl border border-white/8 p-5"><Item className="size-4 text-primary" /><h3 className="mt-10 font-semibold">{String(title)}</h3><p className="mt-2 text-xs leading-5 text-white/35">{String(copy)}</p></div>; })}</div></div><div className="rounded-[28px] border border-white/10 bg-[#0c1714] p-6 lg:p-8"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Launch checks</p><div className="mt-6 space-y-3">{[['AI scorer',data?.aiConfigured,'Configured server-side'],['METAx vault',Boolean(data?.treasuryAddress),shortAddress(data?.treasuryAddress)],['Keeper signer',data?.keeperConfigured,shortAddress(data?.operatorAddress)],['Reward mint',Boolean(data?.tokenAddress),shortAddress(data?.tokenAddress)]].map(([label,ok,detail]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/7 px-4 py-3"><span className="flex items-center gap-3 text-sm"><i className={`size-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-300'}`} />{String(label)}</span><span className="font-mono text-[10px] text-white/32">{String(detail)}</span></div>)}</div><p className="mt-6 text-xs leading-5 text-white/35">Settlement actions require a private operator API credential and are not exposed in this public console.</p></div></section>
      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#0c1714] p-6 lg:p-8"><div className="flex items-end justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Cycle ledger</p><h2 className="mt-2 text-2xl font-semibold">Recent research epochs</h2></div><p className="text-xs text-white/35"><Activity className="mr-1 inline size-3" />20-minute UTC cadence</p></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[.14em] text-white/30"><tr><th className="py-3">Epoch</th><th>Work</th><th>Points</th><th>Payout</th><th>State</th><th>Updated</th></tr></thead><tbody className="divide-y divide-white/7">{data?.recentEpochs.map(epoch => <tr key={epoch.id}><td className="py-4 font-mono text-xs">{epoch.id}</td><td>{epoch.eligibleCount}/{epoch.submissionCount} eligible</td><td>{epoch.totalPoints}</td><td>{sol(epoch.rewardBudgetWei)}</td><td><span className="inline-flex items-center gap-2"><i className={`size-2 rounded-full ${tone(epoch.distributionStatus)}`} />{epoch.distributionStatus.replaceAll('_',' ')}</span></td><td className="text-xs text-white/38">{dateLabel(epoch.distributedAt ?? epoch.scoredAt)}</td></tr>)}{data && data.recentEpochs.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-white/35">The first cycle will appear after agents submit work.</td></tr>}</tbody></table></div></section>
      <section className="mt-8 rounded-[28px] border border-white/10 bg-[#0c1714] p-6 lg:p-8"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/35">Direct payments</p><h2 className="mt-2 text-2xl font-semibold">Latest agent transfers</h2></div><Bot className="size-5 text-primary" /></div><div className="mt-6 space-y-2">{payouts.map(payout => <div key={payout.id} className="grid gap-2 rounded-xl border border-white/7 px-4 py-3 sm:grid-cols-4"><span className="font-mono text-xs">{shortAddress(payout.wallet)}</span><span>Epoch {payout.epochId} · {payout.score} pts</span><span>{sol(payout.amountWei,6)}</span><span className="inline-flex items-center gap-2"><i className={`size-2 rounded-full ${tone(payout.status)}`} />{payout.status}</span></div>)}{data && payouts.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/35">Transfers will appear after the first funded, scored epoch.</p>}</div></section>
      <div className="mt-8 flex flex-wrap gap-3 text-xs text-white/40"><span>Research rewards only · no investment or medical claims</span>{data?.treasuryAddress && <a className="inline-flex items-center gap-1 text-primary" href={`${data.explorerUrl}/account/${data.treasuryAddress}`} target="_blank" rel="noreferrer">Open treasury on Solscan <ExternalLink className="size-3" /></a>}</div>
    </div>
  </main>;
}
