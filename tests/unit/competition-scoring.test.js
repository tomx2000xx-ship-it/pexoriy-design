import test from "node:test";
import assert from "node:assert/strict";
import { calculateMaxDrawdownBps, calculateReturnBps, calculateRiskAdjustedScore } from "../../worker/competition-scoring.js";

test("return is measured against frozen starting equity in basis points", () => {
  assert.equal(calculateReturnBps(1100, 1000), 1000);
  assert.equal(calculateReturnBps(900, 1000), -1000);
  assert.equal(calculateReturnBps(100, 0), 0);
});

test("maximum drawdown retains the worst observed drawdown", () => {
  assert.equal(calculateMaxDrawdownBps(1000, 900, 0), 1000);
  assert.equal(calculateMaxDrawdownBps(1000, 950, 1200), 1200);
  assert.equal(calculateMaxDrawdownBps(1000, 1100, 300), 300);
  assert.equal(calculateMaxDrawdownBps(0, 10, 0), 10000);
});

test("drawdown reduces the score even when return is unchanged", () => {
  const lowRisk = calculateRiskAdjustedScore({ returnBps: 1000, maxDrawdownBps: 100 });
  const highRisk = calculateRiskAdjustedScore({ returnBps: 1000, maxDrawdownBps: 800 });
  assert.equal(lowRisk, 925);
  assert.equal(highRisk, 400);
  assert.ok(lowRisk > highRisk);
});

test("verified activity bonuses are bounded", () => {
  assert.equal(calculateRiskAdjustedScore({ returnBps: 0, verifiedTrades: 30, dailyCheckins: 20, completedLessons: 15 }), 320);
});

test("a losing result cannot be rescued by unbounded negative or malformed values", () => {
  assert.equal(calculateRiskAdjustedScore({ returnBps: -500, maxDrawdownBps: 1000 }), 0);
  assert.equal(calculateRiskAdjustedScore({ returnBps: 0, maxDrawdownBps: 0, verifiedTrades: -100, dailyCheckins: NaN, completedLessons: Infinity }), 0);
});
