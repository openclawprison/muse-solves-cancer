import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { CONFIG_SEED, loadProgram, mintTokenProgram, publicKey, requiredEnv } from './solana.mjs';

const mint = publicKey(requiredEnv('MUSE_REWARD_MINT'), 'MUSE_REWARD_MINT');
const keeper = publicKey(requiredEnv('MUSE_KEEPER_ADDRESS'), 'MUSE_KEEPER_ADDRESS');
const { connection, program, provider } = await loadProgram();
const programId = program.programId;
if (programId.equals(SystemProgram.programId)) throw new Error('run anchor keys sync before initialization');

const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
const rewardTokenProgram = await mintTokenProgram(connection, mint);
const rewardVault = getAssociatedTokenAddressSync(mint, config, true, rewardTokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
const existing = await connection.getAccountInfo(config, 'confirmed');

let signature = null;
if (!existing) {
  signature = await program.methods
    .initialize(keeper)
    .accounts({
      config,
      rewardMint: mint,
      rewardVault,
      payer: provider.publicKey,
      rewardTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

console.log(JSON.stringify({
  clusterRpc: connection.rpcEndpoint,
  programId: programId.toBase58(),
  configPda: config.toBase58(),
  rewardVaultTokenAccount: rewardVault.toBase58(),
  rewardMint: mint.toBase58(),
  rewardTokenProgram: rewardTokenProgram.toBase58(),
  keeper: keeper.toBase58(),
  initializedNow: !existing,
  signature,
}, null, 2));
