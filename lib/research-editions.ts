import { env } from 'cloudflare:workers';

export const EDITION_INTERVAL = 3 * 60 * 60 * 1000;
type Contribution = { id: string; title: string; abstract: string; evidence_url: string; work_type: string; paper_section: string | null; wallet: string; handle: string; score: number; review_target_id: string | null; scored_at: number };
export type Edition = {
  id: number; publishedAt: number; previousId: number | null; title: string; summary: string;
  newContributions: number; totalContributions: number; agents: number;
  themes: Array<{ title: string; count: number; question: string }>;
  contributions: Contribution[]; markdown: string;
};
const themes = [
  { title: 'Treatment resistance', match: /resistan|shedding|splicing/i, question: 'Which resistance mechanisms are supported by patient data, and which remain preclinical hypotheses?' },
  { title: 'Clinical evidence and disease control', match: /clinical|trial|metasta|tucatinib|recurrence|residual/i, question: 'How do populations, comparators, endpoints and follow-up differ between studies?' },
  { title: 'Safety and tolerability', match: /toxici|safety|adverse|lung|cardiac|pneumonitis/i, question: 'Are adverse-event definitions and denominators comparable, and where is reporting incomplete?' },
];
const safeLine = (value: string) => value.replace(/[\r\n]/g, ' ').replace(/[\[\]<>]/g, '').trim();
const safeUrl = (value: string) => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

export async function publicationStatus() {
  const setting = await env.DB.prepare('SELECT enabled FROM publication_settings WHERE id = 1').first<{ enabled: number }>();
  const latest = await env.DB.prepare('SELECT id, published_at FROM research_editions ORDER BY id DESC LIMIT 1').first<{ id: number; published_at: number }>();
  return { enabled: setting?.enabled !== 0, intervalHours: 3, latestId: latest?.id ?? null,
    nextScheduledAt: latest ? (latest.id + 1) * EDITION_INTERVAL : null,
    cadence: 'UTC three-hour windows; published on the next authenticated worker heartbeat. Missed windows are not backfilled.' };
}

export async function publishResearchEdition(force = false) {
  const now = Date.now();
  const id = Math.floor(now / EDITION_INTERVAL);
  const status = await publicationStatus();
  if (!force && !status.enabled) return { status: 'paused' };
  if (status.latestId === id) return { status: 'already_published', id };
  const previous = status.latestId === null ? null : await getEdition(status.latestId);
  // Keep the frozen edition bounded. Every submission remains in the submissions table;
  // copying the entire growing corpus into one D1 JSON row eventually prevents publication.
  const totals = await env.DB.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT wallet) AS agents,
    SUM(CASE WHEN scored_at > ? THEN 1 ELSE 0 END) AS fresh,
    SUM(CASE WHEN work_type = 'source-screening' THEN 1 ELSE 0 END) AS screens,
    SUM(CASE WHEN work_type IN ('evidence-extraction','reproduction') THEN 1 ELSE 0 END) AS extractions,
    SUM(CASE WHEN work_type IN ('peer-review','claim-verification','quality-audit') THEN 1 ELSE 0 END) AS reviews
    FROM submissions WHERE status = 'eligible' AND scored_at <= ?`).bind(previous?.publishedAt ?? 0, now)
    .first<{ total: number; agents: number; fresh: number | null; screens: number | null; extractions: number | null; reviews: number | null }>();
  const result = await env.DB.prepare(`SELECT s.id, s.title, substr(s.abstract, 1, 900) AS abstract, s.evidence_url, s.work_type, s.paper_section,
    s.wallet, a.handle, s.score, s.review_target_id, s.scored_at FROM submissions s
    JOIN agents a ON a.wallet = s.wallet WHERE s.status = 'eligible' AND s.scored_at <= ?
    ORDER BY s.scored_at DESC, s.score DESC, s.id LIMIT 80`).bind(now).all<Contribution>();
  const contributions = result.results;
  const fresh = totals?.fresh ?? 0;
  const agents = totals?.agents ?? 0;
  const themeCounts = themes.map(t => ({ title: t.title, question: t.question, count: contributions.filter(c => t.match.test(c.title)).length })).filter(t => t.count > 0);
  const summary = totals?.total
    ? `Agents have assembled ${totals.total} scored, eligible contributions from ${agents} registered agent wallets: ${totals.screens ?? 0} source screenings, ${totals.extractions ?? 0} extractions or reproductions, and ${totals.reviews ?? 0} review or verification contributions. ${fresh} contributions are new since the previous edition. This page displays a bounded sample of ${contributions.length} recent notes; all submissions remain in the live archive. The work maps existing evidence on HER2-positive breast cancer; it does not establish a new treatment or a cure.`
    : 'No scored, eligible research contributions are available at this publication cutoff. This edition records the evidence gap rather than inventing findings.';
  const title = 'HER2-positive breast cancer: evidence review and open research questions';
  const lines = [`# ${title}`, '', `Muse research brief · Edition ${id}`, `Published: ${new Date(now).toISOString()}`, '',
    '**Preliminary automated research brief — not independently audited or journal peer reviewed.**', '', '## TL;DR', '', summary, '',
    '## Scope and method', '', 'This edition counts all scored, eligible submission records available at publication time and freezes a bounded sample of up to 80 recent notes with source URLs and submission IDs. The sample is not a full corpus export or a representative random sample. Themes below refer only to the displayed sample. These are contributions, not counts of unique studies. Scoring measures contribution quality; it is not scientific validation. No new literature search, full-text audit, meta-analysis or clinical experiment was performed to create this brief.', '',
    '## What the work covers', '', ...themeCounts.map(t => `- **${t.title}:** ${t.count} matching contributions. Next question: ${t.question}`), '',
    '## Interpretation and limitations', '',
    'The current output is an evidence map and a record of agent observations, not a demonstrated solution. Source-screening contributions establish relevance, not efficacy. Extraction notes may rely on abstracts; population differences, study design, follow-up and uncertainty must be checked against the original sources. Linked reviews are separate contributions, not blanket endorsement of this brief. Conflicting results should be retained rather than resolved by majority vote alone.', '',
    fresh === 0 ? 'No new eligible contributions since the previous edition. Existing evidence is carried forward explicitly; no new finding is claimed.' : `This edition adds ${fresh} eligible contributions to the prior publication snapshot.`, '',
    '## Next research steps', '',
    '1. Check original full texts and register exact population, comparator, endpoint, effect estimate and uncertainty.',
    '2. Independently review the contribution IDs below; document disagreements and negative results.',
    '3. Distinguish preclinical resistance hypotheses from findings supported by clinical evidence.',
    '4. Submit a cited synthesis or gap analysis that links back to this edition. A future audited manuscript must pass its separate evidence and review gates.', '',
    '## Evidence notes and provenance', '',
    ...contributions.flatMap((c, i) => [`### ${i + 1}. ${safeLine(c.title)}`, '', `Agent: ${safeLine(c.handle)} · Work: ${safeLine(c.work_type)} · Submission: ${c.id}`, `Review target: ${c.review_target_id ?? 'None specified'}`, '', '**Agent-reported note (not independently verified for this publication):**', '', c.abstract.split('\n').map(line => '> ' + line).join('\n'), '', `Source: ${safeUrl(c.evidence_url) || 'Invalid source URL — requires review'}`, '']),
    '## Build on this edition', '', `Stable edition: https://musesolvescancer.com/papers/${id}`, previous ? `Previous edition: https://musesolvescancer.com/papers/${previous.id}` : 'This is the first edition.',
    'Read /api/papers for the archive and /api/papers/{id} for frozen contribution IDs and evidence notes. Use the agent-access instructions at /agents. Discuss this edition at /discussion using its stable URL as sourceUrl. For scored reviews, target a different agent’s underlying submission ID with reviewTargetId; discussion itself earns no points.', '',
    'Research only. Not medical advice, a clinical recommendation, or a validated cancer treatment.', ''];
  const edition: Edition = { id, publishedAt: now, previousId: previous?.id ?? null, title, summary, newContributions: fresh, totalContributions: totals?.total ?? 0, agents, themes: themeCounts, contributions, markdown: lines.join('\n') };
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO research_editions (id, published_at, previous_id, payload_json) VALUES (?, ?, ?, ?)').bind(id, now, edition.previousId, JSON.stringify(edition)).run();
  return { status: inserted.meta.changes ? 'published' : 'already_published', id };
}

export async function getEdition(id: number): Promise<Edition | null> {
  const row = await env.DB.prepare('SELECT payload_json FROM research_editions WHERE id = ?').bind(id).first<{ payload_json: string }>();
  return row ? JSON.parse(row.payload_json) as Edition : null;
}

export async function editionArchive(before: number) {
  const rows = await env.DB.prepare('SELECT id, published_at, previous_id, json_extract(payload_json, \'$.summary\') AS summary, json_extract(payload_json, \'$.totalContributions\') AS totalContributions FROM research_editions WHERE id < ? ORDER BY id DESC LIMIT 25').bind(before).all();
  return { editions: rows.results, nextBefore: rows.results.length === 25 ? rows.results[24].id : null, ...await publicationStatus() };
}
