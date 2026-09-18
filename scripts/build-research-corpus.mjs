import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PUBMED_LIMIT = 9_999;
const CHUNK_SIZE = 250;
const PUBMED_QUERY = '(("Breast Neoplasms"[MeSH Terms] OR "breast cancer"[Title/Abstract]) AND (HER2[Title/Abstract] OR ERBB2[Title/Abstract] OR "human epidermal growth factor receptor 2"[Title/Abstract])) OR (("Breast Neoplasms"[MeSH Terms] OR "breast cancer"[Title/Abstract]) AND (trastuzumab[Title/Abstract] OR pertuzumab[Title/Abstract] OR tucatinib[Title/Abstract] OR "antibody-drug conjugate"[Title/Abstract]) AND (resistance[Title/Abstract] OR residual[Title/Abstract] OR biomarker*[Title/Abstract] OR metast*[Title/Abstract] OR toxicity[Title/Abstract]))';
const TRIAL_BRANCHES = [
  { id: 'direct-her2-positive', label: 'Direct HER2-positive breast cancer', condition: 'HER2-Positive Breast Cancer', term: '', tier: 1, weight: 100 },
  { id: 'core-breast-her2', label: 'Breast cancer and HER2', condition: 'Breast Cancer', term: 'HER2', tier: 2, weight: 70 },
  { id: 'adc-tdxd', label: 'Trastuzumab deruxtecan', condition: 'Breast Cancer', term: '"trastuzumab deruxtecan"', tier: 2, weight: 70 },
  { id: 'adc-tdm1', label: 'T-DM1 / ado-trastuzumab emtansine', condition: 'Breast Cancer', term: '"ado-trastuzumab emtansine" OR "T-DM1"', tier: 2, weight: 70 },
  { id: 'brain-metastases', label: 'HER2 brain metastases', condition: 'Breast Cancer', term: 'HER2 AND "brain metastases"', tier: 3, weight: 40 },
  { id: 'resistance-biomarkers', label: 'Resistance and biomarkers', condition: 'Breast Cancer', term: 'HER2 AND (resistance OR biomarker)', tier: 3, weight: 40 },
];

const outputRoot = resolve(process.cwd(), 'public', 'data', 'research');
const requestDelay = process.env.NCBI_API_KEY ? 120 : 370;

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function groupsOf(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, '').trim() : '';
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function records(value) {
  return Array.isArray(value) ? value.map(record) : [];
}

function textList(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function publicationDate(item) {
  const sortable = item.sortpubdate?.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (sortable) return `${sortable[1]}-${sortable[2]}-${sortable[3]}`;
  return item.pubdate ?? null;
}

function evidenceLevel(types) {
  const joined = types.join(' ').toLowerCase();
  if (joined.includes('meta-analysis') || joined.includes('systematic review')) return 'Evidence synthesis';
  if (joined.includes('randomized controlled trial')) return 'Randomized trial';
  if (joined.includes('clinical trial')) return 'Clinical study';
  if (joined.includes('review')) return 'Review';
  return 'Agent screening required';
}

async function fetchJson(url, options = {}, attempt = 1) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
      await sleep(attempt * 1_000);
      return fetchJson(url, options, attempt + 1);
    }
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchNcbi(endpoint, params) {
  const body = new URLSearchParams({ db: 'pubmed', retmode: 'json', tool: 'rcc-research-corpus', ...params });
  if (process.env.NCBI_EMAIL) body.set('email', process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) body.set('api_key', process.env.NCBI_API_KEY);
  const data = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'rcc-research-corpus/1.0' },
    body,
  });
  await sleep(requestDelay);
  return data;
}

async function buildPubMed() {
  const search = await fetchNcbi('esearch.fcgi', { term: PUBMED_QUERY, retmax: String(PUBMED_LIMIT), sort: 'relevance' });
  const ids = search.esearchresult.idlist;
  const queryHitCount = Number(search.esearchresult.count);
  const summaries = new Map();
  for (const [index, group] of groupsOf(ids, 200).entries()) {
    const response = await fetchNcbi('esummary.fcgi', { id: group.join(',') });
    for (const pmid of group) {
      const item = response.result[pmid];
      if (item && !Array.isArray(item)) summaries.set(pmid, item);
    }
    process.stdout.write(`PubMed ${Math.min((index + 1) * 200, ids.length).toLocaleString()} / ${ids.length.toLocaleString()}\r`);
  }
  process.stdout.write('\n');
  const papers = ids.flatMap((pmid, index) => {
    const item = summaries.get(pmid);
    if (!item?.title) return [];
    const articleIds = item.articleids ?? [];
    const doi = articleIds.find((entry) => entry.idtype === 'doi')?.value ?? null;
    const pmcid = articleIds.find((entry) => entry.idtype === 'pmc')?.value ?? null;
    const publicationTypes = item.pubtype ?? [];
    return [{
      id: `pmid-${pmid}`,
      pmid,
      pmcid,
      doi,
      title: clean(item.title),
      journal: item.fulljournalname ?? null,
      authors: (item.authors ?? []).map((author) => clean(author.name)).filter(Boolean),
      publicationDate: publicationDate(item),
      publicationType: publicationTypes.join('; ') || null,
      evidenceLevel: evidenceLevel(publicationTypes),
      screeningStatus: 'not_screened',
      peerGrade: 'pending',
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      fullTextUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null,
      priorityRank: index + 1,
    }];
  });
  return { papers, queryHitCount };
}

function trialFrom(study, branches) {
  const protocol = study.protocolSection ?? {};
  const identification = record(protocol.identificationModule);
  const status = record(protocol.statusModule);
  const design = record(protocol.designModule);
  const conditions = record(protocol.conditionsModule);
  const arms = record(protocol.armsInterventionsModule);
  const description = record(protocol.descriptionModule);
  const enrollment = record(design.enrollmentInfo);
  const id = clean(identification.nctId);
  if (!id) return null;
  const tier = Math.min(...branches.map((branch) => branch.tier));
  const scope = branches.find((branch) => branch.tier === tier) ?? branches[0];
  return {
    id: `trial-${id}`,
    nctId: id,
    title: clean(identification.briefTitle) || clean(identification.officialTitle) || 'Untitled registered study',
    officialTitle: clean(identification.officialTitle) || null,
    phases: textList(design.phases),
    overallStatus: clean(status.overallStatus) || null,
    studyType: clean(design.studyType) || null,
    enrollment: typeof enrollment.count === 'number' ? enrollment.count : null,
    conditions: textList(conditions.conditions),
    interventions: records(arms.interventions).map((item) => clean(item.name)).filter(Boolean),
    briefSummary: clean(description.briefSummary) || null,
    resultsAvailable: Boolean(study.hasResults),
    scopeTier: tier,
    scopeLabel: scope.label,
    scopeWeight: scope.weight,
    matchedBranches: branches.map((branch) => branch.id),
    screeningStatus: 'not_screened',
    peerGrade: 'pending',
    sourceUrl: `https://clinicaltrials.gov/study/${id}`,
  };
}

async function fetchTrialBranch(branch) {
  const studies = [];
  let nextPageToken;
  let totalCount = 0;
  do {
    const url = new URL('https://clinicaltrials.gov/api/v2/studies');
    url.search = new URLSearchParams({
      'query.cond': branch.condition,
      ...(branch.term ? { 'query.term': branch.term } : {}),
      pageSize: '1000',
      countTotal: 'true',
      format: 'json',
      ...(nextPageToken ? { pageToken: nextPageToken } : {}),
    }).toString();
    const data = await fetchJson(url, { headers: { accept: 'application/json', 'user-agent': 'rcc-research-corpus/1.0' } });
    studies.push(...data.studies);
    totalCount = data.totalCount ?? totalCount;
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return { studies, totalCount: totalCount || studies.length };
}

async function buildTrials() {
  const studiesById = new Map();
  const branchesById = new Map();
  const branchCounts = {};
  for (const branch of TRIAL_BRANCHES) {
    const result = await fetchTrialBranch(branch);
    branchCounts[branch.id] = result.totalCount;
    for (const study of result.studies) {
      const id = clean(study.protocolSection?.identificationModule?.nctId);
      if (!id) continue;
      studiesById.set(id, study);
      branchesById.set(id, [...(branchesById.get(id) ?? []), branch]);
    }
    console.log(`${branch.label}: ${result.totalCount.toLocaleString()} trials`);
  }
  const trials = [...studiesById.entries()]
    .map(([id, study]) => trialFrom(study, branchesById.get(id) ?? []))
    .filter(Boolean)
    .sort((a, b) => a.scopeTier - b.scopeTier || Number(b.resultsAvailable) - Number(a.resultsAvailable) || a.nctId.localeCompare(b.nctId))
    .map((trial, index) => ({ ...trial, priorityRank: index + 1 }));
  return { trials, branchCounts };
}

async function writeChunks(kind, items) {
  const directory = resolve(outputRoot, kind);
  await mkdir(directory, { recursive: true });
  const chunks = groupsOf(items, CHUNK_SIZE);
  for (const [index, chunk] of chunks.entries()) {
    await writeFile(resolve(directory, `${String(index + 1).padStart(3, '0')}.json`), `${JSON.stringify({ kind, page: index + 1, pageSize: CHUNK_SIZE, total: items.length, records: chunk })}\n`);
  }
  return chunks.length;
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const [{ papers, queryHitCount }, { trials, branchCounts }] = await Promise.all([buildPubMed(), buildTrials()]);
  const [paperPages, trialPages] = await Promise.all([writeChunks('papers', papers), writeChunks('trials', trials)]);
  const generatedAt = new Date().toISOString();
  const directTrials = trials.filter((trial) => trial.scopeTier === 1).length;
  const manifest = {
    protocolVersion: '1.0',
    mission: 'HER2-positive breast cancer residual disease, resistance, toxicity and access',
    generatedAt,
    pubmed: { query: PUBMED_QUERY, queryHitCount, selectedCount: papers.length, pages: paperPages, pageSize: CHUNK_SIZE },
    trials: { branches: TRIAL_BRANCHES, branchCounts, selectedCount: trials.length, directCount: directTrials, pages: trialPages, pageSize: CHUNK_SIZE },
    totalSources: papers.length + trials.length,
    plannedWorkflowUnits: (papers.length + trials.length) * 5,
    workflow: ['metadata validation', 'eligibility screening', 'structured extraction', 'independent peer review', 'claim synthesis'],
    note: 'Catalogue metadata is not accepted evidence. Every record requires agent screening, extraction and independent review before it can support a scientific conclusion.',
    attribution: 'Publication metadata from NCBI PubMed; trial registry metadata from ClinicalTrials.gov. NCBI and ClinicalTrials.gov do not endorse MUSE.',
  };
  await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  const sourceDataDirectory = resolve(process.cwd(), 'data');
  await mkdir(sourceDataDirectory, { recursive: true });
  await writeFile(resolve(sourceDataDirectory, 'research-manifest.json'), `${JSON.stringify(manifest)}\n`);
  await writeFile(resolve(outputRoot, 'featured.json'), `${JSON.stringify({ papers: papers.slice(0, 18), trials: trials.slice(0, 18) })}\n`);
  console.log(`Wrote ${papers.length.toLocaleString()} papers and ${trials.length.toLocaleString()} trials (${manifest.totalSources.toLocaleString()} sources).`);
}

await main();
