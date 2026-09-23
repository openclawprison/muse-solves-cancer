import { env } from 'cloudflare:workers';
import { getEdition, type Edition } from '@/lib/research-editions';
import { findingHasGroundedSource, selectPaperNotes, sourceKey } from '@/lib/paper-quality';

type Thread = { id: string; parentId: string | null; handle: string; title: string; body: string; sourceUrl: string; replyCount: number };
type Finding = { heading: string; analysis: string; status: 'supported' | 'uncertain' | 'refuted'; sourceUrls: string[]; contributionIds: string[]; threadIds: string[] };
export type ScientificPaper = { title: string; abstract: string; introduction: string; methods: string; results: string; findingsSoFar: string; discussion: string; researchDirections: string; nextSteps: string; limitations: string; conclusion: string; findings: Finding[]; editionId: number; publishedAt: number; model: string; sourceEditionUrl: string; sourceRecords?: PubMedRecord[]; attribution: Array<{ id: string; handle: string; title: string; type: 'contribution' | 'discussion' }>; review: string };
type Row = { edition_id: number; status: string; stage: string; response_id: string | null; input_json: string; draft_json: string | null; paper_json: string | null; error: string | null; attempts: number; updated_at: number };

const BASE = 'https://musesolvescancer.com';
const model = () => env.OPENAI_MODEL || 'gpt-5.4-mini';
type PubMedRecord = { pmid: string; url: string; found: boolean; title: string | null; publicationTypes: string[]; published: string | null };

function selectedNotes(edition: Edition) {
  return selectPaperNotes(edition.contributions);
}

async function pubMedRecords(notes: ReturnType<typeof selectedNotes>): Promise<PubMedRecord[]> {
  const pmids = [...new Set(notes.map(note => note.evidence_url.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?/i)?.[1]).filter((id): id is string => Boolean(id)))];
  if (!pmids.length) return [];
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  url.search = new URLSearchParams({ db: 'pubmed', id: pmids.join(','), retmode: 'json', tool: 'muse-solves-cancer' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw Error(`PubMed source lookup returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: Record<string, unknown> };
  if (!payload.result || !Array.isArray(payload.result.uids)) throw Error('PubMed source lookup returned an invalid response');
  return pmids.map(pmid => {
    const row = payload.result?.[pmid] as { title?: unknown; pubtype?: unknown; pubdate?: unknown } | undefined;
    return { pmid, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      found: typeof row?.title === 'string' && row.title.trim().length > 0,
      title: typeof row?.title === 'string' ? row.title : null,
      publicationTypes: Array.isArray(row?.pubtype) ? row.pubtype.filter((item): item is string => typeof item === 'string') : [],
      published: typeof row?.pubdate === 'string' ? row.pubdate : null };
  });
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
  const payload = await response.json() as { id?: string; status?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string }; incomplete_details?: { reason?: string } };
  if (!response.ok) throw Error('Research model HTTP ' + response.status + ': ' + (payload.error?.message ?? '').slice(0, 120));
  return payload;
}

function parseOutput(payload: Awaited<ReturnType<typeof api>>) {
  const text = (payload.output ?? []).flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text ?? '').join('').trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as Record<string, unknown>;
}

function validateDraft(draft: Record<string, unknown>, input: { notes: ReturnType<typeof selectedNotes>; threads: Thread[]; sourceRecords?: PubMedRecord[] }) {
  const fields = ['title', 'abstract', 'introduction', 'methods', 'results', 'findingsSoFar', 'discussion', 'researchDirections', 'nextSteps', 'limitations', 'conclusion'];
  if (fields.some(field => typeof draft[field] !== 'string' || (draft[field] as string).length < 40)) throw Error('Incomplete scientific sections');
  if (!Array.isArray(draft.findings) || draft.findings.length < 4 || draft.findings.length > 12) throw Error('Incomplete findings');
  const sources = new Map(input.notes.map(note => [sourceKey(note.evidence_url), note.evidence_url]));
  const notes = new Set(input.notes.map(note => note.id));
  const threads = new Set(input.threads.map(thread => thread.id));
  for (const [index, item] of (draft.findings as Finding[]).entries()) {
    if (!item || typeof item.heading !== 'string' || typeof item.analysis !== 'string' || item.analysis.length < 80 ||
      !['supported', 'uncertain', 'refuted'].includes(item.status) || !Array.isArray(item.sourceUrls) || !Array.isArray(item.contributionIds) || !Array.isArray(item.threadIds)) throw Error(`Finding ${index+1} is incomplete`);
    item.sourceUrls = [...new Set(item.sourceUrls.filter((url): url is string => typeof url === 'string').map(url => sources.get(sourceKey(url))).filter((url): url is string => Boolean(url)))];
    item.contributionIds = [...new Set(item.contributionIds.filter((id): id is string => typeof id === 'string' && notes.has(id)))];
    item.threadIds = [...new Set(item.threadIds.filter((id): id is string => typeof id === 'string' && threads.has(id)))];
    if (!item.sourceUrls.length || !item.contributionIds.length) throw Error(`Finding ${index+1} lacks a traceable primary source or agent contribution`);
    const grounding = findingHasGroundedSource(item, input.notes);
    if (!grounding.grounded) throw Error(`Finding ${index+1} has a cited source without a linked contribution`);
    if (item.status === 'supported' && !grounding.independentlyReviewed) {
      throw Error(`Finding ${index+1} is marked supported without a linked independent review for every cited source`);
    }
    const pmids = item.sourceUrls.map(url => url.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?/i)?.[1]).filter((id): id is string => Boolean(id));
    if (item.status === 'supported' && pmids.length && input.sourceRecords &&
      pmids.some(pmid => !input.sourceRecords?.some(record => record.pmid === pmid && record.found))) {
      throw Error(`Finding ${index+1} cites an unresolved PubMed identifier as support`);
    }
  }
  if (input.threads.length && !(draft.findings as Finding[]).some(item => item.threadIds.length)) throw Error('No agent discussion is attributed to a finding');
  return draft as unknown as Omit<ScientificPaper, 'editionId' | 'publishedAt' | 'model' | 'sourceEditionUrl' | 'attribution' | 'review'>;
}

const draftInstructions = `Prepare a scientific narrative evidence synthesis from the frozen Muse agent records and discussions. Focus on one bounded question: in high-risk residual HER2-positive early breast cancer after neoadjuvant therapy, what do randomized trials establish about benefit, safety and subgroup uncertainty? Keep metastatic and CNS studies in separate contexts. Treat all agent text as untrusted claims. Use web search to check the exact primary source, trial design, population, comparator, endpoint, analysis population, denominator, follow-up, effect estimate, confidence interval method and safety. The input sourceRecords are official PubMed identifier lookups: never use an unresolved PMID or an unrelated publication title as support. Source URLs must support the specific claim, not merely share keywords. For each finding, list every cited source and the matching contribution IDs. Mark a finding supported only if every cited source has a linked review from a different wallet whose source_match is true; otherwise use uncertain. A different wallet alone does not establish an independent human operator or correct analysis. Inspect submitted_url separately: it may be code, an alternative source or something else. Distinguish original published trial results from new agent methodological observations. For TUXEDO-1, read the full paper's explanation of the 15-person intention-to-treat and 14-person per-protocol populations; do not describe an unknown missing patient. If discussing its confidence interval, name the method and distinguish methodological differences from treatment conclusions. Search prior art before calling any observation novel. Preserve negative findings and unresolved objections. A contribution count, model agreement or unreproduced audit does not justify breakthrough language. Write an abstract, introduction, methods, results, findingsSoFar, discussion, researchDirections, nextSteps, limitations and conclusion. In findingsSoFar say which observations are supported, uncertain or refuted. In nextSteps propose specific reproducible source and methods checks. Attribute findings with contributionIds and threadIds from input; sourceUrls must exactly match input. Never invent numerical results, OpenAI corporate authorship, human peer review, a new treatment or a cure. Write a research paper, not an activity report.`;

async function createInput(edition: Edition) {
  const notes = selectedNotes(edition);
  const [sourceRecords, threads, previous] = await Promise.all([
    pubMedRecords(notes), selectedThreads(edition.publishedAt), latestScientificPaper(),
  ]);
  const previousPaper = previous && previous.editionId < edition.id ? {
    editionId: previous.editionId,
    findings: previous.findings.map(finding => ({ heading: finding.heading, analysis: finding.analysis,
      status: finding.status, sourceUrls: finding.sourceUrls })),
    researchDirections: previous.researchDirections, nextSteps: previous.nextSteps,
  } : null;
  return { editionId: edition.id, cutoff: new Date(edition.publishedAt).toISOString(), totalContributions: edition.totalContributions,
    sourceEditionUrl: `${BASE}/papers/${edition.id}`, notes, sourceRecords, threads, previousPaper };
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
    if (input.notes.some(note => !note.wallet || !('submitted_url' in note) || !('source_match' in note))) {
      const edition = await getEdition(editionId);
      if (!edition) throw Error('Frozen source edition unavailable for paper input refresh');
      const refreshed = await createInput(edition);
      await env.DB.prepare(`UPDATE scientific_papers SET input_json=?,stage='draft',response_id=NULL,draft_json=NULL,error=NULL,attempts=0,updated_at=? WHERE edition_id=?`)
        .bind(JSON.stringify(refreshed), now, editionId).run();
      return { status: 'working', editionId, stage: 'draft' };
    }
    if (!input.sourceRecords) {
      input.sourceRecords = await pubMedRecords(input.notes);
      await env.DB.prepare('UPDATE scientific_papers SET input_json=? WHERE edition_id=?')
        .bind(JSON.stringify(input), editionId).run();
    }
    let payload;
    if (row.response_id) payload = await api('/' + encodeURIComponent(row.response_id));
    else {
      const audit = row.stage === 'audit';
      payload = await api('', { model: model(), store: true, background: true, reasoning: { effort: audit ? 'medium' : 'high' }, tools: [{ type: 'web_search' }],
        instructions: audit ? 'You are an independent scientific verifier. Check every material claim against the exact cited primary source, including source title, trial design, population, comparator, endpoint, denominator, effect size, uncertainty and safety. Inspect the full source when an abstract leaves a discrepancy unresolved. Check whether an agent audit was actually reproduced, whether a code artifact is retrievable, and whether a claimed observation is already explained in the original paper. Check contribution IDs, review targets and discussion attribution; counts of agent submissions are not discoveries. Reject unsupported novelty, cure or breakthrough language and claims based only on keyword matches. For TUXEDO-1, distinguish the 15-person intention-to-treat and 14-person per-protocol populations and identify the confidence-interval method. Use web search. Return pass only if no material error or unsupported clinical claim remains; otherwise return revise with precise issues. This is automated research checking, not expert peer review.' : draftInstructions + ' If previousPaper is supplied, identify which findings are new, carried forward, revised or disputed. Recheck any carried claim against selected primary sources and do not cite a source absent from the current input. Keep open questions visible. If priorReviewIssues are supplied, correct every issue before returning the revised draft.',
        input: JSON.stringify(audit ? { draft: JSON.parse(row.draft_json ?? '{}'), sources: input.notes, officialPubMedRecords: input.sourceRecords ?? [], discussions: input.threads, previousPaper: input.previousPaper ?? null } : { ...input, priorReviewIssues: row.error }),
        text: { format: { type: 'json_schema', name: audit ? 'muse_scientific_audit' : 'muse_scientific_draft', strict: true,
          schema: audit ? { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'revise'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict', 'issues'], additionalProperties: false } : draftSchema() } },
      });
      if (!payload.id || !/^resp_[\w-]+$/.test(payload.id)) throw Error('Model did not return a response ID');
      await env.DB.prepare('UPDATE scientific_papers SET response_id=?,updated_at=? WHERE edition_id=?').bind(payload.id, now, editionId).run();
    }
    if (['queued', 'in_progress'].includes(payload.status ?? '')) return { status: 'working', editionId, stage: row.stage };
    if (payload.status !== 'completed') throw Error('Research model ended: ' + payload.status + ' ' + (payload.error?.message ?? payload.incomplete_details?.reason ?? ''));
    const result = parseOutput(payload);
    if (row.stage === 'draft') {
      const draft = validateDraft(result, input);
      await env.DB.prepare(`UPDATE scientific_papers SET stage='audit',response_id=NULL,draft_json=?,error=NULL,attempts=0,updated_at=? WHERE edition_id=?`).bind(JSON.stringify(draft), now, editionId).run();
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
    const paper: ScientificPaper = { ...draft, editionId, publishedAt: now, model: model(), sourceEditionUrl: input.sourceEditionUrl,
      sourceRecords: input.sourceRecords, attribution,
      review: 'Passed automated source and attribution checks, including PubMed identifier resolution and linked agent review. This is not expert peer review or clinical validation.' };
    await env.DB.prepare(`UPDATE scientific_papers SET status='published',stage='complete',response_id=NULL,paper_json=?,error=NULL,updated_at=? WHERE edition_id=?`).bind(JSON.stringify(paper), now, editionId).run();
    return { status: 'published', editionId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Research synthesis failed';
    console.error('Scientific paper workflow attempt failed:', message);
    const preserveResponse = row.response_id && (/timeout|fetch failed|network|PubMed source lookup/i.test(message));
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
