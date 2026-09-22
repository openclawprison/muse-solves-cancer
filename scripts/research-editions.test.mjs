import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('publication preserves editions, skips retries, supports pause and carries forward evidence', async () => {
  const stored = new Map(); let enabled = 1;
  const rows = [{id:'submission-1',title:'HER2 resistance screening',abstract:'Agent note: abstract-only screening, further verification required.',evidence_url:'https://pubmed.ncbi.nlm.nih.gov/40664477/',work_type:'source-screening',paper_section:'adc-resistance',wallet:'wallet-1',handle:'agent',score:60,review_target_id:null,scored_at:0}];
  globalThis.__editionTestEnv = { DB: { prepare(sql) { let args=[];return { bind(...values){args=values;return this;},async first(){if(sql.includes('SELECT enabled'))return {enabled};if(sql.includes('SELECT id, published_at')){const id=[...stored.keys()].sort((a,b)=>b-a)[0];return id===undefined?null:{id,published_at:JSON.parse(stored.get(id)).publishedAt};}if(sql.includes('SELECT payload_json'))return stored.has(args[0])?{payload_json:stored.get(args[0])}:null;throw Error(sql);},async all(){return {results:rows};},async run(){if(sql.startsWith('INSERT OR IGNORE')){if(stored.has(args[0]))return {meta:{changes:0}};stored.set(args[0],args[3]);return {meta:{changes:1}};}throw Error(sql);} }; } } };
  const source=readFileSync(new URL('../lib/research-editions.ts',import.meta.url),'utf8').replace("import { env } from 'cloudflare:workers';",'const env = globalThis.__editionTestEnv;');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const originalNow=Date.now;let now=1800000000000;Date.now=()=>now;
  try {
    const first=await api.publishResearchEdition();assert.equal(first.status,'published');
    const paper=await api.getEdition(first.id);assert.equal(paper.totalContributions,1);assert.equal(paper.newContributions,1);assert.match(paper.markdown,/not independently audited/i);
    assert.equal((await api.publishResearchEdition()).status,'already_published');assert.equal(stored.size,1);
    const snapshot=stored.get(first.id);enabled=0;now+=api.EDITION_INTERVAL;
    assert.equal((await api.publishResearchEdition()).status,'paused');assert.equal(stored.size,1);
    const second=await api.publishResearchEdition(true);assert.equal(second.status,'published');
    assert.equal((await api.getEdition(second.id)).newContributions,0);assert.equal((await api.getEdition(second.id)).previousId,first.id);assert.equal(stored.get(first.id),snapshot);
    enabled=1;now+=api.EDITION_INTERVAL*3;await api.publishResearchEdition();assert.equal(stored.size,3,'missed windows are not fabricated');
  } finally {Date.now=originalNow;delete globalThis.__editionTestEnv;}
});
