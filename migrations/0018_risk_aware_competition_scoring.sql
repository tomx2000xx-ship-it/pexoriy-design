ALTER TABLE competition_participants ADD COLUMN starting_equity_tc INTEGER NOT NULL DEFAULT 0 CHECK (starting_equity_tc >= 0);
ALTER TABLE competition_participants ADD COLUMN peak_equity_tc INTEGER NOT NULL DEFAULT 0 CHECK (peak_equity_tc >= 0);
ALTER TABLE competition_participants ADD COLUMN last_equity_tc INTEGER CHECK (last_equity_tc >= 0);
ALTER TABLE competition_participants ADD COLUMN ending_equity_tc INTEGER CHECK (ending_equity_tc >= 0);
ALTER TABLE competition_participants ADD COLUMN return_bps INTEGER;
ALTER TABLE competition_participants ADD COLUMN max_drawdown_bps INTEGER NOT NULL DEFAULT 0 CHECK (max_drawdown_bps BETWEEN 0 AND 10000);
ALTER TABLE competition_participants ADD COLUMN risk_adjusted_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_adjusted_score >= 0);
ALTER TABLE competition_participants ADD COLUMN scoring_version TEXT NOT NULL DEFAULT 'risk-aware-v1';
ALTER TABLE competition_participants ADD COLUMN settled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_competition_participants_risk_leaderboard
  ON competition_participants(round_id, score_points DESC, return_bps DESC, max_drawdown_bps ASC);
