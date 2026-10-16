/**
 * Deterministic helpers for the local practice-trading demo.
 *
 * These functions improve consistency and testability in the browser prototype.
 * They are NOT an authoritative ledger, a server-side risk engine, or production
 * financial accounting. Those controls must run on a trusted backend.
 */
export function roundTC(value) {
  if (!Number.isFinite(value)) return 0;
  return Number((value + Number.EPSILON).toFixed(2));
}

export function validateTCAllocation(rawAmount, availableTC, minimum = 1) {
  const amount = Number(rawAmount);
  const available = Number(availableTC);
  if (!Number.isFinite(amount) || amount < minimum) {
    return { valid: false, amount: null, reason: 'invalid-amount' };
  }
  if (!Number.isFinite(available) || available < 0 || amount > available) {
    return { valid: false, amount, reason: 'insufficient-tc' };
  }
  return { valid: true, amount: roundTC(amount), reason: null };
}

export function calculateSimulatedPnl({ allocation, entryPrice, markPrice, direction }) {
  const size = Number(allocation);
  const entry = Number(entryPrice);
  const mark = Number(markPrice);
  if (![size, entry, mark].every(Number.isFinite) || size < 0 || entry <= 0 || mark < 0) {
    return 0;
  }
  const sign = direction === 'Short' ? -1 : 1;
  return roundTC(size * ((mark - entry) / entry) * sign);
}

export function calculateCloseSettlement(allocation, simulatedPnl) {
  const size = Number(allocation);
  const pnl = Number(simulatedPnl);
  if (!Number.isFinite(size) || size < 0 || !Number.isFinite(pnl)) {
    return { tcReturned: 0, realizedPnl: 0 };
  }
  const realizedPnl = roundTC(pnl);
  return {
    tcReturned: roundTC(Math.max(0, size + realizedPnl)),
    realizedPnl
  };
}

export function calculateSimulatedFee(notional, rate) {
  const amount = Number(notional);
  const feeRate = Number(rate);
  if (![amount, feeRate].every(Number.isFinite) || amount < 0 || feeRate < 0) return 0;
  return roundTC(amount * feeRate);
}

export function calculateCompetitionReturn(startingEquity, endingEquity) {
  const start = Number(startingEquity);
  const end = Number(endingEquity);
  if (![start, end].every(Number.isFinite) || start <= 0 || end < 0) return null;
  return Number((((end - start) / start) * 100).toFixed(4));
}

export function marketDataIsFresh(lastUpdateMs, nowMs, maxAgeMs = 3000) {
  const last = Number(lastUpdateMs);
  const now = Number(nowMs);
  const maxAge = Number(maxAgeMs);
  if (![last, now, maxAge].every(Number.isFinite) || maxAge < 0) return false;
  const age = now - last;
  return age >= 0 && age <= maxAge;
}
