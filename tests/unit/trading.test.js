import test from "node:test";
import assert from "node:assert/strict";
import { calculateRealizedSettlement, isFreshValidatedQuote } from "../../worker/trading.js";

test("long winner returns reserved TC plus balanced simulated gains", () => {
  const result = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 110000000 });
  assert.equal(result.realizedPnlTc, 100);
  assert.equal(result.returnedTc, 1100);
  assert.deepEqual(result.postings, [
    { account: "user", amount: 1100 },
    { account: "reserve", amount: -1000 },
    { account: "issuance", amount: -100 },
  ]);
  assert.equal(result.postings.reduce((sum, item) => sum + item.amount, 0), 0);
});

test("short winner and losing trades settle directionally and cap loss at reserved TC", () => {
  const shortWin = calculateRealizedSettlement({ allocationTc: 1000, side: "short", entryPriceMicros: 100000000, exitPriceMicros: 90000000 });
  assert.equal(shortWin.realizedPnlTc, 100);
  assert.equal(shortWin.returnedTc, 1100);

  const longLoss = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 80000000 });
  assert.equal(longLoss.realizedPnlTc, -200);
  assert.equal(longLoss.returnedTc, 800);
  assert.equal(longLoss.postings.reduce((sum, item) => sum + item.amount, 0), 0);

  const wiped = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 0.5 });
  assert.equal(wiped.realizedPnlTc, -1000);
  assert.equal(wiped.returnedTc, 0);
  assert.equal(wiped.postings.reduce((sum, item) => sum + item.amount, 0), 0);
});

test("flat exit returns allocation without creating a profit or loss", () => {
  const result = calculateRealizedSettlement({ allocationTc: 12, side: "short", entryPriceMicros: 123456, exitPriceMicros: 123456 });
  assert.equal(result.realizedPnlTc, 0);
  assert.equal(result.returnedTc, 12);
  assert.equal(result.postings.length, 2);
});

test("settlement rejects invalid allocation, side and prices", () => {
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 0, side: "long", entryPriceMicros: 1, exitPriceMicros: 1 }));
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 1, side: "sideways", entryPriceMicros: 1, exitPriceMicros: 1 }));
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 1, side: "long", entryPriceMicros: 0, exitPriceMicros: 1 }));
});

test("server only accepts valid quotes inside the age window", () => {
  const now = 1_800_000_000_000;
  const quote = { validation_status: "valid", price_micros: 1200000, provider_timestamp_ms: now - 30000 };
  assert.equal(isFreshValidatedQuote(quote, now), true);
  assert.equal(isFreshValidatedQuote({ ...quote, provider_timestamp_ms: now - 90001 }, now), false);
  assert.equal(isFreshValidatedQuote({ ...quote, validation_status: "stale" }, now), false);
  assert.equal(isFreshValidatedQuote({ ...quote, price_micros: 0 }, now), false);
});
