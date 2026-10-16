export function normalizeMarketQuote({ price, timestamp, provider }, nowMs = Date.now(), maxAgeMs = 90000) {
  const numericPrice = Number(price);
  const providerTimestamp = Number(timestamp);
  const priceMicros = Math.round(numericPrice * 1000000);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isSafeInteger(priceMicros)) return null;
  if (!Number.isFinite(providerTimestamp) || providerTimestamp > nowMs + 15000 ||
      nowMs - providerTimestamp < -15000 || nowMs - providerTimestamp > maxAgeMs) return null;
  if (typeof provider !== "string" || !provider.length) return null;
  return { price: numericPrice, priceMicros, timestamp: providerTimestamp, provider };
}
