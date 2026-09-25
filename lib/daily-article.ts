import { env } from 'cloudflare:workers';
import { getEdition } from '@/lib/research-editions';
import { latestScientificPaper, type ScientificPaper } from '@/lib/scientific-paper';
import { dayTwoArticle } from '@/lib/research/day-two';
import { dayThreeArticle } from '@/lib/research/day-three';

export type DailyArticle = {
  day: string; title: string; dek: string; editionId: number; publishedAt: number;
  researchSnapshot: { totalContributions: number; newContributions: number; registeredAgentWallets: number };
  abstract: string; methods: string; results: string;
  findings: Array<{ heading: string; analysis: string; status: string; sources: string[]; contributors: string[] }>;
  discussion: string; researchDirections: string; nextSteps: string; limitations: string; conclusion: string;
  reviewNote: string;
};

function makeArticle(day: string, paper: ScientificPaper, edition: Awaited<ReturnType<typeof getEdition>>, publishedAt: number): DailyArticle {
  const attributed = new Map(paper.attribution.map(item => [item.id, item.handle]));
  return {
    day,
    title: paper.title,
    dek: 'A daily, evidence-linked review of HER2-positive breast cancer research—what the current literature supports, what remains uncertain, and which checks come next.',
    editionId: paper.editionId,
    publishedAt,
    researchSnapshot: {
      totalContributions: edition?.totalContributions ?? 0,
      newContributions: edition?.newContributions ?? 0,
      registeredAgentWallets: edition?.agents ?? 0,
    },
    abstract: paper.abstract,
    methods: paper.methods,
    results: paper.results,
    findings: paper.findings.map(finding => ({
      heading: finding.heading, analysis: finding.analysis, status: finding.status,
      sources: finding.sourceUrls,
      contributors: [...new Set(finding.contributionIds.map(id => attributed.get(id)).filter((handle): handle is string => Boolean(handle)))],
    })),
    discussion: paper.discussion,
    researchDirections: paper.researchDirections,
    nextSteps: paper.nextSteps,
    limitations: paper.limitations,
    conclusion: paper.conclusion,
    reviewNote: 'This daily article is compiled from the latest completed AI-assisted scientific synthesis and frozen agent evidence snapshot. “Scored” means eligible under the contribution system; it does not mean scientifically validated. Automated checks are not expert peer review. This is research reporting, not medical advice, a treatment recommendation, or evidence of a cure.',
  };
}

async function ensureTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_research_articles (
    day TEXT PRIMARY KEY NOT NULL, edition_id INTEGER NOT NULL, published_at INTEGER NOT NULL, article_json TEXT NOT NULL
  )`).run();
}

export async function publishDailyResearchArticle() {
  await ensureTable();
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const exists = await env.DB.prepare('SELECT day FROM daily_research_articles WHERE day=?').bind(day).first<{ day: string }>();
  if (exists) return { status: 'already_published', day };
  const paper = await latestScientificPaper();
  if (!paper) return { status: 'awaiting_checked_synthesis', day };
  const previous = await env.DB.prepare('SELECT edition_id AS editionId FROM daily_research_articles ORDER BY day DESC LIMIT 1')
    .first<{ editionId: number }>();
  if (previous && paper.editionId <= previous.editionId) {
    return { status: 'awaiting_new_checked_synthesis', day, latestEditionId: paper.editionId };
  }
  const edition = await getEdition(paper.editionId);
  const article = makeArticle(day, paper, edition, now);
  const saved = await env.DB.prepare('INSERT OR IGNORE INTO daily_research_articles (day, edition_id, published_at, article_json) VALUES (?, ?, ?, ?)')
    .bind(day, paper.editionId, now, JSON.stringify(article)).run();
  return { status: saved.meta.changes ? 'published' : 'already_published', day, editionId: paper.editionId };
}

export async function latestDailyResearchArticle(day?: string): Promise<DailyArticle | null> {
  const dayThreeEdition = await getEdition(dayThreeArticle.editionId);
  const checkedDayThree = dayThreeEdition ? {
    ...dayThreeArticle,
    researchSnapshot: {
      totalContributions: dayThreeEdition.totalContributions,
      newContributions: dayThreeEdition.newContributions,
      registeredAgentWallets: dayThreeEdition.agents,
    },
  } : null;
  if (day === dayThreeArticle.day) return checkedDayThree;
  if (day === dayTwoArticle.day) return dayTwoArticle;
  await ensureTable();
  const row = day
    ? await env.DB.prepare('SELECT article_json FROM daily_research_articles WHERE day=?').bind(day).first<{ article_json: string }>()
    : await env.DB.prepare('SELECT article_json FROM daily_research_articles ORDER BY day DESC LIMIT 1').first<{ article_json: string }>();
  const article = row ? JSON.parse(row.article_json) as DailyArticle : null;
  if (day) return article;
  // A later timestamp must not replace the checked review with an older snapshot.
  if (article && article.day > (checkedDayThree?.day ?? dayTwoArticle.day) && article.editionId > (checkedDayThree?.editionId ?? dayTwoArticle.editionId)) return article;
  return checkedDayThree ?? dayTwoArticle;
}
