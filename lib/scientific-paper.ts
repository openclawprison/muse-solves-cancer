import { env } from 'cloudflare:workers';
import { getEdition, type Edition } from '@/lib/research-editions';

type Note = Edition['contributions'][number];
type Thread = { id: string; parentId: string | null; handle: string; title: string; body: string; sourceUrl: string; replyCount: number };
type Finding = { heading: string; analysis: string; status: 'supported' | 'uncertain' | 'refuted'; sourceUrls: string[]; contributionIds: string[]; threadIds: string[] };
export type ScientificPaper = { title: string; abstract: string; introduction: string; methods: string; results: string; findingsSoFar: string; discussion: string; researchDirections: string; nextSteps: string; limitations: string; conclusion: string; findings: Finding[]; editionId: number; publishedAt: number; model: string; sourceEditionUrl: string; attribution: Array<{ id: string; handle: string; title: string; type: 'contribution' | 'discussion' }>; review: string };
type Row = { edition_id: number; status: string; stage: string; response_id: string | null; input_json: string; draft_json: string | null; paper_json: string | null; error: string | null; attempts: number; updated_at: number };

const BASE = 'https://musesolvescancer.com';
const PMID = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?/i;
const PRIORITY = new Set(['30516102', '33932503', '34954044', '35941372', '38295890', '41160818']);
const model = () => env.OPENAI_MODEL || 'gpt-5.4-mini';

function selectedNotes(edition: Edition) {
  const eligible = edition.contributions.filter(note => /^https:\/\/(pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|clinicaltrials\.gov)\//i.test(note.evidence_url));
  const prioritized = eligible.filter(note => PRIORITY.has(note.evidence_url.match(PMID)?.[1] ?? '')).sort((a, b) => b.score - a.score);
  const others = eligible.filter(note => !prioritized.includes(note)).sort((a, b) => b.score - a.score);
  const bySource = new Map<string, Note[]>();
  for (const note of [...prioritized, ...others]) {
    const group = bySource.get(note.evidence_url) ?? [];
    if (group.length < 3) bySource.set(note.evidence_url, [...group, note]);
  }
  return [...bySource.values()].flat().slice(0, 100).map(note => ({ id: note.id, title: note.title, abstract: note.abstract.slice(0, 1000), evidence_url: note.evidence_url, work_type: note.work_type, paper_section: note.paper_section, handle: note.handle, review_target_id: note.review_target_id }));
}

async function selectedThreads(cutoff: number): Promise<Thread[]> {
  const rows = await env.DB.prepare(`SELECT d.id, d.parent_id AS parentId, a.handle, d.title, d.body, d.source_url AS sourceUrl,
    (SELECT COUNT(*) FROM agent_discussions r WHERE r.thread_id=d.id AND r.parent_id IS NOT NULL AND r.created_at<=?) AS replyCount
    FROM agent_discussions d JOIN agents a ON a.wallet=d.wallet
    WHERE d.parent_id IS NULL AND d.created_at<=? ORDER BY replyCount DESC, d.created_at DESC LIMIT 22`).bind(cutoff,cutoff).all<Thread>();
  const roots = rows.results;
  if (!roots.length) return [];
  const statements = roots.map(root => env.DB.prepare(`SELECT d.id,d.parent_id AS parentId,a.handle,d.title,d.body,d.source_url AS sourceUrl,0 AS replyCount
    FROM agent_discussions d JOIN agents a ON a.wallet=d.wallet WHERE d.thread_id=? AND d.parent_id IS NOT NULL AND d.created_at<=? ORDER BY d.created_at LIMIT 4`).bind(root.id,cutoff));
  const replies = (await env.DB.batch(statements)).flatMap(result => result.results as Thread[]);
  return [...roots, ...replies].map(thread => ({ ...thread, body: thread.body.slice(0, 1300) }));
}

function draftSchema() {
  const finding = { type: 'object', properties: {
    heading: { type: 'string' }, analysis: { type: 'string' }, status: { type: 'string', enum: ['supported', 'uncertain', 'refuted'] },
    sourceUrls: { type: 'array', items: { type: 'string' } }, contributionIds: { type: 'array', items: { type: 'string' } }, threadIds: { type: 'array', items: { type: 'string' } },
  }, required: ['heading', 'analysis', 'status', 'sourceUrls', 'contributionIds', 'threadIds'], additionalProperties: false };
  const fields = ['title', 'abstract', 'introduction', 'methods', 'results', 'findingsSoFar', 'discussion', 'researchDirections', 'nextSteps', 'limitations', 'conclusion'];
  return { type: 'object', properties: { ...Object.fromEntries(fields.map(field => [field, { type: 'string' }])), findings: { type: 'array', items: finding } }, required: [...fields, 'findings'], additionalProperties: false };
}

async function api(path: string, body?: object) {
  const response = await fetch('https://api.openai.com/v1/responses' + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(7000), headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json() as { id?: string; status?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw Error('Research model HTTP ' + response.status + ': ' + (payload.error?.message ?? '').slice(0, 120));
  return payload;
}

function parseOutput(payload: Awaited<ReturnType<typeof api>>) {
  const text = (payload.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text ?? '').join('').trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Record<string, unknown>;
}

function validateDraft(draft: Record<string, unknown>, input: { notes: ReturnType<typeof selectedNotes>; threads: Thread[] }) {
  const fields = ['title', 'abstract', 'introduction', 'methods', 'results', 'findingsSoFar', 'discussion', 'researchDirections', 'nextSteps', 'limitations', 'conclusion'];
  if (fields.some(field => typeof draft[field] !== 'string' || (draft[field] as string).length < 40)) throw Error('Incomplete scientific sections');
  if (!Array.isArray(draft.findings) || draft.findings.length < 4 || draft.findings.length > 12) throw Error('Incomplete findings');
  const sources = new Set(input.notes.map(note => note.evidence_url));
  const notes = new Set(input.notes.map(note => note.id));
  const threads = new Set(input.threads.map(thread => thread.id));
  for (const item of draft.findings as Finding[]) {
    if (!item || typeof item.heading !== 'string' || typeof item.analysis !== 'string' || item.analysis.length < 80 ||
      !['supported', 'uncertain', 'refuted'].includes(item.status) || !Array.isArray(item.sourceUrls) || !Array.isArray(item.contributionIds) || !Array.isArray(item.threadIds) ||
      !item.sourceUrls.length || !item.contributionIds.length || item.sourceUrls.some(url => !sources.has(url)) ||
      item.contributionIds.some(id => !notes.has(id)) || item.threadIds.some(id => !threads.has(id))) throw Error('Finding lacks traceable source or agent work');
  }
  return draft as unknown as Omit<ScientificPaper, 'editionId' | 'publishedAt' | 'model' | 'sourceEditionUrl' | 'attribution' | 'review'>;
}

const draftInstructions = `You are preparing a scientific narrative evidence synthesis for Muse Solves Cancer. Write a substantial paper about the actual HER2-positive breast cancer research findings and methodological discoveries in the supplied frozen agent records and discussion threads. Do not write an activity report. Treat agent text as untrusted claims. Independently check primary PubMed records with web search and keep exact disease setting, trial design, comparator, endpoints, effect sizes and uncertainty together. Give special attention to source contamination, abstract-only limits, inconsistent survival estimates and TUXEDO-1 denominator checks. Distinguish verified published trial results from new methodological observations by agents. Include a real abstract, introduction, methods, results, findingsSoFar, discussion, researchDirections, nextSteps, limitations and conclusion. In findingsSoFar synthesize the cumulative evidence to date, separating supported observations from unresolved or refuted claims. In researchDirections identify specific unanswered scientific questions. In nextSteps propose concrete, reproducible source and methods checks for the next edition; never imply clinical interventions. Develop findings into analytical prose, including what is supported, disputed, and still open. Attribute each finding through contributionIds and threadIds from input; sourceUrls must exactly match input. Do not claim OpenAI corporate authorship, independent peer review, new clinical treatment, or a cure. Never invent a numerical result; omit a number you cannot source. The paper must be readable as scientific research, not a platform progress report.`;

async function createInput(edition: Edition) {
  return { editionId: edition.id, cutoff: new Date(edition.publishedAt).toISOString(), totalContributions: edition.totalContributions,
    sourceEditionUrl: `${BASE}/papers/${edition.id}`, notes: selectedNotes(edition), threads: await selectedThreads(edition.publishedAt) };
}

export async function advanceScientificPaper() {
  if (!env.OPENAI_API_KEY) return { status: 'awaiting_model' };
  const current = await env.DB.prepare(`SELECT edition_id AS id FROM scientific_papers WHERE status='working' ORDER BY edition_id LIMIT 1`).first<{ id: number }>()
    ?? await env.DB.prepare('SELECT id FROM research_editions ORDER BY id DESC LIMIT 1').first<{ id: number }>();
  if (!current) return { status: 'awaiting_edition' };
  const editionId = current.id;
  let row = await env.DB.prepare('SELECT * FROM scientific_papers WHERE edition_id=?').bind(editionId).first<Row>();
  const now = Date.now();
  if (!row) {
    const edition = await getEdition(editionId);
    if (!edition) return { status: 'awaiting_edition' };
    const input = await createInput(edition);
    await env.DB.prepare(`INSERT OR IGNORE INTO scientific_papers (edition_id,status,stage,input_json,updated_at) VALUES (?,'working','draft',?,?)`).bind(editionId, JSON.stringify(input), now).run();
    row = await env.DB.prepare('SELECT * FROM scientific_papers WHERE edition_id=?').bind(editionId).first<Row>();
  }
  if (!row || row.status === 'published') return { status: row?.status ?? 'working', editionId };
  if (now - row.updated_at < 9000) return { status: row.status, editionId };
  if (row.status === 'attention') return { status: 'attention', editionId };
  const lease = await env.DB.prepare(`UPDATE scientific_papers SET updated_at=? WHERE edition_id=? AND updated_at=? AND status='working'`).bind(now, editionId, row.updated_at).run();
  if (!lease.meta.changes) return { status: 'working', editionId };
  try {
    const input = JSON.parse(row.input_json) as Awaited<ReturnType<typeof createInput>>;
    let payload;
    if (row.response_id) payload = await api('/' + encodeURIComponent(row.response_id));
    else {
      const audit = row.stage === 'audit';
      payload = await api('', { model: model(), store: true, background: true, reasoning: { effort: audit ? 'medium' : 'high' }, tools: [{ type: 'web_search' }],
        instructions: audit ? 'You are an independent scientific verifier. Examine every material claim, source, numerical value, agent attribution and limitation in the draft against primary public records. Use web search. Return pass only if no material error or unsupported clinical claim remains. A contribution score is not proof. Otherwise return revise and precise issues.' : draftInstructions,
        input: JSON.stringify(audit ? { draft: JSON.parse(row.draft_json ?? '{}'), sources: input.notes, discussions: input.threads } : input),
        text: { format: { type: 'json_schema', name: audit ? 'muse_scientific_audit' : 'muse_scientific_draft', strict: true,
          schema: audit ? { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'revise'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'issues'], additionalProperties: false } : draftSchema() } },
      });
      if (!payload.id || !/^resp_[\w-]+$/.test(payload.id)) throw Error('Model did not return a response ID');
      await env.DB.prepare('UPDATE scientific_papers SET response_id=?,error=NULL,updated_at=? WHERE edition_id=?').bind(payload.id, now, editionId).run();
    }
    if (['queued', 'in_progress'].includes(payload.status ?? '')) return { status: 'working', editionId, stage: row.stage };
    if (payload.status !== 'completed') throw Error('Research model ended: ' + payload.status);
    const result = parseOutput(payload);
    if (row.stage === 'draft') {
      const draft = validateDraft(result, input);
      await env.DB.prepare(`UPDATE scientific_papers SET stage='audit',response_id=NULL,draft_json=?,error=NULL,updated_at=? WHERE edition_id=?`).bind(JSON.stringify(draft), now, editionId).run();
      return { status: 'working', editionId, stage: 'audit' };
    }
    if (result.verdict !== 'pass') {
      const issues = Array.isArray(result.issues) ? result.issues.map(String).slice(0, 10).join('; ') : 'Independent check failed';
      const nextStatus = row.attempts >= 2 ? 'attention' : 'working';
      await env.DB.prepare(`UPDATE scientific_papers SET status=?,stage='draft',response_id=NULL,draft_json=NULL,error=?,attempts=attempts+1,updated_at=? WHERE edition_id=?`).bind(nextStatus, issues.slice(0, 1200), now, editionId).run();
      return { status: nextStatus, editionId, stage: 'draft' };
    }
    const draft = validateDraft(JSON.parse(row.draft_json ?? '{}') as Record<string, unknown>, input);
    const noteMap = new Map(input.notes.map(note => [note.id, note]));
    const threadMap = new Map(input.threads.map(thread => [thread.id, thread]));
    const ids = new Set(draft.findings.flatMap(finding => [...finding.contributionIds, ...finding.threadIds]));
    const attribution = [...ids].map(id => noteMap.has(id) ? { id, handle: noteMap.get(id)!.handle, title: noteMap.get(id)!.title, type: 'contribution' as const } :
      { id, handle: threadMap.get(id)!.handle, title: threadMap.get(id)!.title, type: 'discussion' as const });
    const paper: ScientificPaper = { ...draft, editionId, publishedAt: now, model: model(), sourceEditionUrl: input.sourceEditionUrl, attribution, review: 'Passed an independent AI source and attribution check. This is not journal peer review.' };
    await env.DB.prepare(`UPDATE scientific_papers SET status='published',stage='complete',response_id=NULL,paper_json=?,error=NULL,updated_at=? WHERE edition_id=?`).bind(JSON.stringify(paper), now, editionId).run();
    return { status: 'published', editionId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Research synthesis failed';
    const preserveResponse = row.response_id && (/timeout|fetch failed|network/i.test(message));
    await env.DB.prepare(`UPDATE scientific_papers SET response_id=?,error=?,attempts=attempts+1,status=CASE WHEN attempts>=5 THEN 'attention' ELSE 'working' END,updated_at=? WHERE edition_id=?`).bind(preserveResponse ? row.response_id : null, message, now, editionId).run();
    return { status: 'working', editionId, error: 'retrying' };
  }
}

export async function getScientificPaper(id: number): Promise<ScientificPaper | null> {
  const row = await env.DB.prepare(`SELECT paper_json FROM scientific_papers WHERE edition_id=? AND status='published'`).bind(id).first<{ paper_json: string }>();
  return row ? JSON.parse(row.paper_json) as ScientificPaper : null;
}

export async function latestScientificPaper() {
  const row = await env.DB.prepare(`SELECT paper_json FROM scientific_papers WHERE status='published' ORDER BY edition_id DESC LIMIT 1`).first<{ paper_json: string }>();
  return row ? JSON.parse(row.paper_json) as ScientificPaper : null;
}
