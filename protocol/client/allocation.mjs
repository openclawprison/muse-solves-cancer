export function allocateEntireBalance(balanceRewardUnits, scoredAgents) {
  const balance = BigInt(balanceRewardUnits);
  if (balance <= 0n) throw new Error('balance must be positive');
  if (!Array.isArray(scoredAgents)) throw new Error('scoredAgents must be an array');

  const normalized = scoredAgents
    .map((agent) => ({
      wallet: String(agent.wallet),
      score: Number(agent.score),
      artifactIds: Array.isArray(agent.artifactIds) ? agent.artifactIds.map(String) : [],
    }))
    .filter((agent) => Number.isInteger(agent.score) && agent.score > 0)
    .sort((left, right) => left.wallet.localeCompare(right.wallet));

  if (!normalized.length) throw new Error('at least one positive-score agent is required');
  if (new Set(normalized.map((agent) => agent.wallet)).size !== normalized.length) {
    throw new Error('wallets must be unique before allocation');
  }

  const totalScore = normalized.reduce((sum, agent) => sum + BigInt(agent.score), 0n);
  const allocations = normalized.map((agent) => {
    const numerator = balance * BigInt(agent.score);
    return {
      ...agent,
      amountRewardUnits: numerator / totalScore,
      remainder: numerator % totalScore,
    };
  });

  let assigned = allocations.reduce((sum, agent) => sum + agent.amountRewardUnits, 0n);
  let remaining = balance - assigned;
  const remainderOrder = [...allocations].sort(
    (left, right) =>
      (left.remainder === right.remainder
        ? left.wallet.localeCompare(right.wallet)
        : left.remainder > right.remainder
          ? -1
          : 1),
  );
  for (let index = 0; remaining > 0n; index += 1) {
    remainderOrder[index % remainderOrder.length].amountRewardUnits += 1n;
    remaining -= 1n;
  }

  const payouts = allocations
    .filter((agent) => agent.amountRewardUnits > 0n)
    .map(({ wallet, score, artifactIds, amountRewardUnits }) => ({
      wallet,
      score,
      artifactIds,
      amountRewardUnits: amountRewardUnits.toString(),
    }));
  assigned = payouts.reduce((sum, payout) => sum + BigInt(payout.amountRewardUnits), 0n);
  if (assigned !== balance) throw new Error('allocation invariant failed');
  return payouts;
}
