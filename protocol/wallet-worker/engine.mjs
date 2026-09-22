import { allocateEntireBalance } from '../client/allocation.mjs';
import { buildManifest } from '../client/merkle.mjs';

export function makePlan(epochId, balance, rewards, treasury) {
  if (rewards.epochId !== epochId || !Array.isArray(rewards.allocations) || rewards.allocations.length > 1000) throw new Error('Invalid reward snapshot');
  for (const row of rewards.allocations) {
    if (!Number.isSafeInteger(row.points) || row.points <= 0 || row.wallet === treasury) throw new Error('Invalid recipient or score');
  }
  if (!rewards.allocations.length) return null;
  if (!/^[a-f0-9]{64}$/i.test(rewards.calculationHash) || typeof rewards.ruleVersion !== 'string') throw new Error('Missing calculation provenance');
  return buildManifest(epochId, allocateEntireBalance(balance, rewards.allocations.map(row => ({wallet:row.wallet,score:row.points}))), {
    rewardRuleVersion:rewards.ruleVersion, rewardCalculationHash:rewards.calculationHash,
  });
}

// Only ever rebroadcast the SAME bytes. A missing historical signature after
// expiry is not proof of non-payment; halt instead of signing a replacement.
export async function advancePayment(journal, chain, epoch, payout) {
  let attempt = journal.attempt(epoch, payout.index);
  if (attempt?.finalized) return true;
  if (!attempt) {
    attempt = payout.payouts ? await chain.prepareBatch(payout.payouts) : await chain.prepare(payout);
    journal.seal(epoch,payout.index,attempt); // durable BEFORE any broadcast
  }
  const status = await chain.status(attempt.signature);
  if (status?.confirmationStatus === 'finalized') {
    if (status.err) throw new Error(`Finalized payment failed; review round ${epoch}, payout ${payout.index}`);
    journal.finalize(epoch,payout.index);
    return true;
  }
  if (status) return false; // processed/confirmed is not finalized, including fork errors
  if (await chain.height() > attempt.lastValidBlockHeight) {
    throw new Error(`Payment expired with unknown outcome; review round ${epoch}, payout ${payout.index}. No replacement signed.`);
  }
  await chain.broadcast(attempt.raw, attempt.signature);
  return false;
}

export async function tick({journal,site,chain,startEpoch,live,treasury}) {
  let round = journal.pending();
  if (!round) {
    const clock = await site.clock();
    if (!clock.customSchedule) throw new Error('Start a 25+5 round in the operator panel before enabling this worker');
    const epochId = journal.next(startEpoch);
    if (!Number.isSafeInteger(clock.latestClosedEpoch)) throw new Error('Invalid round clock');
    if (epochId > clock.latestClosedEpoch) return {status:'waiting',epochId};
    // Scoring first, then take the snapshot. No mutation in dry-run mode.
    if (live) await site.score(epochId);
    const rewards = await site.rewards(epochId);
    const balance = await chain.balance();
    if (!rewards.allocations?.length) {
      if (rewards.epochId !== epochId || !Array.isArray(rewards.allocations)) throw new Error('Invalid empty snapshot');
      if (live) journal.insert({epochId,complete:true,empty:true});
      return {status:live?'empty':'dry_run_empty',epochId};
    }
    if (BigInt(balance) === 0n) return {status:'unfunded',epochId};
    const manifest = makePlan(epochId,balance,rewards,treasury);
    if (!live) return {status:'dry_run',epochId,payoutCount:manifest.payouts.length,totalRewardUnits:manifest.totalRewardUnits};
    await chain.validateRecipients(manifest.payouts);
    round = {epochId,manifest,complete:false,paymentMode:'atomic-batch-v1'};
    journal.insert(round);
  }
  if (!live) return {status:'dry_run_pending',epochId:round.epochId};
  // Never recalculate a sealed round, even after restart or later score changes.
  // Older sealed rounds retain their original per-recipient attempts. New rounds
  // use one durable attempt at index -1, shared by every recipient in the report.
  const batch = round.paymentMode === 'atomic-batch-v1';
  for (const payout of batch ? [{index:-1,payouts:round.manifest.payouts}] : round.manifest.payouts) {
    if (!await advancePayment(journal,chain,round.epochId,payout)) return {status:'confirming',epochId:round.epochId,index:payout.index};
  }
  await site.report({
    epochId:round.epochId,manifestHash:round.manifest.manifestHash,merkleRoot:round.manifest.merkleRoot,
    totalRewardUnits:round.manifest.totalRewardUnits,commitTxHash:null,
    payouts:round.manifest.payouts.map(p => ({index:p.index,wallet:p.wallet,score:p.score,amountRewardUnits:p.amountRewardUnits,
      txHash:journal.attempt(round.epochId,batch ? -1 : p.index).signature})),
  });
  round.complete = true;
  journal.save(round);
  return {status:'settled',epochId:round.epochId,payoutCount:round.manifest.payouts.length};
}
