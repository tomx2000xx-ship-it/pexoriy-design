-- Pexoriy payment settlement reconciliation (READ ONLY)
-- Run each SELECT against the intended D1 database using an operator-authorized read-only session.
-- Never treat pending/unconfirmed orders as revenue. These queries do not mutate data.

-- 1. Order counts and value by network/asset/state.
SELECT network, asset, status, COUNT(*) AS orders,
       SUM(expected_amount_atoms) AS expected_atoms,
       SUM(received_amount_atoms) AS received_atoms,
       SUM(credited_ac) AS ai_credits_marked,
       SUM(CASE WHEN tx_hash IS NOT NULL THEN 1 ELSE 0 END) AS orders_with_tx
FROM payment_orders
GROUP BY network, asset, status
ORDER BY network, asset, status;

-- 2. Confirmed payments that may need credit-delivery reconciliation.
-- A confirmed order is not revenue until it is finalized and its credit ledger transaction is posted.
SELECT p.id, p.user_id, p.network, p.asset, p.status, p.tx_hash,
       p.confirmed_at, p.credited_transaction_id, p.credited_ac,
       l.status AS ledger_status, l.idempotency_key
FROM payment_orders p
LEFT JOIN ledger_transactions l ON l.id = p.credited_transaction_id
WHERE p.status = 'confirmed'
   OR (p.status = 'credited' AND (l.id IS NULL OR l.status <> 'posted'))
ORDER BY p.created_at ASC;

-- 3. Credited orders without a posted ledger transaction or payment event.
SELECT p.id, p.user_id, p.network, p.tx_hash, p.credited_ac,
       p.credited_transaction_id, l.status AS ledger_status
FROM payment_orders p
LEFT JOIN ledger_transactions l ON l.id = p.credited_transaction_id
WHERE p.status = 'credited'
  AND (p.credited_transaction_id IS NULL OR l.status <> 'posted');

-- 4. Expired, pending, under/overpaid or review orders requiring operational review.
SELECT id, user_id, network, asset, status, expected_amount_atoms,
       received_amount_atoms, tx_hash, created_at, expires_at
FROM payment_orders
WHERE status IN ('pending', 'underpaid', 'overpaid', 'review', 'reversed', 'refunded')
   OR (status IN ('created', 'pending') AND expires_at IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ORDER BY created_at ASC;

-- 5. Payment events that failed or were explicitly routed for review.
SELECT event_type, processing_status, COUNT(*) AS events
FROM payment_events
WHERE processing_status IN ('failed', 'review')
GROUP BY event_type, processing_status
ORDER BY event_type, processing_status;

-- 6. Duplicate transaction hashes should be impossible due to the UNIQUE constraint.
-- Any returned row indicates schema drift or an imported-data anomaly.
SELECT tx_hash, COUNT(*) AS orders
FROM payment_orders
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;
