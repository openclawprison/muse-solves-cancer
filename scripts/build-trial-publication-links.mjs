import { readFile, writeFile } from 'node:fs/promises';

const catalogue = JSON.parse(await readFile(new URL('../data/research-catalogue-ids.json', import.meta.url), 'utf8'));
const paperIds = new Set(catalogue.papers);
const trialIds = catalogue.trials;
const byPmid = new Map();
const linkedTrials = new Set();
const batchSize = 100;

async function fetchBatch(ids) {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  url.searchParams.set('query.id', ids.join(','));
  url.searchParams.set('pageSize', String(batchSize));
  url.searchParams.set('fields', 'NCTId,ReferencePMID,ReferenceType');
  url.searchParams.set('format', 'json');
  const studies = [];
  for (let page = 0; page < 10; page++) {
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
        result = await response.json();
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    studies.push(...(result.studies ?? []));
    if (!result.nextPageToken) return studies;
    url.searchParams.set('pageToken', result.nextPageToken);
  }
  throw new Error('Registry query exceeded the bounded pagination limit.');
}

for (let offset = 0; offset < trialIds.length; offset += batchSize) {
  const batch = trialIds.slice(offset, offset + batchSize);
  const studies = await fetchBatch(batch);
  for (const study of studies) {
    const nct = study.protocolSection?.identificationModule?.nctId;
    if (!batch.includes(nct)) continue;
    for (const reference of study.protocolSection?.referencesModule?.references ?? []) {
      // Background reading is not evidence that the paper reports this study.
      if (!['RESULT', 'DERIVED'].includes(reference.type) || !paperIds.has(reference.pmid)) continue;
      const links = byPmid.get(reference.pmid) ?? new Set();
      links.add(nct);
      byPmid.set(reference.pmid, links);
      linkedTrials.add(nct);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 400));
}

const output = {
  generatedAt: new Date().toISOString(),
  source: 'ClinicalTrials.gov API v2 study references (RESULT or DERIVED only), matched to the local indexed PubMed and trial catalogue',
  byPmid: Object.fromEntries([...byPmid].sort(([a], [b]) => Number(a) - Number(b)).map(([pmid, ids]) => [pmid, [...ids].sort()])),
};
await writeFile(new URL('../data/trial-publication-links.json', import.meta.url), JSON.stringify(output) + '\n');
process.stdout.write(`Linked ${byPmid.size} indexed papers to ${linkedTrials.size} indexed trials.\n`);
