import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRealizedSettlement, isFreshValidatedQuote, calculateSimulatedFillPrice,
  calculateTakerFeeTc, MAX_OPEN_POSITIONS, MAX_POSITION_EQUITY_BPS, MAX_TOTAL_EXPOSURE_EQUITY_BPS,
} from "../../worker/trading.js";

test("long winner settles P&L from simulated fill prices and balances the virtual reserve", () => {
  const result = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 110000000 });
  assert.equal(result.grossPnlTc, 100);
  assert.equal(result.returnedTc, 1100);
  assert.deepEqual(result.postings, [
    { account: "user", amount: 1100 },
    { account: "reserve", amount: -1100 },
  ]);
  assert.equal(result.postings.reduce((sum, item) => sum + item.amount, 0), 0);
});

test("short winner and losing trades settle directionally, with losses credited to reserve not fees", () => {
  const shortWin = calculateRealizedSettlement({ allocationTc: 1000, side: "short", entryPriceMicros: 100000000, exitPriceMicros: 90000000 });
  assert.equal(shortWin.grossPnlTc, 100);
  assert.equal(shortWin.returnedTc, 1100);

  const longLoss = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 80000000 });
  assert.equal(longLoss.grossPnlTc, -200);
  assert.equal(longLoss.returnedTc, 800);
  assert.deepEqual(longLoss.postings, [
    { account: "user", amount: 800 },
    { account: "reserve", amount: -800 },
  ]);
  assert.equal(longLoss.postings.reduce((sum, item) => sum + item.amount, 0), 0);

  const wiped = calculateRealizedSettlement({ allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 1 });
  assert.equal(wiped.grossPnlTc, -1000);
  assert.equal(wiped.returnedTc, 0);
  assert.deepEqual(wiped.postings, []);
});

test("close fee is separately posted and total realized P&L includes both trade fees", () => {
  const result = calculateRealizedSettlement({
    allocationTc: 1000, side: "long", entryPriceMicros: 100000000, exitPriceMicros: 110000000,
    openFeeTc: 1, closeFeeTc: 1,
  });
  assert.equal(result.returnedTc, 1099);
  assert.equal(result.realizedPnlTc, 98);
  assert.deepEqual(result.postings, [
    { account: "user", amount: 1099 },
    { account: "reserve", amount: -1100 },
    { account: "fees", amount: 1 },
  ]);
  assert.equal(result.postings.reduce((sum, item) => sum + item.amount, 0), 0);
});

test("flat exit returns allocation without creating gross P&L", () => {
  const result = calculateRealizedSettlement({ allocationTc: 12, side: "short", entryPriceMicros: 123456, exitPriceMicros: 123456 });
  assert.equal(result.grossPnlTc, 0);
  assert.equal(result.returnedTc, 12);
  assert.equal(result.postings.length, 2);
});

test("execution cost and taker fee assumptions are deterministic and adverse", () => {
  assert.equal(calculateSimulatedFillPrice({ quotePriceMicros: 100000000, action: "buy" }), 100130000);
  assert.equal(calculateSimulatedFillPrice({ quotePriceMicros: 100000000, action: "sell" }), 99870000);
  assert.equal(calculateTakerFeeTc(1000), 1);
  assert.equal(calculateTakerFeeTc(20000), 10);
  assert.equal(calculateTakerFeeTc(0), 0);
  assert.equal(MAX_OPEN_POSITIONS, 5);
  assert.equal(MAX_POSITION_EQUITY_BPS, 2500);
  assert.equal(MAX_TOTAL_EXPOSURE_EQUITY_BPS, 7500);
});

test("settlement rejects invalid allocation, side, prices and fees", () => {
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 0, side: "long", entryPriceMicros: 1, exitPriceMicros: 1 }));
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 1, side: "sideways", entryPriceMicros: 1, exitPriceMicros: 1 }));
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 1, side: "long", entryPriceMicros: 0, exitPriceMicros: 1 }));
  assert.throws(() => calculateRealizedSettlement({ allocationTc: 1, side: "long", entryPriceMicros: 1, exitPriceMicros: 1, openFeeTc: -1 }));
});

test("server only accepts valid quotes inside the age window", () => {
  const now = 1_800_000_000_000;
  const quote = { validation_status: "valid", price_micros: 1200000, provider_timestamp_ms: now - 30000 };
  assert.equal(isFreshValidatedQuote(quote, now), true);
  assert.equal(isFreshValidatedQuote({ ...quote, provider_timestamp_ms: now - 90001 }, now), false);
  assert.equal(isFreshValidatedQuote({ ...quote, validation_status: "stale" }, now), false);
  assert.equal(isFreshValidatedQuote({ ...quote, price_micros: 0 }, now), false);
});
