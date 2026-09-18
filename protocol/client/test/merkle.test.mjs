import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateEntireBalance } from '../allocation.mjs';
import { buildManifest, buildMerkleTree, payoutLeaf, proofFor, verifyProof } from '../merkle.mjs';

const payouts = [
  { wallet: '11111111111111111111111111111111', amountRewardUnits: '12000000', score: 87, artifactIds: ['artifact-a'] },
  { wallet: 'So11111111111111111111111111111111111111112', amountRewardUnits: '8000000', score: 75, artifactIds: ['artifact-b'] },
];

test('builds deterministic payout manifests and valid proofs', () => {
  const first = buildManifest('100', payouts);
  const second = buildManifest('100', payouts);
  assert.deepEqual(first, second);
  assert.equal(first.totalRewardUnits, '20000000');
  for (const payout of first.payouts) {
    const leaf = Buffer.from(payout.leaf, 'hex');
    const proof = payout.proof.map((node) => Buffer.from(node, 'hex'));
    assert.equal(verifyProof(leaf, proof, Buffer.from(first.merkleRoot, 'hex')), true);
  }
});

test('binds a payout to its epoch, index, wallet and amount', () => {
  const leaves = payouts.map((payout, index) => payoutLeaf({ epochId: 100, index, ...payout }));
  const tree = buildMerkleTree(leaves);
  const validProof = proofFor(tree.levels, 0);
  assert.equal(verifyProof(leaves[0], validProof, tree.root), true);
  const tampered = payoutLeaf({ epochId: 100, index: 0, wallet: payouts[0].wallet, amountRewardUnits: '12000001' });
  assert.equal(verifyProof(tampered, validProof, tree.root), false);
});

test('rejects duplicate recipient wallets', () => {
  assert.throws(() => buildManifest('100', [payouts[0], payouts[0]]), /duplicate wallet/);
});

test('allocates the entire vault balance with deterministic remainder handling', () => {
  const allocation = allocateEntireBalance('100', [
    { wallet: payouts[1].wallet, score: 1, artifactIds: ['b'] },
    { wallet: payouts[0].wallet, score: 2, artifactIds: ['a'] },
  ]);
  assert.equal(allocation.reduce((sum, payout) => sum + BigInt(payout.amountRewardUnits), 0n), 100n);
  assert.deepEqual(allocation.map((payout) => payout.amountRewardUnits), ['67', '33']);
});

test('rejects empty, zero-score and duplicate allocation inputs', () => {
  assert.throws(() => allocateEntireBalance('0', []), /balance must be positive/);
  assert.throws(() => allocateEntireBalance('1', [{ wallet: payouts[0].wallet, score: 0 }]), /positive-score/);
  assert.throws(() => allocateEntireBalance('2', [
    { wallet: payouts[0].wallet, score: 1 },
    { wallet: payouts[0].wallet, score: 1 },
  ]), /unique/);
});
