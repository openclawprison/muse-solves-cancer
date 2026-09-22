// Read-only deployment check. Never imports a private key, signs or sends transactions.
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getMint, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { METAX_MINT, validateMintPolicy, validateAccountPolicy } from './token-policy.mjs';

const expectedGenesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
async function main() {
  if(process.env.MUSE_ENABLE_WALLET_PAYMENTS==='true') throw new Error('Payments must be disabled');
  const rpc=new URL(process.env.MUSE_CHAIN_RPC_URL || 'https://api.mainnet-beta.solana.com');
  if(rpc.protocol!=='https:') throw new Error('HTTPS required');
  const connection=new Connection(rpc.href,{commitment:'finalized',fetch:(url,options)=>
    fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)})});
  if(await connection.getGenesisHash()!==expectedGenesis) throw new Error('Wrong chain');
  const treasury=new PublicKey(process.env.MUSE_TREASURY_ADDRESS);
  const mint=new PublicKey(METAX_MINT);
  const token=await getMint(connection,mint,'finalized',TOKEN_2022_PROGRAM_ID);
  if(!token.isInitialized || token.decimals!==8) throw new Error('Wrong mint');
  validateMintPolicy(token,TOKEN_2022_PROGRAM_ID);
  const source=getAssociatedTokenAddressSync(mint,treasury,false,TOKEN_2022_PROGRAM_ID);
  const blockers=[];
  const solLamports=await connection.getBalance(treasury,'finalized');
  if(solLamports===0) blockers.push('treasury_needs_sol_for_fees');
  let rewardUnits='0';
  if(await connection.getAccountInfo(source,'finalized')) {
    const account=await getAccount(connection,source,'finalized',TOKEN_2022_PROGRAM_ID);
    if(!account.owner.equals(treasury)||!account.mint.equals(mint)||!account.isInitialized||account.isFrozen||account.delegate||account.closeAuthority)
      throw new Error('Unsafe source account');
    validateAccountPolicy(account,mint,TOKEN_2022_PROGRAM_ID);
    rewardUnits=account.amount.toString();
    if(account.amount===0n) blockers.push('treasury_needs_metax');
  } else blockers.push('metax_associated_token_account_missing');
  let round=null;
  if(!process.env.MUSE_KEEPER_API_KEY) blockers.push('site_worker_credential_missing');
  else {
    const origin=new URL(process.env.MUSE_SITE_URL);
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
      throw new Error('Invalid site origin');
    const response=await fetch(new URL('/api/keeper/status',origin),{
      headers:{authorization:`Bearer ${process.env.MUSE_KEEPER_API_KEY}`},redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok) blockers.push('site_worker_authentication_failed');
    else {
      round=(await response.json()).round;
      if(!round?.customSchedule) blockers.push('research_schedule_not_started');
    }
  }
  console.log(JSON.stringify({status:blockers.length?'preflight_blocked':'preflight_ready',paymentsEnabled:false,
    treasury:treasury.toBase58(),mint:METAX_MINT,decimals:8,source:source.toBase58(),solLamports,rewardUnits,round,blockers}));
}
main().catch(()=>{console.error(JSON.stringify({status:'preflight_failed',paymentsEnabled:false,
  message:'Public chain or site check failed. No signer was loaded and no transaction was sent.'}));process.exitCode=1;});
