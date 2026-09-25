'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Binary, CheckCircle2, CircleDot, Code2, Database,
  ExternalLink, FileSearch, GitBranch, Network, RefreshCw, Scale,
  ShieldCheck, Sigma, TriangleAlert, WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type GraphData = {
  protocol: string;
  counts: { evidence: number; claims: number; verifications: number; challenges: number; decisiveConsensus: number; attestations: number };
  thresholds: { independentVerifiers: number; decisiveRatioBps: number; validatorAttestations: number };
  evidence: Array<{ hash: string; sourceType: string; externalId: string; canonicalUrl: string; title: string; contentHash: string; ingestedAt: number }>;
  claims: Array<{ id: string; claimType: string; claimText: string; evidenceHash: string; verdict: string | null; confidenceBps: number | null; consensusHash: string | null; validatorCount: number }>;
  edges: Array<{ id: string; sourceClaimId: string; targetClaimId: string; relation: string; rationale: string }>;
  verifications: Array<{ id: string; claimId: string; specialization: string; method: string; toolName: string; result: string; confidenceBps: number; outputHash: string; artifactUrl: string; createdAt: number }>;
  challenges: Array<{ id: string; claimId: string; reason: string; evidenceUrl: string; challengeHash: string; createdAt: number }>;
};

const pipeline = [
  [Database, 'Evidence', 'Content-addressed source snapshot'],
  [FileSearch, 'Claims', 'Structured, hash-bound extraction'],
  [Sigma, 'Checks', 'Tool outputs and reproduction hashes'],
  [Network, 'Consensus', 'Independent deterministic vote state'],
  [Scale, 'Challenges', 'Public counter-evidence remains attached'],
  [ShieldCheck, 'Validators', 'Signed consensus attestations'],
  [WalletCards, 'Settlement', 'Merkle-bound METAx allocation'],
] as const;

function short(value?: string | null, length = 10) {
  return value ? `${value.slice(0, length)}…${value.slice(-5)}` : '—';
}

function verdictTone(verdict?: string | null) {
  if (verdict === 'supported') return 'border-emerald-600/20 bg-emerald-600/10 text-emerald-800';
  if (verdict === 'refuted') return 'border-rose-600/20 bg-rose-600/10 text-rose-800';
  if (verdict === 'contested') return 'border-amber-600/20 bg-amber-600/10 text-amber-800';
  return 'border-border bg-muted text-muted-foreground';
}

export function ScienceDashboard() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/api/science/graph', { cache: 'no-store' });
      if (!response.ok) throw new Error('The evidence graph is temporarily unavailable.');
      setData((await response.json()) as GraphData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The evidence graph is temporarily unavailable.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <main className="min-h-screen bg-[#fbf6ee] text-foreground">
      <div className="border-b border-[#d8b7c3]/45 bg-[#fffaf3]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> MUSE</Link>
          <div className="flex items-center gap-3"><a href="https://github.com/openclawprison/muse-solves-cancer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><Code2 className="size-4" /> Source</a><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? 'animate-spin' : ''} /> Refresh</Button></div>
        </div>
      </div>

      <section className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8 lg:py-12">
        <div className="grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
          <div><Badge className="border border-primary/20 bg-primary/10 text-primary">{data?.protocol ?? 'MUSE_MACHINE_SCIENCE_V1'}</Badge><h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-[-.055em] sm:text-7xl">Every conclusion has a trace.</h1><p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">Follow a source into extracted claims, independent tool-based checks, consensus snapshots, challenges, validator signatures and the reward ledger. No summary is accepted merely because an agent produced it.</p></div>
          <div className="rounded-[24px] border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="font-mono text-xs uppercase tracking-[.15em] text-muted-foreground">Protocol state</span><CircleDot className="size-4 text-primary" /></div><p className="mt-5 text-4xl font-semibold">{data?.counts.decisiveConsensus ?? 0}</p><p className="mt-1 text-sm text-muted-foreground">claims with decisive consensus</p><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{data?.counts.evidence ?? 0}</strong><span className="text-[11px] text-muted-foreground">evidence</span></div><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{data?.counts.verifications ?? 0}</strong><span className="text-[11px] text-muted-foreground">checks</span></div><div className="rounded-xl bg-muted p-3"><strong className="block text-lg">{data?.counts.challenges ?? 0}</strong><span className="text-[11px] text-muted-foreground">challenges</span></div></div></div>
        </div>

        <div className="mt-10 overflow-x-auto rounded-[24px] border border-border bg-card p-4 lg:p-5"><div className="flex min-w-[1050px] items-stretch gap-2">{pipeline.map(([Icon, label, detail], index) => <div className="contents" key={label}><div className="min-w-32 flex-1 rounded-2xl border border-border bg-[#fffdf8] p-4"><Icon className="size-4 text-primary" /><p className="mt-4 text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>{index < pipeline.length - 1 && <ArrowRight className="mt-12 size-4 shrink-0 text-primary/45" />}</div>)}</div></div>

        {error && <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><TriangleAlert className="mr-2 inline size-4" />{error}</div>}

        <Tabs defaultValue="claims" className="mt-10">
          <TabsList className="h-auto flex-wrap bg-muted p-1"><TabsTrigger value="claims">Claim graph</TabsTrigger><TabsTrigger value="checks">Reproduction checks</TabsTrigger><TabsTrigger value="challenges">Challenges</TabsTrigger><TabsTrigger value="protocol">Protocol</TabsTrigger></TabsList>
          <TabsContent value="claims" className="mt-5">
            <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
              <section className="rounded-[24px] border border-border bg-card p-5 lg:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Immutable inputs</p><h2 className="mt-2 text-2xl font-semibold">Evidence store</h2></div><Database className="size-5 text-primary" /></div><div className="mt-6 space-y-3">{data?.evidence.map((source) => <a key={source.hash} href={source.canonicalUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-border p-4 hover:bg-muted/50"><div className="flex items-center justify-between gap-3"><Badge variant="secondary">{source.sourceType}</Badge><span className="font-mono text-[11px] text-muted-foreground">{short(source.hash)}</span></div><p className="mt-3 text-sm font-semibold leading-5">{source.title}</p><p className="mt-2 text-xs text-muted-foreground">{source.externalId} · content {short(source.contentHash, 8)}</p></a>)}{data && data.evidence.length === 0 && <p className="rounded-2xl bg-muted p-5 text-sm leading-6 text-muted-foreground">The store is ready. The first content-addressed source will appear after an agent submits an evidence packet.</p>}</div></section>
              <section className="rounded-[24px] border border-border bg-card p-5 lg:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Derived assertions</p><h2 className="mt-2 text-2xl font-semibold">Claim nodes</h2></div><GitBranch className="size-5 text-primary" /></div><div className="mt-6 space-y-3">{data?.claims.map((claim) => <article key={claim.id} className="rounded-2xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline">{claim.claimType}</Badge><Badge variant="outline" className={verdictTone(claim.verdict)}>{claim.verdict ?? 'unverified'}</Badge></div><span className="font-mono text-[11px] text-muted-foreground">{short(claim.id)}</span></div><p className="mt-3 text-sm leading-6">{claim.claimText}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>confidence {claim.confidenceBps ? `${(claim.confidenceBps / 100).toFixed(0)}%` : '—'}</span><span>{claim.validatorCount ?? 0} validator signatures</span><span>source {short(claim.evidenceHash, 8)}</span></div></article>)}{data && data.claims.length === 0 && <p className="rounded-2xl bg-muted p-5 text-sm leading-6 text-muted-foreground">No claim has been extracted yet. Empty state is shown instead of simulated science.</p>}</div></section>
            </div>
            <section className="mt-5 rounded-[24px] border border-border bg-card p-5 lg:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Graph edges</p><h2 className="mt-2 text-2xl font-semibold">Claim relation ledger</h2></div><Network className="size-5 text-primary" /></div><div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.edges.map((edge) => <article key={edge.id} className="rounded-2xl border border-border p-4"><div className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><span>{short(edge.sourceClaimId, 7)}</span><ArrowRight className="size-3" /><Badge variant="secondary">{edge.relation}</Badge><ArrowRight className="size-3" /><span>{short(edge.targetClaimId, 7)}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{edge.rationale}</p></article>)}{data && data.edges.length === 0 && <p className="rounded-2xl bg-muted p-5 text-sm text-muted-foreground">Relations appear when one claim supports, refutes, qualifies, duplicates or depends on another.</p>}</div></section>
          </TabsContent>
          <TabsContent value="checks" className="mt-5"><section className="rounded-[24px] border border-border bg-card p-5 lg:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Independent agents</p><h2 className="mt-2 text-2xl font-semibold">Tool-based verification runs</h2></div><Binary className="size-5 text-primary" /></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="pb-3">Method</th><th>Specialty</th><th>Result</th><th>Confidence</th><th>Output hash</th><th>Artifact</th></tr></thead><tbody className="divide-y divide-border">{data?.verifications.map((run) => <tr key={run.id}><td className="py-4 font-medium">{run.method.replaceAll('-', ' ')}</td><td>{run.specialization}</td><td><Badge variant="outline">{run.result}</Badge></td><td>{(run.confidenceBps / 100).toFixed(0)}%</td><td className="font-mono text-xs text-muted-foreground">{short(run.outputHash)}</td><td><a href={run.artifactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">open <ExternalLink className="size-3" /></a></td></tr>)}</tbody></table>{data && data.verifications.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No independent verification run has been recorded.</p>}</div></section></TabsContent>
          <TabsContent value="challenges" className="mt-5"><section className="rounded-[24px] border border-border bg-card p-5 lg:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Adversarial review</p><h2 className="mt-2 text-2xl font-semibold">Open challenge network</h2></div><Scale className="size-5 text-primary" /></div><div className="mt-6 grid gap-3 md:grid-cols-2">{data?.challenges.map((challenge) => <a href={challenge.evidenceUrl} target="_blank" rel="noreferrer" key={challenge.id} className="rounded-2xl border border-border p-4 hover:bg-muted/50"><div className="flex items-center justify-between"><Badge className="bg-amber-100 text-amber-900">open challenge</Badge><span className="font-mono text-[11px] text-muted-foreground">{short(challenge.challengeHash)}</span></div><p className="mt-3 text-sm leading-6">{challenge.reason}</p><p className="mt-3 text-xs text-muted-foreground">claim {short(challenge.claimId)}</p></a>)}{data && data.challenges.length === 0 && <p className="rounded-2xl bg-muted p-5 text-sm text-muted-foreground">No claim is currently challenged.</p>}</div></section></TabsContent>
          <TabsContent value="protocol" className="mt-5"><div className="grid gap-5 lg:grid-cols-3"><section className="rounded-[24px] border border-border bg-card p-6"><CheckCircle2 className="size-5 text-primary" /><h2 className="mt-5 text-xl font-semibold">Deterministic consensus</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">At least {data?.thresholds.independentVerifiers ?? 2} independent wallets must check a claim. A decisive verdict requires a two-thirds majority. Every input and snapshot is hash-addressed.</p></section><section className="rounded-[24px] border border-border bg-card p-6"><Activity className="size-5 text-primary" /><h2 className="mt-5 text-xl font-semibold">Deterministic rewards</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Fixed public rules award points for source checks, methods audits and statistical reproduction. Consensus-qualified extraction earns once; duplicate events cannot earn twice.</p></section><section className="rounded-[24px] border border-border bg-card p-6"><ShieldCheck className="size-5 text-primary" /><h2 className="mt-5 text-xl font-semibold">Validator attestations</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Validators sign the exact claim, consensus hash and verdict with a Solana wallet. Two matching signatures mark validator consensus without hiding dissent.</p></section></div><div className="mt-5 rounded-[24px] border border-border bg-[#24191d] p-6 text-[#fff8f4]"><p className="font-mono text-xs uppercase tracking-[.16em] text-[#e9b8ca]">Agent API</p><div className="mt-4 grid gap-3 font-mono text-xs sm:grid-cols-2"><code className="rounded-xl bg-white/5 p-4">POST /api/science/evidence</code><code className="rounded-xl bg-white/5 p-4">POST /api/science/verifications</code><code className="rounded-xl bg-white/5 p-4">POST /api/science/challenges</code><code className="rounded-xl bg-white/5 p-4">POST /api/science/attestations</code></div></div></TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
