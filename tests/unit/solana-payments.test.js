import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CREDIT_PACKAGES,
  SOLANA_USDC_MINT,
  encodeBase58,
  decodeBase58,
  makeSolanaPayUrl,
  validateUsdcPaymentTransaction,
} from "../../worker/solana-payments.js";

test("base58 address encoding preserves 32-byte Solana public keys", () => {
  const zeroKey = new Uint8Array(32);
  const encoded = encodeBase58(zeroKey);
  assert.equal(encoded, "11111111111111111111111111111111");
  assert.equal(decodeBase58(encoded).length, 32);
  assert.throws(() => decodeBase58("not-an-address-0OIl"), /Invalid Solana address|Invalid base58/);
});

test("payment URL pins the official USDC mint, exact amount, recipient, and unique reference", () => {
  const recipient = "11111111111111111111111111111111";
  const reference = "11111111111111111111111111111111";
  const url = makeSolanaPayUrl({ recipient, reference, amountAtoms: 5_000_000, message: "70 AI Credits" });
  assert.ok(url.startsWith(`solana:${recipient}?`));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("amount"), "5");
  assert.equal(params.get("spl-token"), SOLANA_USDC_MINT);
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

function makeTransaction({ reference, recipient, amount = "5000000", mint = SOLANA_USDC_MINT, err = null }) {
  return {
    transaction: { message: { accountKeys: [{ pubkey: reference }] } },
    meta: {
      err,
      preTokenBalances: [{
        accountIndex: 1,
        mint,
        owner: recipient,
        uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0, uiAmountString: "0" },
      }],
      postTokenBalances: [{
        accountIndex: 1,
        mint,
        owner: recipient,
        uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: String(Number(amount) / 1e6) },
      }],
    },
  };
}

test("USDC verification requires matching reference, receiving wallet, mint and exact amount", () => {
  const recipient = "ReceiverPublicKey111111111111111111111111";
  const reference = "ReferencePublicKey111111111111111111111111";
  const tx = makeTransaction({ reference, recipient });
  assert.deepEqual(
    validateUsdcPaymentTransaction(tx, { recipient, reference, expectedAmountAtoms: 5_000_000 }),
    { valid: true, receivedAtoms: "5000000" },
  );
  assert.throws(
    () => validateUsdcPaymentTransaction(makeTransaction({ reference: "OtherReference11111111111111111111111111", recipient }), {
      recipient, reference, expectedAmountAtoms: 5_000_000,
    }),
    /REFERENCE_MISMATCH/,
  );
  assert.throws(
    () => validateUsdcPaymentTransaction(makeTransaction({ reference, recipient, mint: "FakeMint111111111111111111111111111111111" }), {
      recipient, reference, expectedAmountAtoms: 5_000_000,
    }),
    /REFERENCE_MISMATCH|Invalid/,
  );
  assert.deepEqual(
    validateUsdcPaymentTransaction(makeTransaction({ reference, recipient, amount: "4990000" }), {
      recipient, reference, expectedAmountAtoms: 5_000_000,
    }),
    { valid: false, receivedAtoms: "4990000", reason: "underpaid" },
  );
  assert.throws(
    () => validateUsdcPaymentTransaction(makeTransaction({ reference, recipient, err: { InstructionError: [0, "Custom"] } }), {
      recipient, reference, expectedAmountAtoms: 5_000_000,
    }),
    /FAILED_OR_MISSING/,
  );
});
