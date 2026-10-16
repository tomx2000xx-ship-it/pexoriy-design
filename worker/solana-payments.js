export const SOLANA_NETWORK = "solana-mainnet";

export const AI_CREDIT_PACKAGES = Object.freeze({
  entry_5: Object.freeze({ id: "entry_5", usdCents: 500, aiCredits: 70 }),
  starter_10: Object.freeze({ id: "starter_10", usdCents: 1000, aiCredits: 140 }),
  popular_25: Object.freeze({ id: "popular_25", usdCents: 2500, aiCredits: 350 }),
  pro_50: Object.freeze({ id: "pro_50", usdCents: 5000, aiCredits: 700 }),
  max_100: Object.freeze({ id: "max_100", usdCents: 10000, aiCredits: 1400 }),
  max_250: Object.freeze({ id: "max_250", usdCents: 25000, aiCredits: 3500 }),
  max_500: Object.freeze({ id: "max_500", usdCents: 50000, aiCredits: 7000 }),
});

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes) {
  const input = Array.from(bytes);
  let zeros = 0;
  while (zeros < input.length && input[zeros] === 0) zeros += 1;
  const digits = [];
  for (let i = zeros; i < input.length; i += 1) {
    let carry = input[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

export function decodeBase58(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) {
    throw new TypeError("Invalid Solana address length.");
  }
  const bytes = [];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new TypeError("Invalid base58 character.");
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros += 1;
  const decoded = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) decoded[zeros + i] = bytes[bytes.length - 1 - i];
  if (decoded.length !== 32) throw new TypeError("Solana address must decode to 32 bytes.");
  return decoded;
}

export function formatLamports(lamports) {
  if (!Number.isSafeInteger(lamports) || lamports <= 0) throw new TypeError("Invalid SOL amount.");
  return (lamports / 1_000_000_000).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

export function makeSolanaPayUrl({ recipient, amountLamports, reference, label = "Pexoriy", message = "AI Credits" }) {
  decodeBase58(recipient);
  decodeBase58(reference);
  const amount = formatLamports(amountLamports);
  const params = new URLSearchParams({ amount, reference, label, message });
  return `solana:${recipient}?${params.toString()}`;
}

export function validateSolPaymentTransaction(tx, { recipient, reference, expectedLamports }) {
  if (!tx || !tx.transaction || !tx.meta || tx.meta.err !== null) {
    throw new Error("SOLANA_TRANSACTION_FAILED_OR_MISSING");
  }
  const message = tx.transaction.message;
  const keys = (message?.accountKeys || []).map((key) => typeof key === "string" ? key : key.pubkey);
  if (!keys.includes(reference)) throw new Error("SOLANA_REFERENCE_MISMATCH");
  const recipientIndex = keys.indexOf(recipient);
  if (recipientIndex < 0) throw new Error("SOLANA_RECIPIENT_MISMATCH");
  const before = Number(tx.meta.preBalances?.[recipientIndex]);
  const after = Number(tx.meta.postBalances?.[recipientIndex]);
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after < before) {
    throw new Error("SOLANA_BALANCE_DELTA_INVALID");
  }
  const receivedLamports = after - before;
  if (receivedLamports !== expectedLamports) {
    return {
      valid: false,
      receivedLamports,
      reason: receivedLamports < expectedLamports ? "underpaid" : "overpaid",
    };
  }
  return { valid: true, receivedLamports };
}
