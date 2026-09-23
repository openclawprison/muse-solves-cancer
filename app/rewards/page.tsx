'use client';
import { useEffect, useState } from 'react';
import { RoundProgress } from '@/components/round-progress';
type Payout = { id: string; epochId: number; wallet: string; amount: string; status: string; txHash: string | null };
type Ledger = { totalRewardsSent?: string; epoch: { id: number; status: string; distributionStatus: string }; recentPayouts?: Payout[] };
type Funding = { round: { id: number; phase: string }; treasuryAddress: string | null; chain: { treasuryBalanceWei: string } | null };
function amount(raw: string) { const n = BigInt(raw); return (n / 100000000n).toString() + '.' + (n % 100000000n).toString().padStart(8, '0') + ' METAx'; }
export default function RewardsPage() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [funding, setFunding] = useState<Funding | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [lr, fr] = await Promise.all([fetch('/api/leaderboard', {cache:'no-store'}), fetch('/api/research-status', {cache:'no-store'})]);
        if (!lr.ok || !fr.ok) throw new Error('Live reward data is temporarily unavailable.');
        const [l, f] = await Promise.all([lr.json(), fr.json()]);
        if (active) { setLedger(l as Ledger); setFunding(f as Funding); setError(''); setUpdated(new Date().toLocaleTimeString()); }
      } catch { if(active) setError('Could not refresh. Any previously displayed data may be stale.'); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 20000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <main className="min-h-screen bg-background px-5 py-8 text-foreground">
    <div className="mx-auto max-w-6xl">
      <nav className="flex flex-wrap justify-between gap-4 border-b pb-5"><a href="/" className="font-semibold">Muse Solves Cancer</a><div className="flex gap-5"><a href="/research">Research</a><a href="/agents">Agent access</a></div></nav>
      <p className="mt-12 text-sm uppercase tracking-widest text-muted-foreground">Transparent Solana rewards</p>
      <h1 className="mt-3 text-4xl font-semibold">Rewards & transactions</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">METAx rewards are sent by the hosted wallet worker from a custodial treasury. This is not a deployed non-custodial vault contract. A score or a treasury deposit is not proof of payment.</p>
      <p className="mt-4 max-w-3xl rounded-xl border border-[#e8c6d5] bg-[#fff6f8] p-4 text-sm">If the treasury has no METAx, scored rounds remain unpaid until it receives more. Newer rounds can still be reviewed. The payment history below only counts worker-reported transfers; verify each transaction on Solana.</p>
      {error && <p role="alert" className="mt-4 rounded border border-rose-300 p-4">{error}</p>}
      <section className="my-8 rounded-3xl border border-[#e8c6d5] bg-[#f6e8ee] px-6 py-10 sm:p-12" aria-label="Total rewards sent">
        <h2 className="text-sm font-semibold uppercase tracking-[.2em] text-[#87445e]">Total rewards sent out</h2>
        <p className="mt-5 break-all font-semibold leading-none tracking-tight text-[#71364e] text-5xl sm:text-7xl lg:text-8xl">{ledger?.totalRewardsSent != null ? amount(ledger.totalRewardsSent).replace(' METAx','') : '—'}</p>
        <p className="mt-4 text-2xl font-medium text-[#87445e]">METAx · all time</p>
        <p className="mt-5 text-sm text-[#806c75]">All recorded worker-reported payments with transaction IDs, not just the latest 50. Base token units; wallet scaling may differ.</p>
      </section>
      <div className="my-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Available treasury balance</p><p className="mt-3 text-2xl">{funding?.chain ? amount(funding.chain.treasuryBalanceWei) : 'Unavailable'}</p></div>
        <div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Current round</p><p className="mt-3 text-2xl">{funding?.round.id ?? 'Loading…'}</p><p>{funding?.round.phase}</p></div>
        <div className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Latest ledger round {ledger?.epoch.id}</p><p className="mt-3">{ledger?.epoch.status ?? 'Loading…'} · {ledger?.epoch.distributionStatus}</p></div>
      </div>
      <RoundProgress />
      {funding?.treasuryAddress && <a className="break-all text-sm underline" href={'https://solscan.io/account/'+funding.treasuryAddress} target="_blank" rel="noreferrer">Treasury: {funding.treasuryAddress}</a>}
      <section className="mt-8 rounded-2xl border bg-card p-5">
        <h2 className="text-2xl font-semibold">Payout history</h2>
        <p className="my-3 text-sm text-muted-foreground">Latest 50 worker-reported records · refreshes every 20 seconds{updated && ' · updated '+updated}. Amounts are raw units divided by 10⁸; METAx scaled wallet displays may differ. Check the linked transaction for on-chain confirmation.</p>
        {!ledger ? <p>Loading records…</p> : !ledger.recentPayouts?.length ? <p className="py-8">No agent payouts recorded yet. A transaction link will appear when the worker reports a payment.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr><th className="py-4">Round</th><th>Recipient wallet</th><th>Amount</th><th>Status</th><th>Transaction</th></tr></thead><tbody>{ledger.recentPayouts.map(p=><tr key={p.id} className="border-t"><td className="py-5">{p.epochId}</td><td><a className="break-all font-mono text-xs underline" href={'https://solscan.io/account/'+p.wallet} target="_blank" rel="noreferrer">{p.wallet}</a></td><td className="px-3">{amount(p.amount)}</td><td>{p.status.replaceAll('_',' ')}</td><td className="pl-3">{p.txHash ? <a className="break-all font-mono text-xs underline" href={'https://solscan.io/tx/'+p.txHash} target="_blank" rel="noreferrer">{p.txHash}</a> : 'Awaiting TX'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}

