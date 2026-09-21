import { BN } from '@coral-xyz/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { buildManifest } from './merkle.mjs';
import { CONFIG_SEED, EPOCH_SEED, RECEIPT_SEED, loadJson, loadProgram, u32le } from './solana.mjs';

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) throw new Error('Usage: node protocol/client/settle-manifest.mjs <manifest.json>');
const manifest = await loadJson(manifestPath);
const rebuilt = buildManifest(manifest.epochId, manifest.payouts, manifest.provenance);
if (
  rebuilt.merkleRoot !== manifest.merkleRoot ||
  rebuilt.manifestHash !== manifest.manifestHash ||
  rebuilt.totalRewardUnits !== manifest.totalRewardUnits
) throw new Error('manifest failed deterministic verification');

const { connection, program, provider } = await loadProgram();
const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
const configState = await program.account.config.fetch(config);

const rewardMint = configState.rewardMint;
const rewardTokenProgram = configState.rewardTokenProgram;
const rewardVault = getAssociatedTokenAddressSync(rewardMint, config, true, rewardTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
const epochId = new BN(manifest.epochId);
const [epoch] = PublicKey.findProgramAddressSync([EPOCH_SEED, epochId.toArrayLike(Buffer, 'le', 8)], program.programId);
const existingEpoch = await program.account.epoch.fetchNullable(epoch);

const transactions = [];
const payoutResults = [];
let commitTxHash = null;
if (!existingEpoch) {
  if (!configState.keeper.equals(provider.publicKey)) throw new Error('only the configured keeper can commit a new epoch');
  const vaultBalance = await connection.getTokenAccountBalance(rewardVault, 'confirmed');
  const unreservedBalance = BigInt(vaultBalance.value.amount) - BigInt(configState.reservedRewardUnits.toString());
  if (unreservedBalance.toString() !== manifest.totalRewardUnits) {
    throw new Error(`manifest total ${manifest.totalRewardUnits} must equal the complete unreserved vault balance ${unreservedBalance}`);
  }
  commitTxHash = await program.methods
    .createEpoch(
      epochId,
      [...Buffer.from(manifest.merkleRoot, 'hex')],
      [...Buffer.from(manifest.manifestHash, 'hex')],
      new BN(manifest.totalRewardUnits),
      manifest.payouts.length,
    )
    .accounts({ config, rewardMint, rewardVault, epoch, keeper: provider.publicKey, rewardTokenProgram, systemProgram: SystemProgram.programId })
    .rpc();
  transactions.push(commitTxHash);
} else {
  const root = Buffer.from(existingEpoch.root).toString('hex');
  const manifestHash = Buffer.from(existingEpoch.manifestHash).toString('hex');
  if (root !== manifest.merkleRoot || manifestHash !== manifest.manifestHash || existingEpoch.totalRewardUnits.toString() !== manifest.totalRewardUnits) {
    throw new Error('existing onchain epoch does not match this manifest');
  }
}

for (const payout of manifest.payouts) {
  const recipient = new PublicKey(payout.wallet);
  const [receipt] = PublicKey.findProgramAddressSync([RECEIPT_SEED, epoch.toBuffer(), u32le(payout.index)], program.programId);
  if (await connection.getAccountInfo(receipt, 'confirmed')) {
    payoutResults.push({ index: payout.index, wallet: payout.wallet, status: 'receipt_exists', txHash: null });
    continue;
  }
  const recipientRewardAccount = getAssociatedTokenAddressSync(rewardMint, recipient, true, rewardTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const txHash = await program.methods
    .payLeaf(payout.index, new BN(payout.amountRewardUnits), payout.proof.map((node) => [...Buffer.from(node, 'hex')]))
    .accounts({
      config,
      epoch,
      receipt,
      rewardMint,
      rewardVault,
      recipient,
      recipientRewardAccount,
      payer: provider.publicKey,
      rewardTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  transactions.push(txHash);
  payoutResults.push({ index: payout.index, wallet: payout.wallet, status: 'submitted', txHash });
}

console.log(JSON.stringify({ epochId: manifest.epochId, epochPda: epoch.toBase58(), commitTxHash, transactions, payoutResults }, null, 2));
