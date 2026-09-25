import { env } from 'cloudflare:workers';
import catalogueIds from '@/data/research-catalogue-ids.json';
import trialPublicationLinks from '@/data/trial-publication-links.json';

type SourceRow = { url: string; screened: number; extracted: number };
type ReviewRow = { url: string };
type Stage = { workedOn: number; screened: number; extracted: number; agentReviewed: number; untouched: number; notScreened: number };
type Flags = { screened: boolean; extracted: boolean; reviewed: boolean };

const catalogue = {
  paper: new Set(catalogueIds.papers),
  trial: new Set(catalogueIds.trials),
};

function catalogueKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const paper = host === 'pubmed.ncbi.nlm.nih.gov'
      ? url.pathname.match(/^\/(\d+)\/?$/)
      : host === 'www.ncbi.nlm.nih.gov' ? url.pathname.match(/^\/pubmed\/(\d+)\/?$/) : null;
    if (paper && catalogue.paper.has(paper[1])) return `paper:${paper[1]}`;
    if (host === 'clinicaltrials.gov' || host === 'www.clinicaltrials.gov') {
      const trial = url.pathname.match(/^\/(?:study|ct2\/show)\/(NCT\d{8})\/?$/i);
      const id = trial?.[1].toUpperCase();
      if (id && catalogue.trial.has(id)) return `trial:${id}`;
    }
  } catch { /* Invalid URLs are not counted as catalogue coverage. */ }
  return null;
}

async function pagedRows<T>(sql: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 20000; offset += 400) {
    const page = await env.DB.prepare(sql).bind(400, offset).all<T>();
    rows.push(...page.results);
    if (page.results.length < 400) return rows;
  }
  throw new Error('Research coverage exceeds the bounded query window.');
}

function stageCount(map: Map<string, Flags>, kind: 'paper' | 'trial'): Stage {
  const values = [...map].filter(([key]) => key.startsWith(kind + ':')).map(([, flags]) => flags);
  const total = catalogue[kind].size;
  const screened = values.filter(item => item.screened).length;
  const workedOn = values.length;
  return {
    workedOn,
    screened,
    extracted: values.filter(item => item.extracted).length,
    agentReviewed: values.filter(item => item.reviewed).length,
    untouched: Math.max(0, total - workedOn),
    notScreened: Math.max(0, total - screened),
  };
}

function relatedKeys(key: string): string[] {
  if (!key.startsWith('paper:')) return [key];
  const pmid = key.slice(6);
  const linked = (trialPublicationLinks.byPmid as Record<string, string[]>)[pmid] ?? [];
  return [key, ...linked.filter(id => catalogue.trial.has(id)).map(id => `trial:${id}`)];
}

let cached: { at: number; value: Awaited<ReturnType<typeof calculateResearchWork>> } | null = null;

async function calculateResearchWork() {
  const [sourceRows, reviewRows, work] = await Promise.all([
    pagedRows<SourceRow>(`SELECT evidence_url AS url,
      MAX(CASE WHEN work_type = 'source-screening' THEN 1 ELSE 0 END) AS screened,
      MAX(CASE WHEN work_type IN ('evidence-extraction','reproduction') THEN 1 ELSE 0 END) AS extracted
      FROM submissions WHERE status = 'eligible'
      AND (evidence_url LIKE '%pubmed.ncbi.nlm.nih.gov/%' OR evidence_url LIKE '%clinicaltrials.gov/%')
      GROUP BY evidence_url ORDER BY evidence_url LIMIT ? OFFSET ?`),
    pagedRows<ReviewRow>(`SELECT target.evidence_url AS url FROM submissions review
      JOIN submissions target ON target.id = review.review_target_id
      WHERE review.status = 'eligible' AND target.status = 'eligible'
      AND review.wallet <> target.wallet
      AND review.work_type IN ('peer-review','quality-audit','claim-verification')
      AND target.work_type NOT IN ('peer-review','quality-audit','claim-verification')
      AND (target.evidence_url LIKE '%pubmed.ncbi.nlm.nih.gov/%' OR target.evidence_url LIKE '%clinicaltrials.gov/%')
      GROUP BY target.evidence_url ORDER BY target.evidence_url LIMIT ? OFFSET ?`),
    env.DB.prepare(`SELECT COUNT(*) AS submitted,
      SUM(CASE WHEN status='eligible' THEN 1 ELSE 0 END) AS eligible,
      SUM(CASE WHEN status='eligible' AND work_type='source-screening' THEN 1 ELSE 0 END) AS screenings,
      SUM(CASE WHEN status='eligible' AND work_type IN ('evidence-extraction','reproduction') THEN 1 ELSE 0 END) AS extractions,
      SUM(CASE WHEN status='eligible' AND work_type IN ('peer-review','quality-audit','claim-verification') THEN 1 ELSE 0 END) AS reviews
      FROM submissions`).first<{ submitted: number; eligible: number; screenings: number; extractions: number; reviews: number }>(),
  ]);
  const sources = new Map<string, Flags>();
  const directTrials = new Set<string>();
  const publicationLinkedTrials = new Set<string>();
  for (const row of sourceRows) {
    const key = catalogueKey(row.url);
    if (!key) continue;
    if (key.startsWith('trial:')) directTrials.add(key);
    for (const related of relatedKeys(key)) {
      if (related.startsWith('trial:') && related !== key) publicationLinkedTrials.add(related);
      const flags = sources.get(related) ?? { screened: false, extracted: false, reviewed: false };
      flags.screened ||= Boolean(row.screened);
      flags.extracted ||= Boolean(row.extracted);
      sources.set(related, flags);
    }
  }
  for (const row of reviewRows) {
    const key = catalogueKey(row.url);
    if (!key) continue;
    if (key.startsWith('trial:')) directTrials.add(key);
    for (const related of relatedKeys(key)) {
      if (related.startsWith('trial:') && related !== key) publicationLinkedTrials.add(related);
      const flags = sources.get(related) ?? { screened: false, extracted: false, reviewed: false };
      flags.reviewed = true;
      sources.set(related, flags);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    catalogue: { papers: catalogue.paper.size, trials: catalogue.trial.size },
    papers: stageCount(sources, 'paper'),
    trials: {
      ...stageCount(sources, 'trial'),
      directWorkedOn: directTrials.size,
      linkedByPublication: publicationLinkedTrials.size,
    },
    agentWork: {
      submitted: work?.submitted ?? 0,
      eligible: work?.eligible ?? 0,
      screenings: work?.screenings ?? 0,
      extractions: work?.extractions ?? 0,
      reviews: work?.reviews ?? 0,
    },
    method: 'Distinct catalogue PubMed and ClinicalTrials.gov IDs in eligible submissions. Trial coverage also includes indexed PubMed articles listed as RESULT or DERIVED publications in official ClinicalTrials.gov study references; a trial is counted once across direct and publication links. Publication crosswalk generated ' + trialPublicationLinks.generatedAt + '. Agent-reviewed means an eligible review linked to an eligible non-review submission by a different wallet; it does not mean full-text reading, accurate claims, expert peer review, or scientific validation. DOI-only and unmatched links are excluded. Counts can overlap across stages.',
  };
}

export async function getResearchWork() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const value = await calculateResearchWork();
  cached = { at: Date.now(), value };
  return value;
}
