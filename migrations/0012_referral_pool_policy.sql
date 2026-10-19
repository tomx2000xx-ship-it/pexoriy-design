PRAGMA foreign_keys = ON;

-- Versioned TC community-pool policy. This is a configuration record, not a
-- payout instruction. Pool awards must still be derived from verified events
-- and posted through the balanced ledger.
CREATE TABLE IF NOT EXISTS referral_pool_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  cycle_days INTEGER NOT NULL CHECK (cycle_days = 7),
  pool_tc INTEGER NOT NULL CHECK (pool_tc BETWEEN 1000 AND 100000),
  max_award_per_user_tc INTEGER NOT NULL CHECK (max_award_per_user_tc BETWEEN 100 AND pool_tc),
  eligible_event TEXT NOT NULL CHECK (eligible_event = 'verified_referral_activation'),
  status TEXT NOT NULL CHECK (status IN ('draft','active','paused')),
  rationale TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (max_award_per_user_tc <= pool_tc)
);

-- Initial policy: 10,000 TC maximum per seven-day cycle, with no PXY issuance.
-- This is a ceiling, not a promise to distribute the entire pool every week.
INSERT OR IGNORE INTO referral_pool_policy
  (id, policy_version, cycle_days, pool_tc, max_award_per_user_tc, eligible_event, status, rationale)
VALUES
  (1, 1, 7, 10000, 1000, 'verified_referral_activation', 'active',
   'Conservative initial TC-only operating cap; awards require verified referral events, eligibility checks, idempotent ledger settlement, and must not exceed the reserved cycle pool.');

CREATE INDEX IF NOT EXISTS idx_referral_pool_policy_status
  ON referral_pool_policy(status, policy_version);
