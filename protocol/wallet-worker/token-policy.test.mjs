import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Keypair } from '@solana/web3.js';
import { ExtensionType as E, TOKEN_2022_PROGRAM_ID as program } from '@solana/spl-token';
import { METAX_MINT, validateMintPolicy, validateAccountPolicy } from './token-policy.mjs';
const address=new PublicKey(METAX_MINT);
function tlv(type, data) { const head=Buffer.alloc(4); head.writeUInt16LE(type); head.writeUInt16LE(data.length,2); return Buffer.concat([head,data]); }
function mint(tlvData) { return {address,decimals:8,tlvData}; }
test('METAx profile accepts observed clear-transfer mint extensions',()=>{
  const data=Buffer.concat([[E.MetadataPointer,64],[E.PermanentDelegate,32],[E.ScaledUiAmountConfig,56],
    [E.PausableConfig,33],[E.ConfidentialTransferMint,65],[E.TransferHook,64],[E.TokenMetadata,12]]
    .map(([type,size])=>tlv(type,Buffer.alloc(size))).concat(tlv(E.DefaultAccountState,Buffer.from([1]))));
  assert.doesNotThrow(()=>validateMintPolicy(mint(data),program));
  assert.throws(()=>validateMintPolicy({...mint(data),address:Keypair.generate().publicKey},program),/Unreviewed/);
});
test('paused, frozen default, active hook, fees and unknown extensions fail closed',()=>{
  const paused=Buffer.alloc(33);paused[32]=1;
  const hook=Buffer.alloc(64);hook[63]=1;
  for(const data of [tlv(E.PausableConfig,paused),tlv(E.DefaultAccountState,Buffer.from([2])),
    tlv(E.TransferHook,hook),tlv(E.TransferFeeConfig,Buffer.alloc(108)),tlv(999,Buffer.alloc(0))])
    assert.throws(()=>validateMintPolicy(mint(data),program));
});
test('source accepts only simple clear-balance extensions',()=>{
  const data=Buffer.concat([tlv(E.ImmutableOwner,Buffer.alloc(0)),tlv(E.PausableAccount,Buffer.alloc(0)),tlv(E.TransferHookAccount,Buffer.from([0]))]);
  assert.doesNotThrow(()=>validateAccountPolicy({tlvData:data},address,program));
  for(const data of [tlv(E.ConfidentialTransferAccount,Buffer.alloc(0)),tlv(E.TransferHookAccount,Buffer.from([1]))])
    assert.throws(()=>validateAccountPolicy({tlvData:data},address,program));
});
test('truncated, duplicate, wrong-size extension entries fail closed',()=>{
  const valid=tlv(E.PausableConfig,Buffer.alloc(33));
  for(const data of [valid.subarray(0,10),Buffer.concat([valid,valid]),tlv(E.PausableConfig,Buffer.alloc(32)),Buffer.from([1])])
    assert.throws(()=>validateMintPolicy(mint(data),program));
});
