import test from "node:test";
import assert from "node:assert/strict";
import { AI_CREDIT_PACKAGES, encodeBase58, decodeBase58, makeSolanaPayUrl, validateSolPaymentTransaction } from "../../worker/solana-payments.js";

test("base58 address encoding preserves 32-byte Solana public keys", () => {
  const encoded = encodeBase58(new Uint8Array(32));
  assert.equal(encoded, "11111111111111111111111111111111");
  assert.equal(decodeBase58(encoded).length, 32);
  assert.throws(() => decodeBase58("not-an-address-0OIl"), /Invalid Solana address|Invalid base58/);
});

test("payment URL requests native SOL with exact amount, recipient, and reference", () => {
  const recipient = "11111111111111111111111111111111";
  const reference = "11111111111111111111111111111111";
  const url = makeSolanaPayUrl({ recipient, reference, amountLamports: 5_000_000_000, message: "70 AI Credits" });
  assert.ok(url.startsWith(`solana:${recipient}?`));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("amount"), "5");
  assert.equal(params.get("spl-token"), null);
  assert.equal(params.get("reference"), reference);
  assert.equal(params.get("message"), "70 AI Credits");
});

test("server-owned AI Credit packages cannot be repriced by client input", () => {
  assert.deepEqual(AI_CREDIT_PACKAGES.entry_5, { id: "entry_5", usdCents: 500, aiCredits: 70 });
  assert.deepEqual(AI_CREDIT_PACKAGES.popular_25, { id: "popular_25", usdCents: 2500, aiCredits: 350 });
  assert.equal(AI_CREDIT_PACKAGES.max_500.usdCents, 50000);
  assert.equal(AI_CREDIT_PACKAGES.max_500.aiCredits, 7000);
  assert.equal(AI_CREDIT_PACKAGES.not_a_package, undefined);
});

function makeTransaction({ reference, recipient, lamports = 5_000_000_000, err = null }) {
  return {
    transaction: { message: { accountKeys: [{ pubkey: recipient }, { pubkey: reference }] } },
    meta: { err, preBalances: [1000, 0], postBalances: [1000 + lamports, 0] },
  };
}

test("native SOL verification requires matching reference, recipient and exact amount", () => {
  const recipient = "11111111111111111111111111111111";
  const reference = "11111111111111111111111111111111";
  const tx = makeTransaction({ reference, recipient });
  assert.deepEqual(validateSolPaymentTransaction(tx, { recipient, reference, expectedLamports: 5_000_000_000 }), { valid: true, receivedLamports: 5_000_000_000 });
  assert.throws(() => validateSolPaymentTransaction(makeTransaction({ reference: "OtherReference11111111111111111111111111", recipient }), {
    recipient, reference, expectedLamports: 5_000_000_000,
  }), /REFERENCE_MISMATCH/);
  assert.deepEqual(validateSolPaymentTransaction(makeTransaction({ reference, recipient, lamports: 4_990_000_000 }), {
    recipient, reference, expectedLamports: 5_000_000_000,
  }), { valid: false, receivedLamports: 4_990_000_000, reason: "underpaid" });
  assert.deepEqual(validateSolPaymentTransaction(makeTransaction({ reference, recipient, lamports: 5_010_000_000 }), {
    recipient, reference, expectedLamports: 5_000_000_000,
  }), { valid: false, receivedLamports: 5_010_000_000, reason: "overpaid" });
  assert.throws(() => validateSolPaymentTransaction(makeTransaction({ reference, recipient, err: { InstructionError: [0, "Custom"] } }), {
    recipient, reference, expectedLamports: 5_000_000_000,
  }), /FAILED_OR_MISSING/);
});
