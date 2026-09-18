import { env } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { epochPayouts, epochs } from '@/db/schema';
import { settleNextEpoch } from '@/lib/scoring';

const CYCLE_MS = 20 * 60 * 1000;
const DEFAULT_RELEASE_BPS = 100;
const HARD_MAX_RELEASE_BPS = 2_500;
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

function releaseBps() {
  const value = Number(env.MUSE_HOURLY_RELEASE_BPS ?? DEFAULT_RELEASE_BPS);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), HARD_MAX_RELEASE_BPS) : DEFAULT_RELEASE_BPS;
}

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
  const [epoch] = await db.select().from(epochs).where(eq(epochs.id, epochId)).limit(1);
  if (!epoch) return { status: 'missing_epoch', epochId };
  if (epoch.status !== 'scored') return { status: epoch.status, epochId };

  const state = env.MUSE_TREASURY_ADDRESS && env.MUSE_REWARD_PROGRAM_ID
    ? 'awaiting_reviewer_approvals'
    : 'awaiting_protocol_deployment';
  await db.update(epochs).set({ distributionStatus: state }).where(eq(epochs.id, epochId));
  return { status: state, epochId };
}

export async function runHourlyRewardCycle() {
  const scored = await settleNextEpoch();
  const epochId = 'id' in scored && typeof scored.id === 'number'
    ? scored.id
    : Math.floor(Date.now() / CYCLE_MS) - 1;
  const distribution = await distributeEpochRewards(epochId);
  return { cadenceMinutes: 20, scored, distribution };
}

export async function getOperatorStatus() {
  const db = getDb();
  const treasuryAddress = env.MUSE_TREASURY_ADDRESS || null;
  const balance = await rewardTokenBalance(env.MUSE_REWARD_TOKEN_ACCOUNT).catch(() => null);
  const recentEpochs = await db.select().from(epochs).orderBy(desc(epochs.id)).limit(12);
  const payouts = await db.select().from(epochPayouts).orderBy(desc(epochPayouts.createdAt)).limit(24);
  const configuredBps = releaseBps();
  const nextBudget = balance === null ? 0n : (balance * BigInt(configuredBps)) / 10_000n;

  return {
    status: treasuryAddress ? 'solana_connected' : 'prelaunch',
    chainId: 101,
    explorerUrl: 'https://solscan.io',
    treasuryAddress,
    tokenAddress: env.MUSE_REWARD_MINT || null,
    operatorAddress: env.MUSE_OPERATOR_ADDRESS || null,
    keeperConfigured: Boolean(env.MUSE_OPERATOR_ADDRESS && env.MUSE_REWARD_PROGRAM_ID),
    keeperAuthorized: Boolean(env.MUSE_OPERATOR_ADDRESS && env.MUSE_TREASURY_ADDRESS && env.MUSE_REWARD_PROGRAM_ID),
    aiConfigured: Boolean(env.OPENAI_API_KEY),
    releaseBps: configuredBps,
    hardMaxReleaseBps: HARD_MAX_RELEASE_BPS,
    cadenceSeconds: CYCLE_MS / 1000,
    chain: balance === null ? null : {
      treasuryBalanceWei: balance.toString(), availableBalanceWei: balance.toString(), pendingOperationsPayoutWei: '0',
      totalOperationsForwardedWei: '0', operationsWallet: env.MUSE_OPERATOR_ADDRESS || '', pendingWei: '0',
      maxPayoutWei: nextBudget.toString(), hardMaxPayoutWei: ((balance * BigInt(HARD_MAX_RELEASE_BPS)) / 10_000n).toString(),
      nextBudgetWei: nextBudget.toString(), reserveAfterNextWei: (balance - nextBudget).toString(), totalDepositedWei: balance.toString(),
      totalScheduledWei: '0', totalDistributedWei: '0', latestEpoch: recentEpochs[0]?.id ?? 0,
      currentPayoutEpoch: Math.floor(Date.now() / CYCLE_MS) - 1, paused: false,
    },
    pons: { claimableWei: '0', curveAddress: null, creatorRecipient: treasuryAddress, feeEscrowAddress: null, unsweptBaseFeeWei: '0', unsweptCreatorTaxWei: '0', unsweptTotalWei: '0', buybackEnabled: null, graduated: null },
    recentEpochs,
    payouts,
  };
}
