-- Native SOL checkout metadata on Solana. Prices and credit amounts are enforced by the Worker.
ALTER TABLE payment_orders ADD COLUMN reference_key TEXT;
ALTER TABLE payment_orders ADD COLUMN token_mint TEXT;
ALTER TABLE payment_orders ADD COLUMN package_id TEXT;
ALTER TABLE payment_orders ADD COLUMN credited_ac INTEGER NOT NULL DEFAULT 0 CHECK (credited_ac >= 0);
ALTER TABLE payment_orders ADD COLUMN expires_at TEXT;
ALTER TABLE payment_orders ADD COLUMN confirmed_slot INTEGER;
ALTER TABLE payment_orders ADD COLUMN chain_finality TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_reference_key ON payment_orders(reference_key) WHERE reference_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_network_status ON payment_orders(network, status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_payment_credit_requires_verified_state
BEFORE UPDATE OF status ON payment_orders
WHEN NEW.status = 'credited' AND OLD.status <> 'credited'
BEGIN
  SELECT CASE WHEN NEW.tx_hash IS NULL OR NEW.confirmed_at IS NULL OR NEW.chain_finality <> 'finalized'
    THEN RAISE(ABORT, 'payment_must_be_finalized_before_credit') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_credited_payment_immutable
BEFORE UPDATE ON payment_orders
WHEN OLD.status = 'credited'
BEGIN SELECT RAISE(ABORT, 'credited_payment_immutable'); END;
