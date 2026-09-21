import { env } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { epochPayouts, epochs } from '@/db/schema';
import { settleNextEpoch } from '@/lib/scoring';
import { calculateEpochRewardWeights } from '@/lib/evidence-graph';
import { roundClock, roundStartedAt } from '@/lib/round-clock';

const FULL_RELEASE_BPS = 10_000;
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

async function rewardTokenBalance(address?: string) {
  if (!address) return null;
  const response = await fetch(env.MUSE_CHAIN_RPC_URL || SOLANA_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'muse-reward-balance', method: 'getTokenAccountBalance', params: [address, { commitment: 'confirmed' }] }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { result?: { value?: { amount?: string } } };
  return payload.result?.value?.amount ? BigInt(payload.result.value.amount) : null;
}

export async function collectCreatorFees() {
  return {
    status: env.MUSE_TREASURY_ADDRESS && env.MUSE_TOKEN_ADDRESS
      ? 'permissionless_distribution_available'
      : 'awaiting_protocol_deployment',
    amountRewardUnits: '0',
    txHash: null,
    note: 'Pump fee sharing is distributed permissionlessly. The research allocation is paid directly in verified METAx to the audited reward vault.',
  };
}

export async function distributeEpochRewards(epochId: number) {
  const db = getDb();
  let [epoch] = await db.select().from(epochs).where(eq(epochs.id, epochId)).limit(1);
  const scienceRewards = await calculateEpochRewardWeights(epochId);
  if (scienceRewards.allocations.length && (!epoch || (['empty', 'scored'].includes(epoch.status) && !epoch.distributionHash))) {
    await env.DB.prepare(
      `INSERT INTO epochs (id, status, model, submission_count, eligible_count, total_points, opened_at, scored_at, distribution_status)
       VALUES (?, 'scored', ?, 0, ?, ?, ?, ?, 'ready')
       ON CONFLICT(id) DO UPDATE SET status = 'scored', model = excluded.model,
         eligible_count = excluded.eligible_count, total_points = excluded.total_points,
         scored_at = excluded.scored_at, distribution_status = 'ready'`,
    ).bind(epochId, scienceRewards.ruleVersion, scienceRewards.allocations.length, scienceRewards.totalPoints, await roundStartedAt(epochId), Date.now()).run();
    [epoch] = await db.select().from(epochs).where(eq(epochs.id, epochId)).limit(1);
  }
  if (!epoch) return { status: 'missing_epoch', epochId, scienceRewards };
  if (epoch.status !== 'scored') return { status: epoch.status, epochId, scienceRewards };
  if (epoch.distributionHash) return { status: epoch.distributionStatus, epochId, scienceRewards };

  const keeperAddress = env.MUSE_KEEPER_ADDRESS || env.MUSE_OPERATOR_ADDRESS;
  const state = env.MUSE_TREASURY_ADDRESS && env.MUSE_REWARD_PROGRAM_ID && keeperAddress
    ? 'awaiting_keeper_submission'
    : 'awaiting_protocol_deployment';
  await db.update(epochs).set({ distributionStatus: state }).where(eq(epochs.id, epochId));
  return { status: state, epochId, scienceRewards };
}

export async function runHourlyRewardCycle() {
  const scored = await settleNextEpoch();
  const epochId = 'id' in scored && typeof scored.id === 'number'
    ? scored.id
    : (await roundClock()).latestClosedEpoch;
  const distribution = await distributeEpochRewards(epochId);
  return { cadenceMinutes: (await roundClock()).customSchedule ? 30 : 20, scored, distribution };
}

export async function getOperatorStatus() {
  const db = getDb();
  const treasuryAddress = env.MUSE_TREASURY_ADDRESS || null;
  const balance = await rewardTokenBalance(env.MUSE_REWARD_TOKEN_ACCOUNT).catch(() => null);
  const recentEpochs = await db.select().from(epochs).orderBy(desc(epochs.id)).limit(12);
  const payouts = await db.select().from(epochPayouts).orderBy(desc(epochPayouts.createdAt)).limit(24);
  const nextBudget = balance ?? 0n;
  const keeperAddress = env.MUSE_KEEPER_ADDRESS || env.MUSE_OPERATOR_ADDRESS || null;
  const round = await roundClock();

  return {
    status: treasuryAddress ? 'solana_connected' : 'prelaunch',
    chainId: 101,
    explorerUrl: 'https://solscan.io',
    treasuryAddress,
    tokenAddress: env.MUSE_REWARD_MINT || null,
    operatorAddress: keeperAddress,
    keeperConfigured: Boolean(keeperAddress && env.MUSE_REWARD_PROGRAM_ID),
    keeperAuthorized: Boolean(keeperAddress && env.MUSE_TREASURY_ADDRESS && env.MUSE_REWARD_PROGRAM_ID),
    operatorAuthConfigured: Boolean(env.MUSE_OPERATOR_API_KEY),
    aiConfigured: Boolean(env.OPENAI_API_KEY),
    releaseBps: FULL_RELEASE_BPS,
    hardMaxReleaseBps: FULL_RELEASE_BPS,
    cadenceSeconds: round.customSchedule ? 1800 : 1200,
    round,
    chain: balance === null ? null : {
      treasuryBalanceWei: balance.toString(), availableBalanceWei: balance.toString(), pendingOperationsPayoutWei: '0',
      totalOperationsForwardedWei: '0', operationsWallet: keeperAddress || '', pendingWei: '0',
      maxPayoutWei: nextBudget.toString(), hardMaxPayoutWei: nextBudget.toString(),
      nextBudgetWei: nextBudget.toString(), reserveAfterNextWei: '0', totalDepositedWei: balance.toString(),
      totalScheduledWei: '0', totalDistributedWei: '0', latestEpoch: recentEpochs[0]?.id ?? 0,
      currentPayoutEpoch: round.latestClosedEpoch, paused: false,
    },
    pons: { claimableWei: '0', curveAddress: null, creatorRecipient: treasuryAddress, feeEscrowAddress: null, unsweptBaseFeeWei: '0', unsweptCreatorTaxWei: '0', unsweptTotalWei: '0', buybackEnabled: null, graduated: null },
    recentEpochs,
    payouts,
  };
}
