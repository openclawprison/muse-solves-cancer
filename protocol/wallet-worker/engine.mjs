import { allocateEntireBalance } from '../client/allocation.mjs';
import { buildManifest } from '../client/merkle.mjs';
import { createHash } from 'node:crypto';

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

export function halfTreasuryBudget(balanceRewardUnits) {
  const balance = BigInt(balanceRewardUnits);
  if (balance < 0n) throw new Error('Invalid treasury balance');
  return (balance / 2n).toString();
}

export function makePooledPlan(rewardBudget, snapshots, treasury) {
  if (!Array.isArray(snapshots) || !snapshots.length) throw new Error('No closed rounds to settle');
  const byWallet = new Map();
  let previous = snapshots[0].epochId - 1;
  for (const snapshot of snapshots) {
    if (snapshot.epochId !== previous + 1 || !Array.isArray(snapshot.allocations) || snapshot.allocations.length > 1000) throw new Error('Invalid pooled round sequence');
    previous = snapshot.epochId;
    if (snapshot.allocations.length && (!/^[a-f0-9]{64}$/i.test(snapshot.calculationHash) || typeof snapshot.ruleVersion !== 'string')) throw new Error('Missing calculation provenance');
    const seen = new Set();
    for (const row of snapshot.allocations) {
      if (!Number.isSafeInteger(row.points) || row.points <= 0 || row.wallet === treasury || seen.has(row.wallet)) throw new Error('Invalid pooled recipient or score');
      seen.add(row.wallet);
      const score = (byWallet.get(row.wallet) ?? 0) + row.points;
      if (!Number.isSafeInteger(score)) throw new Error('Pooled score overflow');
      byWallet.set(row.wallet, score);
    }
  }
  if (!byWallet.size) return null;
  if (byWallet.size > 1000) throw new Error('Too many pooled recipients');
  const epochId = snapshots.at(-1).epochId;
  const provenance = createHash('sha256').update(JSON.stringify(snapshots.map(({epochId,calculationHash,ruleVersion}) => ({epochId,calculationHash,ruleVersion})))).digest('hex');
  const manifest = buildManifest(epochId, allocateEntireBalance(rewardBudget, [...byWallet].map(([wallet,score]) => ({wallet,score}))), {
    rewardRuleVersion:'muse-half-treasury-v1', rewardCalculationHash:provenance,
  });
  return {manifest,coveredEpochIds:snapshots.map(row => row.epochId)};
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
    if (!Number.isSafeInteger(clock.latestClosedEpoch)) throw new Error('Invalid round clock');
    let policyStart = journal.policyStart();
    if (policyStart === null) {
      if (!Number.isSafeInteger(clock.id) || clock.id <= clock.latestClosedEpoch) throw new Error('Invalid current round for policy activation');
      policyStart = clock.id + 1; // First full round opened after activation.
      if (live) journal.setPolicyStart(policyStart);
    }
    const epochId = journal.next(startEpoch);
    if (epochId < policyStart && epochId <= clock.latestClosedEpoch) {
      const lastSkipped = Math.min(policyStart - 1,clock.latestClosedEpoch,epochId + 999);
      if (live) {
        await site.skip({firstEpochId:epochId,lastEpochId:lastSkipped,policyStartEpoch:policyStart});
        journal.insert({epochId:lastSkipped,complete:true,policySkipped:true,firstCoveredEpochId:epochId});
      }
      return {status:live?'policy_skipped':'dry_run_policy_skip',firstEpochId:epochId,lastEpochId:lastSkipped,policyStartEpoch:policyStart};
    }
    if (epochId > clock.latestClosedEpoch) return {status:'waiting',epochId};
    const balance = await chain.balance();
    const rewardBudget = halfTreasuryBudget(balance);
    if (BigInt(rewardBudget) === 0n) {
      if (live) {
        try { await site.score(epochId); }
        catch (error) { if (error?.message?.includes('HTTP 409')) return {status:'scoring',epochId}; throw error; }
      }
      return {status:BigInt(balance) === 0n ? 'unfunded' : 'reserve_only',epochId};
    }
    if (live) {
      try { await site.score(epochId); }
      catch (error) { if (error?.message?.includes('HTTP 409')) return {status:'scoring',epochId}; throw error; }
    }
    const rewards = await site.rewards(epochId);
    if (rewards.epochId !== epochId || !Array.isArray(rewards.allocations)) throw new Error('Invalid reward snapshot');
    const snapshots = [rewards];
    const pooled = makePooledPlan(rewardBudget,snapshots,treasury);
    const cutoff = epochId;
    if (!pooled) {
      if (live) journal.insert({epochId:cutoff,coveredEpochIds:snapshots.map(row=>row.epochId),complete:true,empty:true});
      return {status:live?'empty':'dry_run_empty',epochId:cutoff,coveredRounds:snapshots.length};
    }
    if (!live) return {status:'dry_run',epochId:cutoff,coveredRounds:snapshots.length,payoutCount:pooled.manifest.payouts.length,totalRewardUnits:pooled.manifest.totalRewardUnits};
    await chain.validateRecipients(pooled.manifest.payouts);
    round = {epochId:cutoff,coveredEpochIds:pooled.coveredEpochIds,treasurySnapshotUnits:String(balance),manifest:pooled.manifest,complete:false,paymentMode:'sized-batches-v2',batches:await chain.planBatches(pooled.manifest.payouts)};
    journal.insert(round);
  }
  if (!live) return {status:'dry_run_pending',epochId:round.epochId};
  // Never recalculate a sealed round, even after restart or later score changes.
  // Older sealed rounds retain their original per-recipient attempts. New rounds
  // use one durable attempt at index -1, shared by every recipient in the report.
  const batch = round.paymentMode === 'atomic-batch-v1';
  // Upgrade only an unsigned old atomic round. A signed attempt is never regrouped.
  if (batch && !journal.attempt(round.epochId,-1)) {
    round.batches = await chain.planBatches(round.manifest.payouts);
    round.paymentMode = 'sized-batches-v2';
    journal.save(round);
  }
  const groups = round.paymentMode === 'sized-batches-v2' ? round.batches : batch ? [{index:-1,payouts:round.manifest.payouts}] : round.manifest.payouts;
  for (const payout of groups) {
    if (!await advancePayment(journal,chain,round.epochId,payout)) return {status:'confirming',epochId:round.epochId,index:payout.index};
  }
  await site.report({
    epochId:round.epochId,manifestHash:round.manifest.manifestHash,merkleRoot:round.manifest.merkleRoot,
    coveredEpochIds:round.coveredEpochIds ?? [round.epochId],
    ...(round.treasurySnapshotUnits ? {treasurySnapshotUnits:round.treasurySnapshotUnits} : {}),
    totalRewardUnits:round.manifest.totalRewardUnits,commitTxHash:null,
    payouts:round.manifest.payouts.map(p => ({index:p.index,wallet:p.wallet,score:p.score,amountRewardUnits:p.amountRewardUnits,
      txHash:journal.attempt(round.epochId,round.paymentMode === 'sized-batches-v2' ? groups.find(g=>g.payouts.some(row=>row.index===p.index)).index : batch ? -1 : p.index).signature})),
  });
  round.complete = true;
  journal.save(round);
  return {status:'settled',epochId:round.epochId,coveredRounds:round.coveredEpochIds?.length ?? 1,payoutCount:round.manifest.payouts.length};
}
