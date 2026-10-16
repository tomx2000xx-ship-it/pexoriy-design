-- Guardrails enforced by D1 itself, so concurrent requests cannot bypass them.
CREATE TRIGGER IF NOT EXISTS trg_posting_currency_matches_account
BEFORE INSERT ON ledger_postings
WHEN (SELECT currency FROM ledger_accounts WHERE account_key = NEW.account_key) <> NEW.currency
BEGIN SELECT RAISE(ABORT, 'ledger_currency_mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_user_posting_ownership
BEFORE INSERT ON ledger_postings
WHEN (SELECT account_type FROM ledger_accounts WHERE account_key = NEW.account_key) = 'user'
 AND (SELECT owner_user_id FROM ledger_accounts WHERE account_key = NEW.account_key)
     <> (SELECT user_id FROM ledger_transactions WHERE id = NEW.transaction_id)
BEGIN SELECT RAISE(ABORT, 'ledger_user_ownership_mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_no_negative_user_balance
BEFORE UPDATE OF status ON ledger_transactions
WHEN OLD.status = 'pending' AND NEW.status = 'posted'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT a.account_key
    FROM ledger_accounts a
    JOIN ledger_postings current_posting
      ON current_posting.account_key = a.account_key
     AND current_posting.transaction_id = NEW.id
    WHERE a.account_type = 'user'
    GROUP BY a.account_key
    HAVING
      COALESCE((
        SELECT SUM(p.amount_atoms)
        FROM ledger_postings p
        JOIN ledger_transactions t ON t.id = p.transaction_id
        WHERE p.account_key = a.account_key AND t.status = 'posted'
      ), 0) + SUM(current_posting.amount_atoms) < 0
  ) THEN RAISE(ABORT, 'insufficient_ledger_balance') END;
END;
