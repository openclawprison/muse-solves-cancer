import { createHash } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DOMAIN = Buffer.from('MUSE_PAYOUT_V1', 'utf8');

export function decodeBase58(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('wallet must be a base58 string');
  let number = 0n;
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`invalid base58 character: ${character}`);
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') leadingZeroes += 1;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

function u64le(value) {
  const amount = BigInt(value);
  if (amount < 0n || amount > 0xffff_ffff_ffff_ffffn) throw new Error('u64 out of range');
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(amount);
  return buffer;
}

function u32le(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error('u32 out of range');
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function sha256(...chunks) {
  const hash = createHash('sha256');
  for (const chunk of chunks) hash.update(chunk);
  return hash.digest();
}

export function payoutLeaf({ epochId, index, wallet, amountRewardUnits }) {
  const publicKey = decodeBase58(wallet);
  if (publicKey.length !== 32) throw new Error(`wallet must decode to 32 bytes: ${wallet}`);
  return sha256(DOMAIN, u64le(epochId), u32le(index), publicKey, u64le(amountRewardUnits));
}

export function hashPair(left, right) {
  return Buffer.compare(left, right) <= 0 ? sha256(left, right) : sha256(right, left);
}

export function buildMerkleTree(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) throw new Error('at least one leaf is required');
  const levels = [leaves.map((leaf) => Buffer.from(leaf))];
  while (levels.at(-1).length > 1) {
    const level = levels.at(-1);
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(index + 1 < level.length ? hashPair(level[index], level[index + 1]) : level[index]);
    }
    levels.push(next);
  }
  return { root: levels.at(-1)[0], levels };
}

export function proofFor(levels, leafIndex) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= levels[0].length) throw new Error('invalid leaf index');
  const proof = [];
  let index = leafIndex;
  for (let depth = 0; depth < levels.length - 1; depth += 1) {
    const sibling = index ^ 1;
    if (sibling < levels[depth].length) proof.push(levels[depth][sibling]);
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyProof(leaf, proof, root) {
  return proof.reduce((node, sibling) => hashPair(node, sibling), Buffer.from(leaf)).equals(root);
}

export function canonicalManifest(epochId, payouts, provenance = {}) {
  const normalized = payouts.map((payout, index) => ({
    index,
    wallet: String(payout.wallet),
    amountRewardUnits: BigInt(payout.amountRewardUnits).toString(),
    score: Number(payout.score ?? 0),
    artifactIds: Array.isArray(payout.artifactIds) ? [...payout.artifactIds].map(String).sort() : [],
  }));
  const wallets = new Set();
  for (const payout of normalized) {
    if (wallets.has(payout.wallet)) throw new Error(`duplicate wallet: ${payout.wallet}`);
    wallets.add(payout.wallet);
    if (BigInt(payout.amountRewardUnits) <= 0n) throw new Error('all payouts must be positive');
    if (decodeBase58(payout.wallet).length !== 32) throw new Error(`invalid wallet: ${payout.wallet}`);
  }
  const normalizedProvenance = {
    scienceProtocol: String(provenance.scienceProtocol ?? 'MUSE_MACHINE_SCIENCE_V1'),
    rewardRuleVersion: String(provenance.rewardRuleVersion ?? 'muse-rewards-v1'),
    rewardCalculationHash: String(provenance.rewardCalculationHash ?? ''),
    consensusSetHash: String(provenance.consensusSetHash ?? ''),
    validatorSetHash: String(provenance.validatorSetHash ?? ''),
  };
  return { protocol: 'MUSE_PAYOUT_V1', epochId: BigInt(epochId).toString(), provenance: normalizedProvenance, payouts: normalized };
}

export function buildManifest(epochId, payouts, provenance = {}) {
  const manifest = canonicalManifest(epochId, payouts, provenance);
  const leaves = manifest.payouts.map((payout) => payoutLeaf({ epochId: manifest.epochId, ...payout }));
  const tree = buildMerkleTree(leaves);
  const encoded = Buffer.from(JSON.stringify(manifest));
  return {
    ...manifest,
    totalRewardUnits: manifest.payouts.reduce((total, payout) => total + BigInt(payout.amountRewardUnits), 0n).toString(),
    merkleRoot: tree.root.toString('hex'),
    manifestHash: sha256(encoded).toString('hex'),
    payouts: manifest.payouts.map((payout, index) => ({
      ...payout,
      leaf: leaves[index].toString('hex'),
      proof: proofFor(tree.levels, index).map((node) => node.toString('hex')),
    })),
  };
}
