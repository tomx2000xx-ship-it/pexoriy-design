/**
 * Deterministic server-side settlement rules for Pexoriy simulated positions.
 * TC is an integer credit unit in the current ledger; losses cannot exceed the
 * TC reserved for a position. Positive simulated P&L is explicitly issued as TC.
 */
export function calculateRealizedSettlement({ allocationTc, side, entryPriceMicros, exitPriceMicros }) {
  if (!Number.isSafeInteger(allocationTc) || allocationTc < 1) throw new TypeError("Allocation must be a positive whole TC amount.");
  if (!["long", "short"].includes(side)) throw new TypeError("Position side must be long or short.");
  if (!Number.isSafeInteger(entryPriceMicros) || entryPriceMicros <= 0 ||
      !Number.isSafeInteger(exitPriceMicros) || exitPriceMicros <= 0) {
    throw new TypeError("Entry and exit prices must be positive integer micro-prices.");
  }
  const sign = side === "short" ? -1 : 1;
  const rawPnl = Math.round(allocationTc * ((exitPriceMicros - entryPriceMicros) / entryPriceMicros) * sign);
  const returnedTc = Math.max(0, allocationTc + rawPnl);
  const realizedPnlTc = returnedTc - allocationTc;
  const postings = [];
  if (returnedTc > 0) postings.push({ account: "user", amount: returnedTc });
  postings.push({ account: "reserve", amount: -allocationTc });
  if (realizedPnlTc > 0) postings.push({ account: "issuance", amount: -realizedPnlTc });
  else if (realizedPnlTc < 0) postings.push({ account: "fees", amount: -realizedPnlTc });
  if (postings.length < 2 || postings.reduce((sum, posting) => sum + posting.amount, 0) !== 0) {
    throw new Error("Settlement postings are not balanced.");
  }
  return { allocationTc, returnedTc, realizedPnlTc, postings };
}

export function isFreshValidatedQuote(quote, nowMs, maxAgeMs = 90000) {
  if (!quote || quote.validation_status !== "valid") return false;
  const timestamp = Number(quote.provider_timestamp_ms);
  const price = Number(quote.price_micros);
  const age = Number(nowMs) - timestamp;
  return Number.isSafeInteger(price) && price > 0 &&
    Number.isFinite(timestamp) && age >= -15000 && age <= maxAgeMs;
}
