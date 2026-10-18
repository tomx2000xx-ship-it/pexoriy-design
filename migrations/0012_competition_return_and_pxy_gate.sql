PRAGMA foreign_keys = ON;

-- Competition return and risk metrics. Existing entries receive a safe default;
-- new entries snapshot the user's TC balance at entry time.
ALTER TABLE competition_participants ADD COLUMN starting_balance_tc INTEGER NOT NULL DEFAULT 10000 CHECK (starting_balance_tc > 0);
ALTER TABLE competition_participants ADD COLUMN return_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competition_participants ADD COLUMN max_drawdown_bps INTEGER NOT NULL DEFAULT 0 CHECK (max_drawdown_bps >= 0);
ALTER TABLE competition_participants ADD COLUMN active_days INTEGER NOT NULL DEFAULT 0 CHECK (active_days >= 0);
ALTER TABLE competition_participants ADD COLUMN eligible_for_prize INTEGER NOT NULL DEFAULT 0 CHECK (eligible_for_prize IN (0,1));
CREATE INDEX IF NOT EXISTS idx_competition_return_rank ON competition_participants(round_id, return_bps DESC, max_drawdown_bps ASC, active_days DESC, joined_at ASC);

-- Database-level fail-closed protection: no PXY ledger posting can be written
-- until reserves, launch approval, and the issuance switch are all explicitly enabled.
CREATE TRIGGER IF NOT EXISTS trg_pxy_issuance_requires_approval
BEFORE INSERT ON ledger_postings
WHEN NEW.currency='PXY' AND NOT EXISTS (
  SELECT 1 FROM pxy_issuance_controls
  WHERE id=1 AND reserves_verified=1 AND launch_approved=1
    AND issuance_enabled=1 AND approval_reference IS NOT NULL AND length(trim(approval_reference))>0
)
BEGIN
  SELECT RAISE(ABORT, 'pxy_issuance_gated');
END;

CREATE TRIGGER IF NOT EXISTS trg_pxy_issuance_update_requires_approval
BEFORE UPDATE OF currency, account_key, amount_atoms ON ledger_postings
WHEN NEW.currency='PXY' AND NOT EXISTS (
  SELECT 1 FROM pxy_issuance_controls
  WHERE id=1 AND reserves_verified=1 AND launch_approved=1
    AND issuance_enabled=1 AND approval_reference IS NOT NULL AND length(trim(approval_reference))>0
)
BEGIN
  SELECT RAISE(ABORT, 'pxy_issuance_gated');
END;
