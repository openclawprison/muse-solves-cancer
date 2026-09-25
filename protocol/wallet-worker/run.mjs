import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openJournal } from './journal.mjs';
import { connectChain } from './solana.mjs';
import { tick } from './engine.mjs';
import { loadSigner } from './signer.mjs';

function required(name) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
}
function https(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('HTTPS URL required; no embedded credentials');
  return url;
}
function integer(name) {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}

async function main() {
  if (process.argv.includes('--check-signer')) {
    if (process.env.MUSE_ENABLE_WALLET_PAYMENTS === 'true') throw new Error('Disable payments before checking signer');
    const signer = loadSigner({keyFile:process.env.MUSE_TREASURY_KEYPAIR_FILE,
      secretKey:process.env.MUSE_TREASURY_SECRET_KEY,treasury:required('MUSE_TREASURY_ADDRESS')});
    console.log(JSON.stringify({status:'signer_verified',publicAddress:signer.publicKey.toBase58(),paymentsEnabled:false}));
    return; // No RPC, journal access, signatures or transfers in this mode.
  }
  const origin = https(required('MUSE_SITE_URL'));
  if (origin.pathname !== '/' || origin.search) throw new Error('Site URL must be an origin');
  const live = process.env.MUSE_ENABLE_WALLET_PAYMENTS === 'true';
  const config = {
    live, rpc:https(required('MUSE_CHAIN_RPC_URL')).href,
    genesis:required('MUSE_EXPECTED_GENESIS_HASH'), treasury:required('MUSE_TREASURY_ADDRESS'),
    mint:required('MUSE_REWARD_MINT'), decimals:integer('MUSE_REWARD_DECIMALS'), source:required('MUSE_REWARD_TOKEN_ACCOUNT'),
    keyFile:live ? process.env.MUSE_TREASURY_KEYPAIR_FILE : null,
    secretKey:live ? process.env.MUSE_TREASURY_SECRET_KEY : null,
  };
  if (config.keyFile && !isAbsolute(config.keyFile)) throw new Error('Signer file path must be absolute');
  const directory = required('MUSE_WALLET_STATE_DIR');
  if (!isAbsolute(directory)) throw new Error('State directory must be absolute');
  const startEpoch = integer('MUSE_WALLET_START_EPOCH');
  const apiKey = required('MUSE_KEEPER_API_KEY');
  if (apiKey.length < 32) throw new Error('Service credential too short');
  if (!existsSync(join(directory,'payouts.sqlite')) && !process.argv.includes('--initialize')) throw new Error('Missing payment journal. Use --initialize only for a new, never-used treasury');
  if (process.argv.includes('--initialize') && live) throw new Error('Initialize only with payments disabled');
  const journal = openJournal(directory,{site:origin.origin,genesis:config.genesis,treasury:config.treasury,mint:config.mint,source:config.source,decimals:config.decimals,startEpoch});
  let stopping = false;
  process.once('SIGINT',() => {stopping=true;});
  process.once('SIGTERM',() => {stopping=true;});
  try {
    if (process.argv.includes('--initialize')) {
      console.log(JSON.stringify({status:'initialized',paymentsEnabled:false}));
      return;
    }
    const chain = await connectChain(config);
    async function api(path, body) {
      const response = await fetch(new URL(path,origin),{
        method:body === undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store',
        headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
        ...(body === undefined?{}:{body:JSON.stringify(body)}),
      });
      if (!response.ok) throw new Error(`Research API returned HTTP ${response.status}`);
      const result = await response.json();
      if (result.ok === false) throw new Error('Research API rejected request');
      return result;
    }
    const site = {
      clock: async () => (await api('/api/keeper/status')).round,
      score: epochId => api('/api/operator/epoch',{epochId}),
      rewards: epochId => api(`/api/science/rewards?epochId=${epochId}`),
      report: body => api('/api/operator/settlement',body),
      skip: body => api('/api/operator/policy-skip',body),
    };
    do {
      try { console.log(JSON.stringify({at:new Date().toISOString(),...await tick({journal,site,chain,startEpoch,live,treasury:config.treasury})})); }
      catch (error) {
        // RPC exception text can contain a credential-bearing URL. Never log it.
        console.error(JSON.stringify({status:'attention_required',at:new Date().toISOString(),
          message:error.message?.startsWith('Payment expired') || error.message?.startsWith('Finalized payment failed')
            ? error.message : 'Cycle failed; check service credentials, RPC, SOL/token balances and journal. Signed attempts are preserved.'}));
        if (process.argv.includes('--once')) process.exitCode=1;
      }
      if (process.argv.includes('--once') || stopping) break;
      await delay(3000);
    } while (!stopping);
  } finally { journal.close(); }
}

main().catch(() => {
  console.error('Worker startup failed. Check required configuration, signer permissions, chain identity and exclusive journal lock. No credentials are logged.');
  process.exitCode=1;
});
