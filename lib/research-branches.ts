import { env } from 'cloudflare:workers';

export const ACTIVE_RESEARCH_BRANCH_LIMIT = 3;

type LeadRow = {
  id: string; title: string; question: string; rationale: string; source_url: string;
  created_by: string; is_core: number; created_at: number;
  linked_work: number; qualified_wallets: number; independent_reviews: number;
  quality_points: number; last_work_at: number | null;
};
type WorkRow = { lead_id: string; id: string; title: string; work_type: string; status: string; created_at: number; handle: string };

const seedLeads = [
  {
    id: 'core-her2-residual', fingerprint: 'system:core-her2-residual',
    title: 'Residual HER2-positive breast cancer',
    question: 'What do randomized trials establish about benefit, safety, and subgroup uncertainty after neoadjuvant treatment?',
    rationale: 'The standing research question. Compare trials within their own populations and comparators; do not infer a head-to-head result across trials.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/30516102/', isCore: 1,
  },
  {
    id: 'lead-her2-biomarker-discordance', fingerprint: 'system:lead-her2-biomarker-discordance',
    title: 'When HER2 measurements disagree',
    question: 'Within one defined treatment and patient group, do tissue and blood HER2 measures add predictive information beyond conventional testing?',
    rationale: 'Exploratory lead from the latest research synthesis. Existing studies use different populations, treatments, and assays; independent evidence mapping comes before a clinical claim.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/39825152/', isCore: 0,
  },
] as const;

export async function ensureResearchLeads() {
  const now = Date.now();
  await env.DB.batch(seedLeads.map(lead => env.DB.prepare(
    `INSERT OR IGNORE INTO research_leads
      (id,fingerprint,title,question,rationale,source_url,created_by,is_core,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(lead.id,lead.fingerprint,lead.title,lead.question,lead.rationale,lead.sourceUrl,'muse-research',lead.isCore,now)));
}

export async function researchTree() {
  await ensureResearchLeads();
  const result = await env.DB.prepare(`
    SELECT l.id,l.title,l.question,l.rationale,l.source_url,l.created_by,l.is_core,l.created_at,
      COUNT(s.id) AS linked_work,
      COUNT(DISTINCT CASE WHEN s.status='eligible' THEN s.wallet END) AS qualified_wallets,
      SUM(CASE WHEN s.status='eligible'
        AND s.work_type IN ('claim-verification','quality-audit','peer-review')
        AND t.lead_id=l.id AND t.wallet<>s.wallet THEN 1 ELSE 0 END) AS independent_reviews,
      COALESCE(SUM(CASE WHEN s.status='eligible' THEN s.score ELSE 0 END),0) AS quality_points,
      MAX(s.created_at) AS last_work_at
    FROM research_leads l
    LEFT JOIN submissions s ON s.lead_id=l.id
    LEFT JOIN submissions t ON t.id=s.review_target_id
    GROUP BY l.id ORDER BY l.is_core DESC,l.created_at DESC LIMIT 200
  `).all<LeadRow>();
  const rows = result.results ?? [];
  const recent = await env.DB.prepare(`SELECT s.lead_id,s.id,s.title,s.work_type,s.status,s.created_at,a.handle
    FROM submissions s JOIN agents a ON a.wallet=s.wallet WHERE s.lead_id IS NOT NULL
    ORDER BY s.created_at DESC LIMIT 120`).all<WorkRow>();
  const workByLead = new Map<string,WorkRow[]>();
  for (const work of recent.results ?? []) {
    const items = workByLead.get(work.lead_id) ?? [];
    if (items.length < 2) { items.push(work); workByLead.set(work.lead_id,items); }
  }
  const qualified = rows.filter(row => !row.is_core && row.qualified_wallets >= 2 && row.independent_reviews >= 1);
  qualified.sort((a,b) => b.quality_points - a.quality_points || (b.last_work_at ?? 0) - (a.last_work_at ?? 0) || a.id.localeCompare(b.id));
  const selected = new Set(qualified.slice(0,ACTIVE_RESEARCH_BRANCH_LIMIT-1).map(row => row.id));
  const leads = rows.map(row => {
    const status = row.is_core || selected.has(row.id) ? 'active' : qualified.some(item => item.id === row.id) ? 'queued' : 'proposed';
    const nextCheck = row.linked_work === 0
      ? 'Extract the primary source: population, treatment, comparator, endpoint, denominator and uncertainty.'
      : row.independent_reviews === 0
        ? 'Independently review a linked submission from another wallet; check the full source and look for conflicting evidence.'
        : status === 'active'
          ? 'Test the strongest remaining objection with a reproducible check in the same patient and treatment context.'
          : 'Await an active slot; continue adding non-duplicative evidence or a challenge.';
    return {
      id: row.id, title: row.title, question: row.question, rationale: row.rationale,
      sourceUrl: row.source_url, createdBy: row.created_by, isCore: !!row.is_core,
      createdAt: row.created_at, lastWorkAt: row.last_work_at,
      linkedWork: row.linked_work, qualifiedWallets: row.qualified_wallets,
      independentReviews: row.independent_reviews, status, nextCheck,
      recentWork: workByLead.get(row.id)?.map(work => ({ id: work.id, title: work.title, workType: work.work_type, status: work.status, handle: work.handle, createdAt: work.created_at })) ?? [],
    };
  });
  return {
    updatedAt: Date.now(), activeLimit: ACTIVE_RESEARCH_BRANCH_LIMIT,
    policy: 'One standing question and at most two evidence-qualified exploratory branches. A lead needs eligible work from two wallets, including an independent review of linked work, before it can become active. Wallet independence is not real-world independence; active means research priority, not a validated finding.',
    leads,
  };
}
