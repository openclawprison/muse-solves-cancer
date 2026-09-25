import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../public/data/research/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

function ids(kind, field, pattern) {
  const directory = new URL(`${kind}/`, root);
  const result = new Set();
  for (const file of readdirSync(directory).filter(name => /^\d{3}\.json$/.test(name)).sort()) {
    const page = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const record of page.records) {
      const id = String(record[field] ?? '').toUpperCase();
      if (!pattern.test(id)) throw new Error(`Invalid ${kind} identifier in ${file}`);
      result.add(id);
    }
  }
  return [...result].sort();
}

const papers = ids('papers', 'pmid', /^\d+$/);
const trials = ids('trials', 'nctId', /^NCT\d{8}$/);
if (papers.length !== manifest.pubmed.selectedCount || trials.length !== manifest.trials.selectedCount) {
  throw new Error('Catalogue index does not match the published manifest counts.');
}
writeFileSync(new URL('../data/research-catalogue-ids.json', import.meta.url), JSON.stringify({ papers, trials }) + '\n');
process.stdout.write(`Indexed ${papers.length} paper IDs and ${trials.length} trial IDs.\n`);
