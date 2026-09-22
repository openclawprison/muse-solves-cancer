import assert from 'node:assert/strict';
import bs58 from 'bs58';
import { randomBytes, randomUUID } from 'node:crypto';

// Deliberately restricted to a local Worker with fake identity headers.
const origin = process.argv[2] ?? 'http://127.0.0.1:5174';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local checks only.');
const owner = { 'oai-authenticated-user-id': 'local-owner', 'oai-authenticated-user-email': 'owner@example.test' };
async function read(path, headers = {}) {
  const response = await fetch(origin + path, { headers: { connection: 'close', ...headers }, redirect: 'manual' });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}
async function post(path, body, headers = {}) {
  const response = await fetch(origin + path, { method: 'POST', headers: { connection: 'close', 'content-type': 'application/json', ...headers }, body: Object.keys(body).length ? JSON.stringify(body) : undefined });
  const text = await response.text();
  try { return { response, body: JSON.parse(text) }; }
  catch { throw new Error(path + ': ' + response.status + ' ' + text); }
}

assert.equal((await read('/api/operator')).response.status, 401);
assert.equal((await read('/api/operator', { ...owner, 'oai-authenticated-user-email': 'other@example.test' })).response.status, 401);
const allowed = await read('/api/operator', owner);
assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
assert.match(allowed.response.headers.get('cache-control'), /no-store/);
const locked = await read('/operator');
assert.ok(locked.response.status >= 300 && locked.response.status < 400, 'Anonymous console must redirect to sign-in');
assert.match(locked.response.headers.get('location'), /signin-with-chatgpt/);
const denied = await read('/operator', { ...owner, 'oai-authenticated-user-email': 'other@example.test' });
assert.ok(!String(denied.body).includes('Process closed round'), 'Other accounts must not receive console controls');
for (const path of ['/api/operator/restart', '/api/operator/epoch', '/api/operator/run', '/api/operator/fees', '/api/operator/settlement', '/api/epochs/settle', '/api/manuscript/synthesize']) {
  assert.equal((await post(path, {})).response.status, 401, path);
}
assert.equal((await post('/api/operator/restart', {}, owner)).response.status, 401);
assert.equal((await post('/api/operator/restart', {}, { ...owner, origin: 'https://other.example', 'x-muse-operator': '1' })).response.status, 401);
const restarted = await post('/api/operator/restart', {}, { ...owner, origin, 'x-muse-operator': '1' });
assert.equal(restarted.response.status, 200, JSON.stringify(restarted.body));
assert.equal(restarted.body.round.researchEndsAt - restarted.body.round.startedAt, 25 * 60 * 1000);
assert.equal(restarted.body.round.distributionEndsAt - restarted.body.round.researchEndsAt, 5 * 60 * 1000);
const key = 'test-only-keeper-credential-32-characters';
assert.equal((await read('/api/operator', { authorization: 'Bearer ' + key })).response.status, 401);
assert.equal((await read('/api/keeper/status', { authorization: 'Bearer ' + key })).response.status, 200);
assert.equal((await post('/api/operator/restart', {}, { authorization: 'Bearer ' + key })).response.status, 401);
console.log('PASS: owner-only console, all protected APIs, same-origin checks, keeper scope, fresh 25+5 timer');

async function register() {
  const wallet = bs58.encode(randomBytes(32));
  const profile = { wallet, handle: 'local-test-' + randomUUID().slice(0, 8), specialty: 'Local integration checks' };
  const created = await post('/api/agents', profile);
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.ok(created.body.apiKey);
  assert.equal((await post('/api/agents', profile)).response.status, 400);
  return { wallet, headers: { authorization: 'Bearer ' + created.body.apiKey } };
}
const a = await register(), b = await register();
const rootPayload = { wallet: a.wallet, requestId: randomUUID(), title: 'Local test paper discussion', sourceUrl: 'https://example.org/test-paper', body: 'Local test fixture: compare methods and uncertainty.' };
const root = await post('/api/discussions', rootPayload, a.headers);
assert.equal(root.response.status, 201, JSON.stringify(root.body));
assert.equal((await post('/api/discussions', rootPayload, a.headers)).body.id, root.body.id);
assert.equal((await post('/api/discussions', { ...rootPayload, requestId: randomUUID() }, b.headers)).response.status, 400);
const reply = await post('/api/discussions', { wallet: b.wallet, parentId: root.body.id, body: 'Local test reply: independently check the denominator.' }, b.headers);
assert.equal(reply.response.status, 201, JSON.stringify(reply.body));
assert.equal(reply.body.threadId, root.body.id);
const thread = await read('/api/discussions?threadId=' + root.body.id);
assert.equal(thread.body.posts.length, 2);
assert.equal(thread.body.posts[1].parentId, root.body.id);
assert.equal(thread.body.posts[1].sourceUrl, rootPayload.sourceUrl);
const publicAgents = await read('/api/agents');
assert.ok(!JSON.stringify(publicAgents.body).includes('apiKey'));
assert.ok(!JSON.stringify(publicAgents.body).includes('api_key_hash'));
const research = { wallet: a.wallet, title: 'Local integration research fixture', evidenceUrl: 'https://example.org/test-paper', abstract: 'This is a local integration fixture used to check API authentication and storage.', workType: 'evidence-extraction', timestamp: Date.now() };
assert.equal((await post('/api/submissions', research, b.headers)).response.status, 400);
assert.equal((await post('/api/submissions', research, a.headers)).response.status, 200);
console.log('PASS: registration without wallet proof, token isolation, paper threads, replies, idempotency, public privacy, research without missions');
