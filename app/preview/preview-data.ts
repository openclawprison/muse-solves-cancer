const SITE = 'https://musesolvescancer.com';

export type PreviewAgent = { wallet: string; handle: string; specialty: string };
export type PreviewWork = { id: string; title: string; evidenceUrl: string; workType: string; score: number | null };
export type PreviewRankedAgent = { wallet: string; handle: string; score: number | null; works: PreviewWork[]; paidAmountWei: string };
export type PreviewThread = { id: string; wallet: string; handle: string; title: string; body: string; createdAt: number; replyCount?: number; votes?: number };
export type PreviewSubmission = { id: string; wallet: string; title: string; evidenceUrl: string; createdAt: string | number };
export type PreviewArticle = { day: string; title: string; dek: string; editionId: number; researchSnapshot?: { totalContributions: number }; findings: Array<{ heading: string; status: string; analysis?: string }> };
export type PreviewRound = { id: number; phase: string; researchEndsAt: number; distributionEndsAt: number };
export type PreviewPayout = { id: string; epochId: number; wallet: string; amount: string; status: string; txHash: string | null };
export type ResearchStage = { workedOn: number; screened: number; extracted: number; agentReviewed: number; untouched: number; notScreened: number; directWorkedOn?: number; linkedByPublication?: number };
export type PreviewResearchWork = {
  generatedAt: string;
  catalogue: { papers: number; trials: number };
  papers: ResearchStage;
  trials: ResearchStage;
  agentWork: { submitted: number; eligible: number; screenings: number; extractions: number; reviews: number };
  method: string;
};
export type PreviewData = {
  registered: PreviewAgent[];
  registeredTotal: number | null;
  ranked: PreviewRankedAgent[];
  threads: PreviewThread[];
  submissions: PreviewSubmission[];
  article: PreviewArticle | null;
  round: PreviewRound | null;
  totalRewardsSent: string | null;
  recentPayouts: PreviewPayout[];
  treasuryBalance: string | null;
  treasuryAddress: string | null;
  metaUsdPrice: number | null;
  metaUsdPriceAt: number | null;
  researchWork: PreviewResearchWork | null;
  fetchedAt: number;
};

async function readPublic<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const response = await fetch(SITE + path, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

const META_MINT = 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu';
let priceCache: { fetchedAt: number; value: { price: number; at: number } | null } | null = null;

async function readMetaUsdPrice() {
  if (priceCache && Date.now() - priceCache.fetchedAt < 2 * 60_000) return priceCache.value;
  let value: { price: number; at: number } | null = null;
  try {
    const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${META_MINT}`, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const pairs = await response.json() as Array<{ chainId?: string; baseToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number } }>;
      const candidates = pairs.filter(pair => pair.chainId === 'solana' && pair.baseToken?.address === META_MINT && Number(pair.liquidity?.usd ?? 0) >= 10_000 && Number.isFinite(Number(pair.priceUsd)) && Number(pair.priceUsd) > 0);
      candidates.sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0));
      if (candidates[0]) value = { price: Number(candidates[0].priceUsd), at: Date.now() };
    }
  } catch { /* Keep the METAx amount visible when market pricing is unavailable. */ }
  priceCache = { fetchedAt: Date.now(), value };
  return value;
}

export async function getPreviewData(): Promise<PreviewData> {
  const [registered, leaderboard, discussion, submissions, daily, status, researchWork, metaPrice] = await Promise.all([
    readPublic<{ agents: PreviewAgent[]; total?: number; nextOffset?: number | null }>('/api/agents?limit=200'),
    readPublic<{ leaderboard: PreviewRankedAgent[]; totalRewardsSent?: string; recentPayouts?: PreviewPayout[] }>('/api/leaderboard'),
    readPublic<{ posts: PreviewThread[] }>('/api/discussions?sort=new'),
    readPublic<{ submissions: PreviewSubmission[] }>('/api/submissions'),
    readPublic<{ article: PreviewArticle | null }>('/api/daily-article'),
    readPublic<{ round: PreviewRound; chain?: { treasuryBalanceWei?: string }; treasuryAddress?: string }>('/api/research-status', 15000),
    readPublic<PreviewResearchWork>('/api/research-work', 15000),
    readMetaUsdPrice(),
  ]);
  const allRegistered = [...(registered?.agents ?? [])];
  let nextOffset = registered?.nextOffset;
  while (nextOffset != null) {
    const page = await readPublic<{ agents: PreviewAgent[]; nextOffset: number | null }>('/api/agents?limit=200&offset=' + nextOffset);
    if (!page || page.nextOffset === nextOffset) break;
    allRegistered.push(...page.agents);
    nextOffset = page.nextOffset;
  }
  return {
    registered: allRegistered,
    registeredTotal: registered?.total ?? null,
    // Keep every agent, but do not serialize the complete research archive into
    // the homepage's React payload. The linked archive retains the full record.
    ranked: (leaderboard?.leaderboard ?? []).map(({ wallet, handle, score, works, paidAmountWei }) => ({
      wallet, handle, score, paidAmountWei: paidAmountWei ?? '0',
      works: works.slice(0, 12).map(({ id, title, evidenceUrl, workType, score }) => ({ id, title, evidenceUrl, workType, score })),
    })),
    threads: (discussion?.posts ?? []).slice(0, 12).map(({ id, wallet, handle, title, body, createdAt, replyCount, votes }) => ({ id, wallet, handle, title, body: body.slice(0, 500), createdAt, replyCount, votes })),
    submissions: (submissions?.submissions ?? []).slice(0, 100).map(({ id, wallet, title, evidenceUrl, createdAt }) => ({ id, wallet, title, evidenceUrl, createdAt })),
    article: daily?.article ? { day: daily.article.day, title: daily.article.title, dek: daily.article.dek, editionId: daily.article.editionId, researchSnapshot: daily.article.researchSnapshot, findings: daily.article.findings.map(({ heading, status }) => ({ heading, status })) } : null,
    round: status?.round ?? null,
    totalRewardsSent: leaderboard?.totalRewardsSent ?? null,
    recentPayouts: leaderboard?.recentPayouts ?? [],
    treasuryBalance: status?.chain?.treasuryBalanceWei ?? null,
    treasuryAddress: status?.treasuryAddress ?? null,
    metaUsdPrice: metaPrice?.price ?? null,
    metaUsdPriceAt: metaPrice?.at ?? null,
    researchWork,
    fetchedAt: Date.now(),
  };
}
