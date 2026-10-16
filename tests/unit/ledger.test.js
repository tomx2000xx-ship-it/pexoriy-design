import test from "node:test";
import assert from "node:assert/strict";
import { postLedgerTransaction, validateLedgerPostings } from "../../worker/ledger.js";

test("ledger postings must balance independently for every currency", () => {
  assert.equal(validateLedgerPostings([
    { accountKey: "user:u1:TC", currency: "TC", amountAtoms: 100 },
    { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -100 },
    { accountKey: "user:u1:AC", currency: "AC", amountAtoms: 5 },
    { accountKey: "system:issuance:AC", currency: "AC", amountAtoms: -5 },
  ]), true);

  assert.throws(() => validateLedgerPostings([
    { accountKey: "user:u1:TC", currency: "TC", amountAtoms: 100 },
    { accountKey: "system:issuance:TC", currency: "TC", amountAtoms: -99 },
  ]), /balance to zero/);
});

test("ledger rejects zero, unsafe, and unsupported amounts", () => {
  assert.throws(() => validateLedgerPostings([
    { accountKey: "a", currency: "TC", amountAtoms: 0 },
    { accountKey: "b", currency: "TC", amountAtoms: 0 },
  ]), /non-zero safe integers/);
  assert.throws(() => validateLedgerPostings([
    { accountKey: "a", currency: "USDT", amountAtoms: 1 },
    { accountKey: "b", currency: "USDT", amountAtoms: -1 },
  ]), /Unsupported ledger currency/);
  assert.throws(() => validateLedgerPostings([
    { accountKey: "a", currency: "TC", amountAtoms: Number.MAX_SAFE_INTEGER },
    { accountKey: "b", currency: "TC", amountAtoms: -Number.MAX_SAFE_INTEGER + 1 },
  ]), /balance to zero/);
});

function makeFakeD1() {
  const transactions = new Map();
  const postings = [];
  const makeStatement = (sql, args) => ({ sql, args, first: async () => {
    if (sql.includes("SELECT id, status FROM ledger_transactions WHERE idempotency_key")) {
      const tx = transactions.get(args[0]);
      return tx ? { id: tx.id, status: tx.status } : null;
    }
    return null;
  }});
  return {
    transactions,
    postings,
    prepare(sql) {
      return { bind: (...args) => makeStatement(sql, args) };
    },
    async batch(statements) {
      const txCopy = new Map(transactions);
      const postingCopy = [...postings];
      try {
        for (const statement of statements) {
          const { sql, args } = statement;
          if (sql.startsWith("INSERT INTO ledger_transactions")) {
            const [id, key, userId, eventType, status, metadata] = args;
            if (txCopy.has(key)) throw new Error("UNIQUE constraint failed: ledger_transactions.idempotency_key");
            txCopy.set(key, { id, userId, eventType, status, metadata });
          } else if (sql.startsWith("INSERT INTO ledger_postings")) {
            const [postingId, transactionId, accountKey, amountAtoms, currency] = args;
            postingCopy.push({ id: postingId, transactionId, accountKey, amountAtoms, currency });
          } else if (sql.startsWith("UPDATE ledger_transactions SET status")) {
            const tx = [...txCopy.values()].find((item) => item.id === args[0]);
            if (!tx || tx.status !== "pending") throw new Error("missing pending transaction");
            const current = postingCopy.filter((posting) => posting.transactionId === tx.id);
            const totals = new Map();
            for (const posting of current) totals.set(posting.currency, (totals.get(posting.currency) || 0) + posting.amountAtoms);
            if (current.length < 2 || [...totals.values()].some((value) => value !== 0)) throw new Error("unbalanced_ledger_transaction");
            tx.status = "posted";
          }
        }
        transactions.clear();
        for (const [key, value] of txCopy) transactions.set(key, value);
        postings.splice(0, postings.length, ...postingCopy);
      } catch (error) {
        throw error;
      }
    },
  };
}

const baseInput = {
  id: "txn-one",
  idempotencyKey: "trade-open-0001",
  userId: "user-one",
  eventType: "practice.trade_opened",
  postings: [
    { accountKey: "user:user-one:TC", currency: "TC", amountAtoms: -25 },
    { accountKey: "system:reserve:TC", currency: "TC", amountAtoms: 25 },
  ],
};

test("ledger posting commits once and returns the same transaction on retry", async () => {
  const db = makeFakeD1();
  const first = await postLedgerTransaction(db, baseInput);
  const retry = await postLedgerTransaction(db, { ...baseInput, id: "txn-retry-different" });
  assert.deepEqual(first, { transactionId: "txn-one", duplicate: false });
  assert.deepEqual(retry, { transactionId: "txn-one", duplicate: true });
  assert.equal(db.transactions.size, 1);
  assert.equal(db.postings.length, 2);
});

test("simultaneous duplicate requests do not create duplicate ledger movements", async () => {
  const db = makeFakeD1();
  const results = await Promise.all([
    postLedgerTransaction(db, baseInput),
    postLedgerTransaction(db, { ...baseInput, id: "txn-race-two" }),
  ]);
  assert.equal(results.filter((result) => result.duplicate === false).length, 1);
  assert.equal(results.filter((result) => result.duplicate === true).length, 1);
  assert.equal(db.transactions.size, 1);
  assert.equal(db.postings.length, 2);
});

test("invalid unbalanced input is rejected before any database write", async () => {
  const db = makeFakeD1();
  await assert.rejects(postLedgerTransaction(db, {
    ...baseInput,
    postings: [
      { accountKey: "user:user-one:TC", currency: "TC", amountAtoms: -25 },
      { accountKey: "system:reserve:TC", currency: "TC", amountAtoms: 24 },
    ],
  }), /balance to zero/);
  assert.equal(db.transactions.size, 0);
  assert.equal(db.postings.length, 0);
});
