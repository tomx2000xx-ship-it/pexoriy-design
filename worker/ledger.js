const ALLOWED_CURRENCIES = new Set(["TC", "AC", "PXY", "GRAM", "USD_EQ"]);

export function validateLedgerPostings(postings) {
  if (!Array.isArray(postings) || postings.length < 2) {
    throw new TypeError("A ledger transaction requires at least two postings.");
  }

  const totals = new Map();
  for (const posting of postings) {
    if (!posting || typeof posting.accountKey !== "string" || !posting.accountKey.trim()) {
      throw new TypeError("Every ledger posting requires an account key.");
    }
    if (!ALLOWED_CURRENCIES.has(posting.currency)) {
      throw new TypeError("Unsupported ledger currency.");
    }
    if (!Number.isSafeInteger(posting.amountAtoms) || posting.amountAtoms === 0) {
      throw new TypeError("Ledger amounts must be non-zero safe integers.");
    }
    totals.set(posting.currency, (totals.get(posting.currency) || 0) + posting.amountAtoms);
  }

  for (const [currency, total] of totals) {
    if (!Number.isSafeInteger(total) || total !== 0) {
      throw new TypeError(`Ledger postings must balance to zero for ${currency}.`);
    }
  }
  return true;
}

/**
 * Writes one balanced ledger transaction through a D1 batch.
 * A unique idempotency key plus the database's posting trigger protects retries
 * and prevents user balances from becoming negative during concurrent requests.
 */
export async function postLedgerTransaction(db, input) {
  const {
    id,
    idempotencyKey,
    userId = null,
    eventType,
    metadata = {},
    postings,
  } = input || {};

  if (typeof id !== "string" || !id || id.length > 100) throw new TypeError("A transaction id is required.");
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new TypeError("An idempotency key between 8 and 200 characters is required.");
  }
  if (typeof eventType !== "string" || !/^[a-z][a-z0-9._-]{1,79}$/.test(eventType)) {
    throw new TypeError("A valid event type is required.");
  }
  validateLedgerPostings(postings);

  const existing = await db.prepare(
    "SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?",
  ).bind(idempotencyKey).first();
  if (existing) {
    if (existing.status === "posted") return { transactionId: existing.id, duplicate: true };
    throw new Error("IDEMPOTENCY_IN_PROGRESS");
  }

  const statements = [
    db.prepare(
      "INSERT INTO ledger_transactions (id, idempotency_key, user_id, event_type, status, metadata_json) VALUES (?, ?, ?, ?, 'pending', ?)",
    ).bind(id, idempotencyKey, userId, eventType, JSON.stringify(metadata)),
    ...postings.map((posting) => db.prepare(
      "INSERT INTO ledger_postings (id, transaction_id, account_key, amount_atoms, currency) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), id, posting.accountKey, posting.amountAtoms, posting.currency)),
    db.prepare(
      "UPDATE ledger_transactions SET status = 'posted', posted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'",
    ).bind(id),
  ];

  try {
    await db.batch(statements);
    return { transactionId: id, duplicate: false };
  } catch (error) {
    // A concurrent retry may have won the unique-key race. Return its committed result.
    const winner = await db.prepare(
      "SELECT id, status FROM ledger_transactions WHERE idempotency_key = ?",
    ).bind(idempotencyKey).first();
    if (winner?.status === "posted") return { transactionId: winner.id, duplicate: true };
    throw error;
  }
}

export async function getLedgerBalance(db, accountKey) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(p.amount_atoms), 0) AS balance
     FROM ledger_postings p
     JOIN ledger_transactions t ON t.id = p.transaction_id
     WHERE p.account_key = ? AND t.status = 'posted'`,
  ).bind(accountKey).first();
  return Number(row?.balance || 0);
}
