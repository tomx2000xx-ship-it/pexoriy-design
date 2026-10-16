PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('idle','active','paused','stopped')),
  risk_profile TEXT NOT NULL DEFAULT 'Balanced' CHECK (risk_profile IN ('Cautious','Balanced','Aggressive')),
  market_symbol TEXT NOT NULL DEFAULT 'BTC/USDT',
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_state ON ai_sessions(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_trade_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  operation_id TEXT NOT NULL UNIQUE REFERENCES ai_operations(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  risk_profile TEXT NOT NULL CHECK (risk_profile IN ('Cautious','Balanced','Aggressive')),
  quote_price_micros INTEGER NOT NULL CHECK (quote_price_micros > 0),
  quote_timestamp_ms INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence_bps INTEGER NOT NULL CHECK (confidence_bps BETWEEN 0 AND 10000),
  status TEXT NOT NULL CHECK (status IN ('pending','executing','executed','cancelled','expired','review','failed')),
  expires_at TEXT NOT NULL,
  trade_order_id TEXT REFERENCES trade_orders(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_user_status ON ai_trade_proposals(user_id, status, created_at DESC);
