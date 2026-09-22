import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSigner } from './signer.mjs';

test('JSON and base58 exports load the same matching wallet',()=>{
  const key = Keypair.generate();
  for (const secretKey of [JSON.stringify([...key.secretKey]),bs58.encode(key.secretKey)]) {
    const loaded = loadSigner({secretKey,treasury:key.publicKey.toBase58()});
    assert.deepEqual(loaded.secretKey,key.secretKey);
  }
});
test('rejects mismatched wallet, seed phrases, malformed exports and multiple sources without echoing secrets',()=>{
  const key=Keypair.generate();
  for (const secretKey of ['private secret phrase example', '[999]',bs58.encode(key.secretKey),bs58.encode(new Uint8Array(32))]) {
    assert.throws(()=>loadSigner({secretKey,treasury:Keypair.generate().publicKey.toBase58()}),error=>{
      assert.equal(error.message.includes(secretKey),false);return true;
    });
  }
  assert.throws(()=>loadSigner({keyFile:'some-file',secretKey:'secret',treasury:key.publicKey.toBase58()}),/exactly one/);
});
test('signer-check command works without RPC or journal and refuses enabled payments',()=>{
  const key=Keypair.generate();
  const env={...process.env,MUSE_TREASURY_ADDRESS:key.publicKey.toBase58(),
    MUSE_TREASURY_SECRET_KEY:bs58.encode(key.secretKey),MUSE_ENABLE_WALLET_PAYMENTS:'false'};
  delete env.MUSE_TREASURY_KEYPAIR_FILE;
  const command=new URL('./run.mjs',import.meta.url);
  const args=[fileURLToPath(command),'--check-signer'];
  const result=spawnSync(process.execPath,args,{env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).publicAddress,key.publicKey.toBase58());
  assert.equal(result.stdout.includes(env.MUSE_TREASURY_SECRET_KEY),false);
  assert.notEqual(spawnSync(process.execPath,args,{env:{...env,MUSE_ENABLE_WALLET_PAYMENTS:'true'}}).status,0);
});
