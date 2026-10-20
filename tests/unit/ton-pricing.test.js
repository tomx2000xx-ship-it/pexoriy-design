import test from "node:test";
import assert from "node:assert/strict";
import { calculateNanoGramFromUsdCents } from "../../worker/ton-payments.js";

test("calculates the native GRAM amount from the USD tier and current quote", () => {
  assert.equal(calculateNanoGramFromUsdCents(500, 1.25), 4_000_000_000);
  assert.equal(calculateNanoGramFromUsdCents(1000, 1.25), 8_000_000_000);
});

test("uses integer nanoGRAM and rounds to the nearest atomic unit", () => {
  assert.equal(calculateNanoGramFromUsdCents(500, 1.35), 3_703_703_704);
});

test("rejects invalid USD pack prices", () => {
  assert.throws(() => calculateNanoGramFromUsdCents(0, 1.25), /Invalid USD pack price/);
  assert.throws(() => calculateNanoGramFromUsdCents(-100, 1.25), /Invalid USD pack price/);
  assert.throws(() => calculateNanoGramFromUsdCents(500.5, 1.25), /Invalid USD pack price/);
});

test("rejects missing or invalid GRAM/USD quotes", () => {
  assert.throws(() => calculateNanoGramFromUsdCents(500, 0), /Invalid GRAM\/USD quote/);
  assert.throws(() => calculateNanoGramFromUsdCents(500, Number.NaN), /Invalid GRAM\/USD quote/);
});
