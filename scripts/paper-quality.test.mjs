import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/paper-quality.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { selectPaperNotes, findingHasGroundedSource } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const note = (id, overrides = {}) => ({ id, title: id, abstract: 'Checked study outcome and its limitations.',
  evidence_url: 'https://pubmed.ncbi.nlm.nih.gov/35941372/', work_type: 'evidence-extraction',
  paper_section: 'clinical-evidence', wallet: id + '-wallet', handle: id, score: 70,
  review_target_id: null, scored_at: 10, ...overrides });

test('research selection includes linked methodological audits and their primary source', () => {
  const contributions = [
    ...Array.from({ length: 35 }, (_, i) => note('screen-' + i, {
      evidence_url: `https://pubmed.ncbi.nlm.nih.gov/${80000000 + i}/`, work_type: 'source-screening', score: 95,
    })),
    note('trial-extraction'),
    note('statistical-audit', { evidence_url: 'https://github.com/example/reproduction',
      work_type: 'quality-audit', review_target_id: 'trial-extraction', scored_at: 20 }),
  ];
  const selected = selectPaperNotes(contributions, 20);
  const extraction = selected.find(item => item.id === 'trial-extraction');
  const audit = selected.find(item => item.id === 'statistical-audit');
  assert.ok(extraction);
  assert.ok(audit);
  assert.equal(audit.evidence_url, extraction.evidence_url);
  assert.equal(audit.submitted_url, 'https://github.com/example/reproduction');
  assert.ok(selected.some(item => item.work_type === 'source-screening'));
});

test('a finding requires a matching source and an independent linked review for supported status', () => {
  const selected = selectPaperNotes([
    note('trial-extraction'),
    note('other-trial', { evidence_url: 'https://pubmed.ncbi.nlm.nih.gov/30516102/' }),
    note('review', { work_type: 'quality-audit', review_target_id: 'trial-extraction', wallet: 'independent-wallet' }),
  ]);
  const correct = { sourceUrls: ['https://pubmed.ncbi.nlm.nih.gov/35941372/'],
    contributionIds: ['trial-extraction', 'review'], status: 'supported' };
  assert.deepEqual(findingHasGroundedSource(correct, selected), { grounded: true, independentlyReviewed: true });
  assert.deepEqual(findingHasGroundedSource({ ...correct, sourceUrls: ['https://pubmed.ncbi.nlm.nih.gov/99999999/'] }, selected),
    { grounded: false, independentlyReviewed: false });
  assert.deepEqual(findingHasGroundedSource({ ...correct, contributionIds: ['trial-extraction'] }, selected),
    { grounded: true, independentlyReviewed: false });
  assert.deepEqual(findingHasGroundedSource({ ...correct,
    sourceUrls: [...correct.sourceUrls, 'https://pubmed.ncbi.nlm.nih.gov/30516102/'] }, selected),
    { grounded: false, independentlyReviewed: false });
});

test('source homepages and malformed identifiers are excluded from paper evidence', () => {
  const selected = selectPaperNotes([
    note('bad-pubmed', { evidence_url: 'https://pubmed.ncbi.nlm.nih.gov/' }),
    note('bad-doi', { evidence_url: 'https://doi.org/10.fake' }),
    note('bad-trial', { evidence_url: 'https://clinicaltrials.gov/search' }),
    note('good-pubmed'),
  ]);
  assert.deepEqual(selected.map(item => item.id), ['good-pubmed']);
});

test('a same-wallet review does not establish independent verification', () => {
  const selected = selectPaperNotes([
    note('original', { wallet: 'same-wallet' }),
    note('self-review', { work_type: 'peer-review', review_target_id: 'original', wallet: 'same-wallet' }),
  ]);
  assert.equal(findingHasGroundedSource({ sourceUrls: ['https://pubmed.ncbi.nlm.nih.gov/35941372/'],
    contributionIds: ['original', 'self-review'], status: 'supported' }, selected).independentlyReviewed, false);
});

test('a review linked to the target but citing another source cannot support that source', () => {
  const selected = selectPaperNotes([
    note('original'),
    note('other-source-review', { work_type: 'peer-review', review_target_id: 'original',
      evidence_url: 'https://pubmed.ncbi.nlm.nih.gov/30516102/' }),
  ]);
  assert.equal(findingHasGroundedSource({ sourceUrls: ['https://pubmed.ncbi.nlm.nih.gov/35941372/'],
    contributionIds: ['original', 'other-source-review'], status: 'supported' }, selected).independentlyReviewed, false);
});
