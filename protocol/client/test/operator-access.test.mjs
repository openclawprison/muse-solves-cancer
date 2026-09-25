import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnerIdentity, isSameOriginOperatorAction, isKeeperCredential } from '../../../lib/operator-access.mjs';

test('operator requires an identified, explicitly allowed account', () => {
  assert.equal(isOwnerIdentity(null, 'owner@example.test'), false);
  assert.equal(isOwnerIdentity({ userId: 'other', email: 'other@example.test' }, 'owner@example.test'), false);
  assert.equal(isOwnerIdentity({ userId: '', email: 'owner@example.test' }, 'owner@example.test'), false);
  assert.equal(isOwnerIdentity({ userId: 'owner', email: 'owner@example.test' }, undefined), false);
  assert.equal(isOwnerIdentity({ userId: 'owner', email: 'Owner@example.test' }, 'owner@example.test'), true);
});

test('operator mutations reject cross-origin and ordinary form requests', () => {
  const url = 'https://musesolvescancer.com/api/operator/restart';
  const request = (headers) => new Request(url, { method: 'POST', headers });
  assert.equal(isSameOriginOperatorAction(request({})), false);
  assert.equal(isSameOriginOperatorAction(request({ origin: 'https://musesolvescancer.com' })), false);
  assert.equal(isSameOriginOperatorAction(request({ origin: 'https://other.example', 'x-muse-operator': '1' })), false);
  assert.equal(isSameOriginOperatorAction(request({ origin: 'https://musesolvescancer.com', 'x-muse-operator': '1', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isSameOriginOperatorAction(request({ origin: 'https://musesolvescancer.com', 'x-muse-operator': '1' })), true);
});

test('keeper credential is limited and cannot unlock owner controls', async () => {
  const key = 'test-only-keeper-credential-32-characters';
  const request = (path, method = 'POST', token = key) => new Request('https://musesolvescancer.com' + path, { method, headers: { authorization: 'Bearer ' + token } });
  assert.equal(await isKeeperCredential(request('/api/operator/epoch'), key), true);
  assert.equal(await isKeeperCredential(request('/api/operator/settlement'), key), true);
  assert.equal(await isKeeperCredential(request('/api/operator/policy-skip'), key), true);
  assert.equal(await isKeeperCredential(request('/api/keeper/status', 'GET'), key), true);
  assert.equal(await isKeeperCredential(request('/api/operator/restart'), key), false);
  assert.equal(await isKeeperCredential(request('/api/operator', 'GET'), key), false);
  assert.equal(await isKeeperCredential(request('/api/manuscript/synthesize'), key), false);
  assert.equal(await isKeeperCredential(request('/api/operator/epoch', 'POST', 'wrong-key'), key), false);
  assert.equal(await isKeeperCredential(request('/api/operator/epoch'), undefined), false);
});
