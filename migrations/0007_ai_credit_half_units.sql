-- AC is displayed in whole and half-credit increments (for example, 1.5 AC per successful AI operation).
-- Preserve immutable posted ledger rows by adding a balanced scale-adjustment transaction that doubles
-- every current AC account balance. After this migration, 1 displayed AC = 2 ledger atoms.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO ledger_transactions
  (id, idempotency_key, user_id, event_type, status, metadata_json)
VALUES
  ('migration-ai-ac-half-units-v1', 'migration:ai-ac-half-units-v1', NULL,
   'system.ac_scale_adjustment', 'pending',
   '{"migration":"0007_ai_credit_half_units","display_units_per_atom":0.5}');

INSERT INTO ledger_postings (id, transaction_id, account_key, amount_atoms, currency)
SELECT lower(hex(randomblob(16))), 'migration-ai-ac-half-units-v1', account_key, balance, 'AC'
FROM (
  SELECT a.account_key,
         COALESCE(SUM(CASE WHEN t.status = 'posted' THEN p.amount_atoms ELSE 0 END), 0) AS balance
  FROM ledger_accounts a
  LEFT JOIN ledger_postings p ON p.account_key = a.account_key AND p.currency = 'AC'
  LEFT JOIN ledger_transactions t ON t.id = p.transaction_id
  WHERE a.currency = 'AC'
  GROUP BY a.account_key
)
WHERE balance <> 0;

UPDATE ledger_transactions
SET status = 'posted', posted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'migration-ai-ac-half-units-v1' AND status = 'pending';
