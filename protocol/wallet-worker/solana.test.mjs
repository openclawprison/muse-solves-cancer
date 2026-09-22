import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, Transaction } from '@solana/web3.js';
import { MintLayout, AccountLayout, TOKEN_PROGRAM_ID, decodeTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { connectChain } from './solana.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'muse-signer-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const signer=Keypair.generate(),mint=Keypair.generate().publicKey,source=Keypair.generate().publicKey,recipient=Keypair.generate().publicKey;
  const keyFile=join(dir,'ephemeral-test-key.json');
  writeFileSync(keyFile,JSON.stringify([...signer.secretKey]),{mode:0o600});
  const mintData=Buffer.alloc(MintLayout.span),accountData=Buffer.alloc(AccountLayout.span);
  MintLayout.encode({mintAuthorityOption:0,mintAuthority:signer.publicKey,supply:1000n,decimals:8,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:signer.publicKey},mintData);
  AccountLayout.encode({mint,owner:signer.publicKey,amount:1000n,delegateOption:0,delegate:signer.publicKey,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:signer.publicKey},accountData);
  const rpc={getGenesisHash:async()=>'expected',getAccountInfo:async key=>({owner:TOKEN_PROGRAM_ID,data:key.equals(mint)?mintData:accountData}),
    getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),
    simulateTransaction:async tx=>{assert.equal(tx.verifySignatures(),true);return {value:{err:null}};}};
  const config={live:true,genesis:'expected',treasury:signer.publicKey.toBase58(),mint:mint.toBase58(),source:source.toBase58(),decimals:8,keyFile};
  return {config,rpc,signer,mint,source,recipient,accountData};
}
test('builds a signed checked transfer to the correct agent ATA with exact units',async t=>{
  const f=fixture(t),chain=await connectChain(f.config,f.rpc);
  const result=await chain.prepare({wallet:f.recipient.toBase58(),amountRewardUnits:'123'});
  const tx=Transaction.from(Buffer.from(result.raw,'base64'));
  assert.equal(tx.verifySignatures(),true);assert.equal(tx.instructions.length,2);
  const instruction=decodeTransferCheckedInstruction(tx.instructions[1]);
  assert.equal(instruction.data.amount,123n);assert.equal(instruction.data.decimals,8);
  assert.ok(instruction.keys.source.pubkey.equals(f.source));
  assert.ok(instruction.keys.mint.pubkey.equals(f.mint));
  assert.ok(instruction.keys.owner.pubkey.equals(f.signer.publicKey));
  assert.ok(instruction.keys.destination.pubkey.equals(getAssociatedTokenAddressSync(f.mint,f.recipient)));
  assert.equal(result.lastValidBlockHeight,100);
});
test('wrong cluster, decimals, signer, and frozen account fail closed',async t=>{
  const f=fixture(t);
  await assert.rejects(connectChain({...f.config,genesis:'wrong'},f.rpc),/chain mismatch/);
  await assert.rejects(connectChain({...f.config,decimals:9},f.rpc),/decimals/);
  await assert.rejects(connectChain({...f.config,treasury:Keypair.generate().publicKey.toBase58()},f.rpc),/Signer/);
  f.accountData[108]=2;
  await assert.rejects(connectChain(f.config,f.rpc),/safety checks/);
});

test('three recipients share one signed transaction with exact amounts',async t=>{
  const f=fixture(t),chain=await connectChain(f.config,f.rpc);
  const payouts=[123,234,345].map(n=>({wallet:Keypair.generate().publicKey.toBase58(),amountRewardUnits:String(n)}));
  const result=await chain.prepareBatch(payouts);
  const tx=Transaction.from(Buffer.from(result.raw,'base64'));
  assert.equal(tx.verifySignatures(),true);
  assert.equal(tx.instructions.length,6);
  assert.ok(Buffer.from(result.raw,'base64').length<=1232);
  for(let i=0;i<3;i++) {
    const instruction=decodeTransferCheckedInstruction(tx.instructions[2*i+1]);
    assert.equal(instruction.data.amount,BigInt(payouts[i].amountRewardUnits));
    assert.ok(instruction.keys.destination.pubkey.equals(getAssociatedTokenAddressSync(f.mint,new (f.recipient.constructor)(payouts[i].wallet))));
  }
});

test('oversized batch fails before simulation or any broadcast',async t=>{
  const f=fixture(t),chain=await connectChain(f.config,f.rpc);
  f.rpc.simulateTransaction=async()=>assert.fail('must reject size before simulation');
  await assert.rejects(chain.prepareBatch(Array.from({length:30},()=>({wallet:Keypair.generate().publicKey.toBase58(),amountRewardUnits:'1'}))),/single-transaction size/);
});
test('dry run never loads a signer and cannot prepare payments',async t=>{
  const f=fixture(t),chain=await connectChain({...f.config,live:false,keyFile:'missing'},f.rpc);
  assert.equal(await chain.balance(),'1000');
  await assert.rejects(chain.prepare({wallet:f.recipient.toBase58(),amountRewardUnits:'1'}),/disabled/);
});
test('missing canonical receiving ATA waits unfunded, but arbitrary missing source fails',async t=>{
  const f=fixture(t),original=f.rpc.getAccountInfo;
  f.rpc.getAccountInfo=async key=>key.equals(f.mint)?original(key):null;
  const source=getAssociatedTokenAddressSync(f.mint,f.signer.publicKey).toBase58();
  const chain=await connectChain({...f.config,source},f.rpc);
  assert.equal(await chain.balance(),'0');
  await assert.rejects(chain.prepare({wallet:f.recipient.toBase58(),amountRewardUnits:'1'}),/insufficient/);
  await assert.rejects(connectChain(f.config,f.rpc));
});
