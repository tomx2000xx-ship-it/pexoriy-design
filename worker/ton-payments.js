export const TON_NETWORK = "ton-mainnet";
export const NANO_TON = 1_000_000_000;
export const TON_RECEIVE_ADDRESS = "UQDONKXS7co5fixO6FDnicHEcdCtBRF_arFw0dgvFyjgQqoW";

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function crc16Xmodem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
export function normalizeTonAddress(value) {
  if (typeof value !== "string") throw new TypeError("Invalid TON address.");
  const input = value.trim();
  const raw = /^(-?\d+):([0-9a-f]{64})$/i.exec(input);
  if (raw) return String(Number(raw[1])) + ":" + raw[2].toLowerCase();
  const bytes = decodeBase64Url(input);
  if (bytes.length !== 36) throw new TypeError("Invalid TON friendly address length.");
  const tag = bytes[0] & 0x7f;
  if (tag !== 0x11 && tag !== 0x51) throw new TypeError("Unsupported TON address tag.");
  const expected = crc16Xmodem(bytes.slice(0, 34));
  if (bytes[34] !== (expected >> 8) || bytes[35] !== (expected & 0xff)) throw new TypeError("Invalid TON address checksum.");
  const workchain = bytes[1] > 127 ? bytes[1] - 256 : bytes[1];
  const account = Array.from(bytes.slice(2, 34), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return workchain + ":" + account;
}
export function formatNanoTon(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("Invalid nanoTON amount.");
  return (value / NANO_TON).toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}
export function makeTonComment(reference) {
  if (typeof reference !== "string" || !/^PEXORIY:[0-9a-f-]{36}$/i.test(reference)) throw new TypeError("Invalid payment reference.");
  return reference;
}
export function validateTonIncomingTransaction(transaction, { recipient, reference, expectedNanoTon, createdAt }) {
  const incoming = transaction?.in_msg;
  if (!incoming || transaction?.description?.aborted === true || transaction?.aborted === true) throw new Error("TON_TRANSACTION_FAILED_OR_MISSING");
  let actualRecipient;
  try { actualRecipient = normalizeTonAddress(incoming.destination); } catch { throw new Error("TON_RECIPIENT_INVALID"); }
  if (actualRecipient !== normalizeTonAddress(recipient)) throw new Error("TON_RECIPIENT_MISMATCH");
  const message = typeof incoming.message === "string" ? incoming.message : "";
  const textBody = typeof incoming.msg_data?.text === "string" ? incoming.msg_data.text : "";
  const comment = message || textBody;
  if (comment !== reference) throw new Error("TON_REFERENCE_MISMATCH");
  const transactionTime = Number(transaction.utime);
  if (!Number.isFinite(transactionTime) || transactionTime < Math.floor(Date.parse(createdAt) / 1000)) throw new Error("TON_TRANSACTION_PRECEDES_ORDER");
  const receivedNanoTon = Number(incoming.value);
  if (!Number.isSafeInteger(receivedNanoTon) || receivedNanoTon <= 0) throw new Error("TON_AMOUNT_INVALID");
  const hash = transaction.transaction_id?.hash;
  if (typeof hash !== "string" || hash.length < 20) throw new Error("TON_TRANSACTION_HASH_MISSING");
  if (receivedNanoTon !== expectedNanoTon) {
    return { valid: false, receivedNanoTon, reason: receivedNanoTon < expectedNanoTon ? "underpaid" : "overpaid", hash, transactionTime };
  }
  return { valid: true, receivedNanoTon, hash, transactionTime };
}
