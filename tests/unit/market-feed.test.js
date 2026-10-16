import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMarketQuote } from "../../worker/market-feed.js";

const now = 1_800_000_000_000;

test("accepts positive exchange quotes with a fresh provider timestamp", () => {
  const quote = normalizeMarketQuote({ price: "81780.7", timestamp: now - 1200, provider: "binance-spot-public" }, now);
  assert.deepEqual(quote, {
    price: 81780.7,
    priceMicros: 81780700000,
    timestamp: now - 1200,
    provider: "binance-spot-public",
  });
});

test("rejects stale, far-future, missing-timestamp, and non-finite quotes", () => {
  assert.equal(normalizeMarketQuote({ price: 10, timestamp: now - 90001, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: 10, timestamp: now + 15001, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: 10, timestamp: NaN, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: Infinity, timestamp: now, provider: "test" }, now), null);
});

test("rejects zero, negative, unrepresentable, and unidentified provider prices", () => {
  assert.equal(normalizeMarketQuote({ price: 0, timestamp: now, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: -2, timestamp: now, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: 0.0000001, timestamp: now, provider: "test" }, now), null);
  assert.equal(normalizeMarketQuote({ price: 1, timestamp: now, provider: "" }, now), null);
});
