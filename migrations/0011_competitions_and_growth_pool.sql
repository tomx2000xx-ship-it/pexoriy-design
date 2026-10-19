PRAGMA foreign_keys = ON;

-- Shared competition rounds use the published 5,000 / 12,000 / 25,000 PXY prize tiers.
CREATE TABLE IF NOT EXISTS competition_rounds (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL CHECK (slug IN ('daily-sprint','consistency-league','community-challenge')),
  title TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  prize_pool_pxy INTEGER NOT NULL CHECK (prize_pool_pxy IN (5000,12000,25000)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(slug, period_start),
  CHECK (period_end > period_start)
);

CREATE TABLE IF NOT EXISTS competition_participants (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES competition_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  score_points INTEGER NOT NULL DEFAULT 0 CHECK (score_points >= 0),
  verified_trades INTEGER NOT NULL DEFAULT 0 CHECK (verified_trades >= 0),
  completed_lessons INTEGER NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
  daily_checkins INTEGER NOT NULL DEFAULT 0 CHECK (daily_checkins >= 0),
  last_scored_at TEXT,
  UNIQUE(round_id, user_id)
);

CREATE TABLE IF NOT EXISTS competition_awards (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES competition_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rank INTEGER NOT NULL CHECK (rank > 0),
  prize_pxy INTEGER NOT NULL CHECK (prize_pxy >= 0),
  status TEXT NOT NULL DEFAULT 'gated' CHECK (status IN ('gated','approved','paid','cancelled')),
  ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(round_id, user_id),
  UNIQUE(round_id, rank),
  CHECK (status <> 'paid' OR ledger_transaction_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS referral_pool_rounds (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL UNIQUE,
  period_end TEXT NOT NULL,
  pool_tc INTEGER NOT NULL DEFAULT 10000 CHECK (pool_tc = 10000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','finalized')),
  total_activations INTEGER NOT NULL DEFAULT 0 CHECK (total_activations >= 0),
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (period_end > period_start),
  CHECK (status <> 'finalized' OR finalized_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS referral_pool_awards (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES referral_pool_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  verified_activations INTEGER NOT NULL CHECK (verified_activations > 0),
  reward_tc INTEGER NOT NULL CHECK (reward_tc >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','paid')),
  ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(round_id, user_id),
  CHECK ((status = 'available' AND ledger_transaction_id IS NULL AND claimed_at IS NULL)
      OR (status = 'paid' AND ledger_transaction_id IS NOT NULL AND claimed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS pxy_issuance_controls (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reserves_verified INTEGER NOT NULL DEFAULT 0 CHECK (reserves_verified IN (0,1)),
  launch_approved INTEGER NOT NULL DEFAULT 0 CHECK (launch_approved IN (0,1)),
  issuance_enabled INTEGER NOT NULL DEFAULT 0 CHECK (issuance_enabled IN (0,1)),
  approval_reference TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (issuance_enabled = 0 OR (reserves_verified = 1 AND launch_approved = 1 AND approval_reference IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_competition_participants_rank
  ON competition_participants(round_id, score_points DESC, joined_at ASC);
CREATE INDEX IF NOT EXISTS idx_competition_rounds_active
  ON competition_rounds(status, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_referral_pool_awards_user
  ON referral_pool_awards(user_id, status, created_at DESC);

-- PXY issuance remains explicitly disabled until reserves and launch approval are verified.
INSERT OR IGNORE INTO pxy_issuance_controls (id) VALUES (1);
