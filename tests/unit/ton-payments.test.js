import test from "node:test";
import assert from "node:assert/strict";
import {
  TON_NETWORK, TON_RECEIVE_ADDRESS, NANO_TON, normalizeTonAddress, formatNanoTon,
  makeTonComment, validateTonIncomingTransaction,
} from "../../worker/ton-payments.js";

const orderId = "7f5e4c3b-2a19-4d8e-9f01-123456789abc";
const reference = "PEXORIY:" + orderId;
const createdAt = "2026-10-16T10:00:00.000Z";

test("native GRAM payment uses TON mainnet and validates the supplied wallet address", () => {
  assert.equal(TON_NETWORK, "ton-mainnet");
  assert.equal(normalizeTonAddress(TON_RECEIVE_ADDRESS), "0:ce34a5d2edca397e2c4ee850e789c1c471d0ad05117f6ab170d1d82f1728e042");
  assert.equal(normalizeTonAddress("0:CE34A5D2EDCA397E2C4EE850E789C1C471D0AD05117F6AB170D1D82F1728E042"), normalizeTonAddress(TON_RECEIVE_ADDRESS));
  assert.throws(() => normalizeTonAddress(TON_RECEIVE_ADDRESS.slice(0, -1) + "X"), /checksum|length/i);
});

test("native GRAM amounts are formatted from nanoTON without floating-point guessing", () => {
  assert.equal(formatNanoTon(1_250_000_000), "1.25");
  assert.equal(formatNanoTon(NANO_TON), "1");
  assert.throws(() => formatNanoTon(0), /Invalid nanoTON/);
  assert.throws(() => formatNanoTon(Number.MAX_SAFE_INTEGER + 1), /Invalid nanoTON/);
});

test("payment references are order-bound comments, not client-controlled prices", () => {
  assert.equal(makeTonComment(reference), reference);
  assert.throws(() => makeTonComment("PAY ME"), /Invalid payment reference/);
});

function transaction({ value = 1_250_000_000, destination = TON_RECEIVE_ADDRESS, message = reference, utime = 1792144800, aborted = false } = {}) {
  return {
    utime,
    description: { aborted },
    transaction_id: { hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    in_msg: { destination, value: String(value), message },
  };
}

test("verifies the incoming native transfer recipient, order comment, time, and exact amount", () => {
  const result = validateTonIncomingTransaction(transaction(), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  });
  assert.equal(result.valid, true);
  assert.equal(result.receivedNanoTon, 1_250_000_000);
  assert.equal(result.hash, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
});

test("underpayment and overpayment are review states and never treated as successful", () => {
  const under = validateTonIncomingTransaction(transaction({ value: 1_000_000_000 }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  });
  const over = validateTonIncomingTransaction(transaction({ value: 1_500_000_000 }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  });
  assert.equal(under.valid, false);
  assert.equal(under.reason, "underpaid");
  assert.equal(over.valid, false);
  assert.equal(over.reason, "overpaid");
});

test("rejects wrong recipient, wrong comment, aborted and pre-order transactions", () => {
  assert.throws(() => validateTonIncomingTransaction(transaction({ destination: "0:" + "1".repeat(64) }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  }), /TON_RECIPIENT_MISMATCH/);
  assert.throws(() => validateTonIncomingTransaction(transaction({ message: "PEXORIY:other-order" }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  }), /TON_REFERENCE_MISMATCH/);
  assert.throws(() => validateTonIncomingTransaction(transaction({ aborted: true }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  }), /TON_TRANSACTION_FAILED/);
  assert.throws(() => validateTonIncomingTransaction(transaction({ utime: 1792140000 }), {
    recipient: TON_RECEIVE_ADDRESS, reference, expectedNanoTon: 1_250_000_000, createdAt,
  }), /TON_TRANSACTION_PRECEDES_ORDER/);
});
