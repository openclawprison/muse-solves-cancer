import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { loadSigner } from './signer.mjs';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint, getAccount, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import { validateMintPolicy, validateAccountPolicy } from './token-policy.mjs';

export async function connectChain(config, injectedConnection) {
  const connection = injectedConnection ?? new Connection(config.rpc, {commitment:'finalized', fetch: (url,options) =>
    fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)})});
  if (await connection.getGenesisHash() !== config.genesis) throw new Error('RPC chain mismatch');
  const treasury = new PublicKey(config.treasury);
  const mint = new PublicKey(config.mint);
  const source = new PublicKey(config.source);
  const mintInfo = await connection.getAccountInfo(mint,'finalized');
  if (!mintInfo || ![TOKEN_PROGRAM_ID.toBase58(),TOKEN_2022_PROGRAM_ID.toBase58()].includes(mintInfo.owner.toBase58())) throw new Error('Unsupported mint owner');
  const program = mintInfo.owner;
  async function checkedMint() {
    const token = await getMint(connection,mint,'finalized',program);
    if (!token.isInitialized || token.decimals !== config.decimals) throw new Error('Mint decimals mismatch');
    validateMintPolicy(token,program);
    return token;
  }
  const token = await checkedMint();
  // Transfer fees/hooks/confidential balances must never silently change payouts.
  let signer;
  if (config.live) {
    signer = loadSigner(config);
  }
  async function account() {
    const result = await getAccount(connection,source,'finalized',program);
    if (!result.isInitialized || !result.owner.equals(treasury) || !result.mint.equals(mint) || result.isFrozen || result.delegate || result.closeAuthority) throw new Error('Source token account failed safety checks');
    validateAccountPolicy(result,mint,program);
    return result;
  }
  await account();
  function recipient(value) {
    const key = new PublicKey(value);
    if (!PublicKey.isOnCurve(key.toBytes()) || key.equals(treasury)) throw new Error('Recipient must be a distinct normal wallet');
    return key;
  }
  return {
    async balance() { return (await account()).amount.toString(); },
    async validateRecipients(payouts) { for (const payout of payouts) recipient(payout.wallet); },
    async prepare(payout) {
      if (!signer) throw new Error('Signing disabled');
      await checkedMint(); // Recheck mutable issuer controls before every signature.
      if ((await account()).amount < BigInt(payout.amountRewardUnits)) throw new Error('Treasury token balance insufficient');
      const owner = recipient(payout.wallet);
      const destination = getAssociatedTokenAddressSync(mint,owner,false,program);
      const block = await connection.getLatestBlockhash('finalized');
      const transaction = new Transaction({feePayer:treasury,...block}).add(
        createAssociatedTokenAccountIdempotentInstruction(treasury,destination,owner,mint,program),
        createTransferCheckedInstruction(source,mint,destination,treasury,BigInt(payout.amountRewardUnits),token.decimals,[],program),
      );
      transaction.sign(signer);
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) throw new Error('Transfer simulation failed; check SOL fees, recipient restrictions and token balance');
      return {signature:bs58.encode(transaction.signature),raw:transaction.serialize().toString('base64'),
        lastValidBlockHeight:block.lastValidBlockHeight,finalized:false};
    },
    async status(signature) { return (await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0]; },
    async height() { return connection.getBlockHeight('finalized'); },
    async broadcast(raw,expected) {
      const actual = await connection.sendRawTransaction(Buffer.from(raw,'base64'),{skipPreflight:false,preflightCommitment:'finalized',maxRetries:3});
      if (actual !== expected) throw new Error('RPC signature mismatch');
    },
  };
}
