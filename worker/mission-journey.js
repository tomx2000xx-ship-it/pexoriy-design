export const MISSION_JOURNEY_LENGTH = 30;

export function calculateMissionCurrentDay(startedAt, now = new Date()) {
  const started = new Date(startedAt);
  const current = new Date(now);
  if (!Number.isFinite(started.getTime()) || !Number.isFinite(current.getTime())) return 1;
  const elapsedDays = Math.floor((current.getTime() - started.getTime()) / 86400000);
  return Math.max(1, Math.min(MISSION_JOURNEY_LENGTH, elapsedDays + 1));
}
