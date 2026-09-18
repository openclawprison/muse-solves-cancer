import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const CONFIG_SEED = Buffer.from('config');
export const EPOCH_SEED = Buffer.from('epoch');
export const RECEIPT_SEED = Buffer.from('receipt');

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function loadJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

export async function loadKeypair(path) {
  const bytes = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error('wallet keypair file must contain 64 bytes');
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export async function loadProgram() {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com';
  const walletPath = requiredEnv('ANCHOR_WALLET');
  const idlPath = process.env.MUSE_IDL_PATH || 'target/idl/muse_reward_vault.json';
  const keypair = await loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' });
  const idl = await loadJson(idlPath);
  const program = new Program(idl, provider);
  return { connection, keypair, program, provider };
}

export async function mintTokenProgram(connection, mint) {
  const info = await connection.getAccountInfo(mint, 'confirmed');
  if (!info) throw new Error(`reward mint does not exist: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  throw new Error(`unsupported reward token program: ${info.owner.toBase58()}`);
}

export function u32le(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(Number(value));
  return bytes;
}

export function publicKey(value, label) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid Solana public key`);
  }
}
