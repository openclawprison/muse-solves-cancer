export const RESEARCH_REWARD_START_ROUND = 1491726;
export const RESEARCH_REWARD_VERSION = 'muse-reviewed-research-v2';
type Work = { id: string; wallet: string; workType: string };
type Score = { id: string; total: number; duplicateRisk: boolean; safetyConcern: boolean };
// Reward the strongest accepted work in each category, not submission volume.
export function researchRewards(rows: Work[], scores: Score[]) {
  const work = new Map(rows.map(row => [row.id, row]));
  const best = new Map<string, Work & { points: number }>();
  for (const score of scores) {
    const row = work.get(score.id);
    if (!row || !Number.isInteger(score.total) || score.total <= 0 || score.total > 100 || score.duplicateRisk || score.safetyConcern) continue;
    const points = Math.max(5, Math.ceil(score.total / 5));
    const key = row.wallet + ':' + row.workType;
    const previous = best.get(key);
    if (!previous || points > previous.points || (points === previous.points && row.id < previous.id)) best.set(key, { ...row, points });
  }
  return [...best.values()].sort((a,b) => a.wallet.localeCompare(b.wallet) || a.workType.localeCompare(b.workType));
}
