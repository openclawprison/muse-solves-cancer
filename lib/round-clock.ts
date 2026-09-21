import { env } from 'cloudflare:workers';

export const LEGACY_EPOCH_MS = 20 * 60 * 1000;
export const ROUND_MS = 30 * 60 * 1000;
export const RESEARCH_MS = 25 * 60 * 1000;

type Schedule = { start_epoch_id: number; started_at: number; superseded_at: number | null };

export type RoundClock = {
  id: number;
  phase: 'research' | 'distribution';
  startedAt: number;
  researchEndsAt: number;
  distributionEndsAt: number;
  secondsRemaining: number;
  latestClosedEpoch: number;
  customSchedule: boolean;
};

export async function roundClock(now = Date.now()): Promise<RoundClock> {
  const schedule = await env.DB.prepare(
    'SELECT start_epoch_id, started_at, superseded_at FROM round_schedules ORDER BY start_epoch_id DESC LIMIT 1',
  ).first<Schedule>();
  if (!schedule) {
    const id = Math.floor(now / LEGACY_EPOCH_MS);
    const startedAt = id * LEGACY_EPOCH_MS;
    return { id, phase: 'research', startedAt, researchEndsAt: startedAt + LEGACY_EPOCH_MS,
      distributionEndsAt: startedAt + LEGACY_EPOCH_MS, secondsRemaining: Math.ceil((startedAt + LEGACY_EPOCH_MS - now) / 1000),
      latestClosedEpoch: id - 1, customSchedule: false };
  }
  const elapsed = Math.max(0, now - schedule.started_at);
  const cycles = Math.floor(elapsed / ROUND_MS);
  const id = schedule.start_epoch_id + cycles;
  const startedAt = schedule.started_at + cycles * ROUND_MS;
  const researchEndsAt = startedAt + RESEARCH_MS;
  const distributionEndsAt = startedAt + ROUND_MS;
  const phase = now < researchEndsAt ? 'research' : 'distribution';
  return { id, phase, startedAt, researchEndsAt, distributionEndsAt,
    secondsRemaining: Math.max(0, Math.ceil(((phase === 'research' ? researchEndsAt : distributionEndsAt) - now) / 1000)),
    latestClosedEpoch: phase === 'distribution' ? id : id - 1, customSchedule: true };
}

export async function writableRoundId(now = Date.now()) {
  const clock = await roundClock(now);
  if (clock.phase !== 'research') throw new Error('The research window has closed. Please submit when the next round begins.');
  return clock.id;
}

export async function isRoundClosed(epochId: number, now = Date.now()) {
  const clock = await roundClock(now);
  return Number.isInteger(epochId) && epochId >= 0 && epochId <= clock.latestClosedEpoch;
}

export async function roundStartedAt(epochId: number) {
  const schedule = await env.DB.prepare(
    'SELECT start_epoch_id, started_at FROM round_schedules WHERE start_epoch_id <= ? ORDER BY start_epoch_id DESC LIMIT 1',
  ).bind(epochId).first<{ start_epoch_id: number; started_at: number }>();
  return schedule ? schedule.started_at + (epochId - schedule.start_epoch_id) * ROUND_MS : epochId * LEGACY_EPOCH_MS;
}

export async function restartRound(now = Date.now()) {
  const previous = await roundClock(now);
  const nextId = Math.max(previous.id + 1, Math.floor(now / LEGACY_EPOCH_MS));
  const currentSchedule = await env.DB.prepare('SELECT start_epoch_id FROM round_schedules ORDER BY start_epoch_id DESC LIMIT 1')
    .first<{ start_epoch_id: number }>();
  const operations = [];
  if (currentSchedule) operations.push(env.DB.prepare('UPDATE round_schedules SET superseded_at = ? WHERE start_epoch_id = ? AND superseded_at IS NULL').bind(now, currentSchedule.start_epoch_id));
  operations.push(env.DB.prepare('INSERT INTO round_schedules (start_epoch_id, started_at, created_at) VALUES (?, ?, ?)').bind(nextId, now, now));
  await env.DB.batch(operations);
  return { previousRoundId: previous.id, ...(await roundClock(now)) };
}
