PRAGMA foreign_keys = ON;

-- A check-in is persisted only after its balanced TC reward is posted to the ledger.
CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  checkin_date TEXT NOT NULL CHECK (length(checkin_date) = 10),
  streak_days INTEGER NOT NULL CHECK (streak_days > 0),
  reward_tc INTEGER NOT NULL CHECK (reward_tc = 50),
  ledger_transaction_id TEXT NOT NULL UNIQUE REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, checkin_date DESC);

CREATE TRIGGER IF NOT EXISTS trg_daily_checkin_requires_posted_ledger
BEFORE INSERT ON daily_checkins
WHEN (SELECT status FROM ledger_transactions WHERE id = NEW.ledger_transaction_id) IS NOT 'posted'
BEGIN
  SELECT RAISE(ABORT, 'daily_checkin_requires_posted_ledger');
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_checkin_immutable_update
BEFORE UPDATE ON daily_checkins
BEGIN
  SELECT RAISE(ABORT, 'daily_checkin_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_checkin_immutable_delete
BEFORE DELETE ON daily_checkins
BEGIN
  SELECT RAISE(ABORT, 'daily_checkin_is_immutable');
END;
