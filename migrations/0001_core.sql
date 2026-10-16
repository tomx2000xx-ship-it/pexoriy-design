-- Pexoriy durable backend foundation.
-- All virtual balances are derived from immutable, balanced ledger postings.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  account_key TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('TC','AC','PXY','GRAM','USD_EQ')),
  account_type TEXT NOT NULL CHECK (account_type IN ('user','reserve','fees','issuance','payments','clearing','expense')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger_accounts(owner_user_id, currency);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','rejected')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  posted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_user ON ledger_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ledger_postings (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  account_key TEXT NOT NULL REFERENCES ledger_accounts(account_key),
  amount_atoms INTEGER NOT NULL CHECK (amount_atoms <> 0),
  currency TEXT NOT NULL CHECK (currency IN ('TC','AC','PXY','GRAM','USD_EQ')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_transaction ON ledger_postings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_account ON ledger_postings(account_key, created_at);

-- A transaction can be posted only when each currency balances to zero.
CREATE TRIGGER IF NOT EXISTS trg_ledger_balance_before_post
BEFORE UPDATE OF status ON ledger_transactions
WHEN OLD.status = 'pending' AND NEW.status = 'posted'
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM ledger_postings WHERE transaction_id = NEW.id) < 2
    THEN RAISE(ABORT, 'ledger_transaction_requires_two_postings') END;
  SELECT CASE WHEN EXISTS (
    SELECT currency FROM ledger_postings
    WHERE transaction_id = NEW.id
    GROUP BY currency HAVING SUM(amount_atoms) <> 0
  ) THEN RAISE(ABORT, 'unbalanced_ledger_transaction') END;
  SELECT CASE WHEN (SELECT COUNT(DISTINCT currency) FROM ledger_postings WHERE transaction_id = NEW.id)
    <> (SELECT COUNT(*) FROM (SELECT currency FROM ledger_postings WHERE transaction_id = NEW.id GROUP BY currency))
    THEN RAISE(ABORT, 'invalid_ledger_currency') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_posted_transaction_immutable
BEFORE UPDATE ON ledger_transactions
WHEN OLD.status = 'posted'
BEGIN SELECT RAISE(ABORT, 'posted_ledger_transaction_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_posted_transaction_no_delete
BEFORE DELETE ON ledger_transactions
WHEN OLD.status = 'posted'
BEGIN SELECT RAISE(ABORT, 'posted_ledger_transaction_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_posted_posting_no_update
BEFORE UPDATE ON ledger_postings
WHEN (SELECT status FROM ledger_transactions WHERE id = OLD.transaction_id) = 'posted'
BEGIN SELECT RAISE(ABORT, 'posted_ledger_posting_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_posted_posting_no_delete
BEFORE DELETE ON ledger_postings
WHEN (SELECT status FROM ledger_transactions WHERE id = OLD.transaction_id) = 'posted'
BEGIN SELECT RAISE(ABORT, 'posted_ledger_posting_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_posting_only_pending
BEFORE INSERT ON ledger_postings
WHEN (SELECT status FROM ledger_transactions WHERE id = NEW.transaction_id) <> 'pending'
BEGIN SELECT RAISE(ABORT, 'ledger_transaction_not_pending'); END;

CREATE TABLE IF NOT EXISTS trading_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  status TEXT NOT NULL CHECK (status IN ('open','closing','closed','liquidated','review')),
  leverage INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 10),
  quantity_atoms INTEGER NOT NULL CHECK (quantity_atoms > 0),
  entry_price_micros INTEGER NOT NULL CHECK (entry_price_micros > 0),
  mark_price_micros INTEGER NOT NULL CHECK (mark_price_micros > 0),
  reserved_tc INTEGER NOT NULL CHECK (reserved_tc >= 0),
  realized_pnl_tc INTEGER NOT NULL DEFAULT 0,
  open_transaction_id TEXT REFERENCES ledger_transactions(id),
  close_transaction_id TEXT REFERENCES ledger_transactions(id),
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT,
  model_version TEXT NOT NULL DEFAULT 'simulation-v1'
);
CREATE INDEX IF NOT EXISTS idx_positions_user_status ON trading_positions(user_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS trade_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  position_id TEXT REFERENCES trading_positions(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  order_type TEXT NOT NULL CHECK (order_type IN ('market','limit','stop_loss','take_profit')),
  status TEXT NOT NULL CHECK (status IN ('accepted','filled','rejected','cancelled')),
  quantity_atoms INTEGER NOT NULL CHECK (quantity_atoms > 0),
  requested_price_micros INTEGER,
  fill_price_micros INTEGER,
  rejection_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_orders_user ON trade_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price_micros INTEGER NOT NULL CHECK (price_micros > 0),
  provider_timestamp_ms INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid','stale','conflict','rejected')),
  model_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time ON market_snapshots(symbol, provider_timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  expected_amount_atoms INTEGER NOT NULL CHECK (expected_amount_atoms > 0),
  received_amount_atoms INTEGER NOT NULL DEFAULT 0,
  usd_equivalent_micros INTEGER,
  status TEXT NOT NULL CHECK (status IN ('created','pending','underpaid','overpaid','confirmed','credited','failed','reversed','refunded','review')),
  tx_hash TEXT UNIQUE,
  conversion_source TEXT,
  conversion_timestamp TEXT,
  confirmed_at TEXT,
  credited_transaction_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT REFERENCES payment_orders(id),
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received','processed','ignored','failed','review'))
);

CREATE TABLE IF NOT EXISTS ai_operations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  operation_type TEXT NOT NULL,
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits >= 0),
  charged_credits INTEGER NOT NULL DEFAULT 0 CHECK (charged_credits >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved','succeeded','failed','cancelled','refunded')),
  ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS mission_definitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reward_currency TEXT NOT NULL CHECK (reward_currency IN ('TC','AC','PXY')),
  reward_amount INTEGER NOT NULL CHECK (reward_amount >= 0),
  issuance_cap INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  rules_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS mission_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mission_id TEXT NOT NULL REFERENCES mission_definitions(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','paid')),
  ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, mission_id, id)
);
CREATE INDEX IF NOT EXISTS idx_mission_claims_user ON mission_claims(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  prize_pool_pxy INTEGER NOT NULL CHECK (prize_pool_pxy >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','active','review','finalized','cancelled')),
  rules_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS competition_entries (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  starting_equity_tc INTEGER NOT NULL CHECK (starting_equity_tc > 0),
  ending_equity_tc INTEGER,
  return_bps INTEGER,
  max_drawdown_bps INTEGER,
  status TEXT NOT NULL CHECK (status IN ('entered','eligible','under_review','disqualified','finalized','awarded')),
  entered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
