import { env } from 'cloudflare:workers';

export const CONSENSUS_VERSION = 'muse-consensus-v1';
export const REWARD_RULE_VERSION = 'muse-rewards-v1';
export const EPOCH_MS = 20 * 60 * 1000;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Only finite numbers can be hashed.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Value cannot be represented as canonical JSON.');
}

export async function sha256(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function contentAddress(namespace: string, value: unknown) {
  return sha256(`${namespace}\n${canonicalJson(value as JsonValue)}`);
}

export function epochIdFor(timestamp: number) {
  return Math.floor(timestamp / EPOCH_MS);
}

export function verificationPoints(method: string) {
  const points: Record<string, number> = {
    'source-check': 10,
    'clinical-context': 12,
    'methods-audit': 16,
    'statistical-reproduction': 24,
  };
  return points[method] ?? 8;
}

export async function insertRewardEvent(input: {
  wallet: string;
  epochId: number;
  eventType: string;
  objectId: string;
  points: number;
  createdAt: number;
}) {
  const calculationHash = await contentAddress('MUSE_REWARD_EVENT_V1', {
    ...input,
    ruleVersion: REWARD_RULE_VERSION,
  });
  const id = calculationHash;
  await env.DB.prepare(
    `INSERT INTO reward_events
      (id, wallet, epoch_id, event_type, object_id, points, rule_version, calculation_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wallet, event_type, object_id, rule_version) DO NOTHING`,
  ).bind(id, input.wallet, input.epochId, input.eventType, input.objectId, input.points, REWARD_RULE_VERSION, calculationHash, input.createdAt).run();
  return { id, calculationHash };
}

type VerificationRow = {
  id: string;
  verifier_wallet: string;
  result: 'supports' | 'refutes' | 'inconclusive';
  confidence_bps: number;
  output_hash: string;
};

export async function recomputeConsensus(claimId: string, createdAt = Date.now(), rewardEpochId = epochIdFor(createdAt)) {
  const rows = await env.DB.prepare(
    `SELECT id, verifier_wallet, result, confidence_bps, output_hash
     FROM verification_runs WHERE claim_id = ? ORDER BY verifier_wallet, id`,
  ).bind(claimId).all<VerificationRow>();
  const verifications = rows.results ?? [];
  const support = verifications.filter((row) => row.result === 'supports');
  const refute = verifications.filter((row) => row.result === 'refutes');
  const inconclusive = verifications.filter((row) => row.result === 'inconclusive');
  const decisive = support.length + refute.length;
  let verdict = 'insufficient';
  if (decisive >= 2 && support.length * 3 >= decisive * 2) verdict = 'supported';
  else if (decisive >= 2 && refute.length * 3 >= decisive * 2) verdict = 'refuted';
  else if (verifications.length >= 2) verdict = 'contested';
  const winning = Math.max(support.length, refute.length);
  const confidenceBps = decisive ? Math.floor((winning * 10_000) / decisive) : 0;
  const calculation = {
    algorithmVersion: CONSENSUS_VERSION,
    claimId,
    verdict,
    confidenceBps,
    votes: verifications.map((row) => ({
      id: row.id,
      wallet: row.verifier_wallet,
      result: row.result,
      confidenceBps: row.confidence_bps,
      outputHash: row.output_hash,
    })),
  };
  const calculationHash = await contentAddress('MUSE_CONSENSUS_V1', calculation);
  const id = await contentAddress('MUSE_CONSENSUS_SNAPSHOT_V1', { claimId, calculationHash });
  await env.DB.prepare(
    `INSERT INTO consensus_snapshots
      (id, claim_id, algorithm_version, verdict, confidence_bps, support_count, refute_count,
       inconclusive_count, calculation_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(claim_id, calculation_hash) DO NOTHING`,
  ).bind(
    id,
    claimId,
    CONSENSUS_VERSION,
    verdict,
    confidenceBps,
    support.length,
    refute.length,
    inconclusive.length,
    calculationHash,
    createdAt,
  ).run();

  if (verdict === 'supported' || verdict === 'refuted') {
    const claim = await env.DB.prepare(
      'SELECT extractor_wallet FROM claims WHERE id = ?',
    ).bind(claimId).first<{ extractor_wallet: string }>();
    if (claim) {
      await insertRewardEvent({
        wallet: claim.extractor_wallet,
        epochId: rewardEpochId,
        eventType: verdict === 'supported' ? 'consensus-supported-claim' : 'consensus-refuted-claim',
        objectId: claimId,
        points: verdict === 'supported' ? 20 : 6,
        createdAt,
      });
    }
  }

  return { id, ...calculation, calculationHash, supportCount: support.length, refuteCount: refute.length, inconclusiveCount: inconclusive.length };
}

export function validatorMessage(claimId: string, consensusHash: string, verdict: string) {
  return `MUSE_VALIDATOR_V1|${claimId}|${consensusHash}|${verdict}`;
}

export async function calculateEpochRewardWeights(epochId: number) {
  const REWARD_RULE_VERSION = epochId >= 1491726 ? 'muse-rewards-v2-reviewed-research' : 'muse-rewards-v1';
  const result = await env.DB.prepare(
    `SELECT wallet, SUM(points) AS points
     FROM reward_events WHERE epoch_id = ?
     GROUP BY wallet HAVING SUM(points) > 0 ORDER BY wallet`,
  ).bind(epochId).all<{ wallet: string; points: number }>();
  const scores = (result.results ?? []).map((row) => ({ wallet: row.wallet, points: Number(row.points) }));
  const totalPoints = scores.reduce((sum, row) => sum + row.points, 0);
  if (!totalPoints) return { epochId, totalPoints: 0, ruleVersion: REWARD_RULE_VERSION, allocations: [], calculationHash: null };
  const allocations = scores.map((row) => {
    const numerator = row.points * 1_000_000;
    return { ...row, allocationPpm: Math.floor(numerator / totalPoints), remainder: numerator % totalPoints };
  });
  let remaining = 1_000_000 - allocations.reduce((sum, row) => sum + row.allocationPpm, 0);
  const order = [...allocations].sort((left, right) => right.remainder - left.remainder || left.wallet.localeCompare(right.wallet));
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) order[index % order.length].allocationPpm += 1;
  const publicAllocations = allocations.map(({ wallet, points, allocationPpm }) => ({ wallet, points, allocationPpm }));
  const calculationHash = await contentAddress('MUSE_EPOCH_REWARD_WEIGHTS_V1', { epochId, ruleVersion: REWARD_RULE_VERSION, totalPoints, allocations: publicAllocations });
  return { epochId, totalPoints, ruleVersion: REWARD_RULE_VERSION, allocations: publicAllocations, calculationHash };
}
