export function calculateReturnBps(currentEquityTc, startingEquityTc) {
  const current = Number(currentEquityTc);
  const starting = Number(startingEquityTc);
  if (!Number.isFinite(current) || !Number.isFinite(starting) || starting <= 0) return 0;
  return Math.round(((current - starting) / starting) * 10000);
}

export function calculateMaxDrawdownBps(peakEquityTc, currentEquityTc, previousMaxBps = 0) {
  const peak = Number(peakEquityTc);
  const current = Number(currentEquityTc);
  const previous = Number(previousMaxBps);
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(current)) return 10000;
  const observed = Math.min(10000, Math.max(0, Math.round(((peak - current) / peak) * 10000)));
  return Math.max(0, Math.min(10000, Math.max(Number.isFinite(previous) ? Math.round(previous) : 0, observed)));
}

export function calculateRiskAdjustedScore({ returnBps = 0, maxDrawdownBps = 0, verifiedTrades = 0, dailyCheckins = 0, completedLessons = 0 } = {}) {
  const safe = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  const drawdown = Math.min(10000, safe(maxDrawdownBps));
  const trades = safe(verifiedTrades);
  const checkins = safe(dailyCheckins);
  const lessons = safe(completedLessons);
  const activityBonus = Math.min(trades, 20) * 10 + Math.min(checkins, 14) * 5 + Math.min(lessons, 10) * 5;
  const safeReturn = Number.isFinite(Number(returnBps)) ? Math.round(Number(returnBps)) : 0;
  return Math.max(0, Math.round(safeReturn - Math.round(drawdown * 0.75) + activityBonus));
}
