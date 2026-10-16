/**
 * Versioned deterministic rules for Pexoriy simulated market orders.
 * Model v3: 3 bps half-spread + 10 bps conservative slippage per fill,
 * plus a 5 bps simulated taker fee on each filled notional.
 */
export const SIMULATION_MODEL_VERSION = "simulation-v3";
export const SIMULATED_TAKER_FEE_BPS = 5;
export const SIMULATED_FILL_ADVERSE_BPS = 13;
export const MAX_OPEN_POSITIONS = 5;
export const MAX_POSITION_EQUITY_BPS = 2500;
export const MAX_TOTAL_EXPOSURE_EQUITY_BPS = 7500;

export function calculateSimulatedFillPrice({ quotePriceMicros, action, adverseBps = SIMULATED_FILL_ADVERSE_BPS }) {
  if (!Number.isSafeInteger(quotePriceMicros) || quotePriceMicros <= 0) throw new TypeError("Quote price must be a positive integer micro-price.");
  if (!["buy", "sell"].includes(action)) throw new TypeError("Fill action must be buy or sell.");
  if (!Number.isSafeInteger(adverseBps) || adverseBps < 0 || adverseBps > 1000) throw new TypeError("Invalid simulated execution cost.");
  const adjusted = Math.round(quotePriceMicros * (10000 + (action === "buy" ? adverseBps : -adverseBps)) / 10000);
  if (!Number.isSafeInteger(adjusted) || adjusted <= 0) throw new RangeError("Simulated fill price is outside the supported precision.");
  return adjusted;
}

export function calculateTakerFeeTc(notionalTc) {
  if (!Number.isSafeInteger(notionalTc) || notionalTc < 0) throw new TypeError("Fee notional must be a non-negative whole TC amount.");
  if (notionalTc === 0) return 0;
  return Math.max(1, Math.ceil(notionalTc * SIMULATED_TAKER_FEE_BPS / 10000));
}

export function calculateRealizedSettlement({ allocationTc, side, entryPriceMicros, exitPriceMicros, openFeeTc = 0, closeFeeTc = 0 }) {
  if (!Number.isSafeInteger(allocationTc) || allocationTc < 1) throw new TypeError("Allocation must be a positive whole TC amount.");
  if (!["long", "short"].includes(side)) throw new TypeError("Position side must be long or short.");
  if (!Number.isSafeInteger(entryPriceMicros) || entryPriceMicros <= 0 ||
      !Number.isSafeInteger(exitPriceMicros) || exitPriceMicros <= 0) {
    throw new TypeError("Entry and exit prices must be positive integer micro-prices.");
  }
  if (!Number.isSafeInteger(openFeeTc) || openFeeTc < 0 || !Number.isSafeInteger(closeFeeTc) || closeFeeTc < 0) {
    throw new TypeError("Fees must be non-negative whole TC amounts.");
  }
  const sign = side === "short" ? -1 : 1;
  const rawPnl = Math.round(allocationTc * ((exitPriceMicros - entryPriceMicros) / entryPriceMicros) * sign);
  const grossReturnedTc = Math.max(0, allocationTc + rawPnl);
  const appliedCloseFeeTc = Math.min(closeFeeTc, grossReturnedTc);
  const returnedTc = grossReturnedTc - appliedCloseFeeTc;
  const realizedPnlTc = returnedTc - allocationTc - openFeeTc;
  const postings = [];
  if (returnedTc > 0) postings.push({ account: "user", amount: returnedTc });
  if (grossReturnedTc > 0) postings.push({ account: "reserve", amount: -grossReturnedTc });
  if (appliedCloseFeeTc > 0) postings.push({ account: "fees", amount: appliedCloseFeeTc });
  if (postings.length > 0 && postings.reduce((sum, posting) => sum + posting.amount, 0) !== 0) {
    throw new Error("Settlement postings are not balanced.");
  }
  return { allocationTc, grossPnlTc: grossReturnedTc - allocationTc, grossReturnedTc, openFeeTc, closeFeeTc: appliedCloseFeeTc, returnedTc, realizedPnlTc, postings };
}

export function isFreshValidatedQuote(quote, nowMs, maxAgeMs = 90000) {
  if (!quote || quote.validation_status !== "valid") return false;
  const timestamp = Number(quote.provider_timestamp_ms);
  const price = Number(quote.price_micros);
  const age = Number(nowMs) - timestamp;
  return Number.isSafeInteger(price) && price > 0 &&
    Number.isFinite(timestamp) && age >= -15000 && age <= maxAgeMs;
}
