import { PublicKey } from '@solana/web3.js';
import { ExtensionType as E, TOKEN_2022_PROGRAM_ID, getPausableConfig,
  getDefaultAccountState, getTransferHook, getTransferHookAccount } from '@solana/spl-token';

export const METAX_MINT = 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu';
// Explicit profile, not general permission to transfer arbitrary Token-2022 assets.
const mintLengths = new Map([[E.MetadataPointer,64],[E.PermanentDelegate,32],
  [E.DefaultAccountState,1],[E.ScaledUiAmountConfig,56],[E.PausableConfig,33],
  [E.ConfidentialTransferMint,65],[E.TransferHook,64],[E.TokenMetadata,null]]);
const accountLengths = new Map([[E.ImmutableOwner,0],[E.PausableAccount,0],[E.TransferHookAccount,1]]);

function checkTlv(data, allowed) {
  const seen = new Set();
  for (let offset=0; offset<data.length;) {
    if (data.subarray(offset).every(byte=>byte===0)) break;
    if (offset+4>data.length) throw new Error('Malformed token extension');
    const type=data.readUInt16LE(offset), length=data.readUInt16LE(offset+2);
    if (!allowed.has(type) || seen.has(type) || offset+4+length>data.length ||
      (allowed.get(type)!==null && allowed.get(type)!==length)) throw new Error('Unsupported token extension');
    seen.add(type); offset+=4+length;
  }
}

export function validateMintPolicy(mint, program) {
  if (!mint.tlvData.length) return;
  if (!program.equals(TOKEN_2022_PROGRAM_ID) || mint.address.toBase58()!==METAX_MINT || mint.decimals!==8)
    throw new Error('Unreviewed extended mint');
  checkTlv(mint.tlvData,mintLengths);
  if (getPausableConfig(mint)?.paused) throw new Error('Mint is paused');
  const state=getDefaultAccountState(mint);
  if (state && state.state!==1) throw new Error('New token accounts would not be initialized');
  const hook=getTransferHook(mint);
  if (hook && !hook.programId.equals(PublicKey.default)) throw new Error('Active transfer hook is unsupported');
  // Scaled UI amounts do not alter raw integer balances/TransferChecked units.
  // Confidential mint capability is not used: confidential account state is rejected.
  // Issuer freeze, pause and permanent-delegate powers remain external risks.
}

export function validateAccountPolicy(account, mint, program) {
  if (!account.tlvData.length) return;
  if (!program.equals(TOKEN_2022_PROGRAM_ID) || mint.toBase58()!==METAX_MINT)
    throw new Error('Unreviewed extended token account');
  checkTlv(account.tlvData,accountLengths);
  if (getTransferHookAccount(account)?.transferring) throw new Error('Token account is transferring');
}
