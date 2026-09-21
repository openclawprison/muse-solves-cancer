import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { allocateEntireBalance } from './allocation.mjs';
import { buildManifest } from './merkle.mjs';
import { CONFIG_SEED, loadProgram, requiredEnv } from './solana.mjs';

const execute = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./settle-manifest.mjs', import.meta.url));
const site = requiredEnv('MUSE_SITE_URL').replace(/\/$/, '');
if (!site.startsWith('https://')) throw new Error('MUSE_SITE_URL must use HTTPS');
const apiKey = requiredEnv('MUSE_OPERATOR_API_KEY');
const stateDir = resolve(requiredEnv('MUSE_KEEPER_STATE_DIR'));
const startEpoch = Number(requiredEnv('MUSE_KEEPER_START_EPOCH'));
if (!Number.isInteger(startEpoch) || startEpoch < 0) throw new Error('MUSE_KEEPER_START_EPOCH must be a nonnegative integer');
const live = process.env.MUSE_ENABLE_MAINNET_PAYMENTS === 'true';
const statePath = join(stateDir, 'keeper-state.json');

await mkdir(stateDir, { recursive: true });

async function getJson(path, init) {
  const response = await fetch(`${site}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body;
}

async function operatorPost(path, body) {
  return getJson(path, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

async function readState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { lastCompletedEpoch: startEpoch - 1 }; throw error; }
}

async function saveState(value) {
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}

async function configuredVault() {
  const expectedProgramId = requiredEnv('MUSE_REWARD_PROGRAM_ID');
  const expectedMint = requiredEnv('MUSE_REWARD_MINT');
  const expectedGenesis = requiredEnv('MUSE_EXPECTED_GENESIS_HASH');
  const expectedKeeper = requiredEnv('MUSE_KEEPER_ADDRESS');
  const { connection, program, provider } = await loadProgram();
  if ((await connection.getGenesisHash()) !== expectedGenesis) throw new Error('RPC genesis hash does not match the configured chain');
  if (program.programId.toBase58() !== expectedProgramId) throw new Error('IDL program ID does not match the configured program ID');
  const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
  const account = await program.account.config.fetch(config);
  if (account.rewardMint.toBase58() !== expectedMint) throw new Error('Vault reward mint does not match METAx configuration');
  if (account.keeper.toBase58() !== expectedKeeper || provider.publicKey.toBase58() !== expectedKeeper) throw new Error('Keeper public key does not match vault configuration');
  const vault = getAssociatedTokenAddressSync(account.rewardMint, config, true, account.rewardTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const balance = await connection.getTokenAccountBalance(vault, 'confirmed');
  const available = BigInt(balance.value.amount) - BigInt(account.reservedRewardUnits.toString());
  if (available < 0n) throw new Error('Vault reserved balance exceeds token balance');
  return { connection, program, vault, available };
}

async function tick() {
  const state = await readState();
  const operator = await getJson('/api/operator');
  const latestClosedEpoch = operator.round.latestClosedEpoch;
  const epochId = Math.max(startEpoch, state.lastCompletedEpoch + 1);
  if (epochId > latestClosedEpoch) return { status: 'waiting', nextEpoch: epochId };
  const rewards = await getJson(`/api/science/rewards?epochId=${epochId}`);
  if (!rewards.allocations?.length) {
    await saveState({ lastCompletedEpoch: epochId });
    return { status: 'empty', epochId };
  }
  if (!live) return { status: 'dry_run', epochId, allocationCount: rewards.allocations.length, calculationHash: rewards.calculationHash };

  await operatorPost('/api/operator/epoch', { epochId });
  const { available } = await configuredVault();
  const manifestPath = join(stateDir, `epoch-${epochId}.json`);
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (available === 0n) return { status: 'unfunded', epochId };
    const payouts = allocateEntireBalance(available.toString(), rewards.allocations.map((row) => ({ wallet: row.wallet, score: row.points })));
    manifest = buildManifest(epochId, payouts, { rewardRuleVersion: rewards.ruleVersion, rewardCalculationHash: rewards.calculationHash });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  if (manifest.provenance.rewardCalculationHash !== rewards.calculationHash) throw new Error('Reward calculation changed after manifest was sealed');
  if (manifest.payouts.reduce((sum, payout) => sum + BigInt(payout.amountRewardUnits), 0n).toString() !== manifest.totalRewardUnits) throw new Error('Stored manifest has an invalid total');
  const { stdout } = await execute(process.execPath, [scriptPath, manifestPath], { maxBuffer: 1024 * 1024 * 2 });
  const settled = JSON.parse(stdout);
  if (settled.payoutResults.length !== manifest.payouts.length) throw new Error('Not every payout has a confirmed receipt or transaction');
  const byIndex = new Map(settled.payoutResults.map((row) => [row.index, row]));
  await operatorPost('/api/operator/settlement', {
    epochId,
    manifestHash: manifest.manifestHash,
    merkleRoot: manifest.merkleRoot,
    totalRewardUnits: manifest.totalRewardUnits,
    commitTxHash: settled.commitTxHash,
    payouts: manifest.payouts.map((payout) => ({ index: payout.index, wallet: payout.wallet, score: payout.score, amountRewardUnits: payout.amountRewardUnits, txHash: byIndex.get(payout.index)?.txHash ?? null })),
  });
  await saveState({ lastCompletedEpoch: epochId });
  return { status: 'settled', epochId, payoutCount: manifest.payouts.length, merkleRoot: manifest.merkleRoot };
}

async function run() {
  try { console.log(JSON.stringify(await tick())); }
  catch (error) { console.error(error); if (process.argv.includes('--once')) process.exitCode = 1; }
}

let running = false;
async function guardedRun() {
  if (running) return;
  running = true;
  try { await run(); }
  finally { running = false; }
}

await guardedRun();
if (!process.argv.includes('--once')) setInterval(() => void guardedRun(), 60_000);
