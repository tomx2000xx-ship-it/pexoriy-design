-- Versioned simulation fills, separately accounted fees, and D1-enforced exposure ceilings.
ALTER TABLE trading_positions ADD COLUMN open_fee_tc INTEGER NOT NULL DEFAULT 0 CHECK (open_fee_tc >= 0);
ALTER TABLE trading_positions ADD COLUMN entry_quote_price_micros INTEGER;
ALTER TABLE trading_positions ADD COLUMN close_return_tc INTEGER NOT NULL DEFAULT 0 CHECK (close_return_tc >= 0);

CREATE TRIGGER IF NOT EXISTS trg_trading_position_open_risk_caps
BEFORE INSERT ON trading_positions
WHEN NEW.status = 'open'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM trading_positions
    WHERE user_id = NEW.user_id AND status = 'open'
  ) >= 5 THEN RAISE(ABORT, 'position_limit_exceeded') END;

  SELECT CASE WHEN NEW.reserved_tc > CAST((
    COALESCE((SELECT SUM(p.amount_atoms) FROM ledger_postings p
      JOIN ledger_transactions t ON t.id = p.transaction_id
      WHERE p.account_key = 'user:' || NEW.user_id || ':TC' AND t.status = 'posted'), 0)
    + COALESCE((SELECT SUM(reserved_tc) FROM trading_positions
      WHERE user_id = NEW.user_id AND status = 'open'), 0)
    + NEW.reserved_tc + NEW.open_fee_tc
  ) * 0.25 AS INTEGER)
  THEN RAISE(ABORT, 'position_size_limit_exceeded') END;

  SELECT CASE WHEN (
    COALESCE((SELECT SUM(reserved_tc) FROM trading_positions
      WHERE user_id = NEW.user_id AND status = 'open'), 0) + NEW.reserved_tc
  ) > CAST((
    COALESCE((SELECT SUM(p.amount_atoms) FROM ledger_postings p
      JOIN ledger_transactions t ON t.id = p.transaction_id
      WHERE p.account_key = 'user:' || NEW.user_id || ':TC' AND t.status = 'posted'), 0)
    + COALESCE((SELECT SUM(reserved_tc) FROM trading_positions
      WHERE user_id = NEW.user_id AND status = 'open'), 0)
    + NEW.reserved_tc + NEW.open_fee_tc
  ) * 0.75 AS INTEGER)
  THEN RAISE(ABORT, 'total_exposure_limit_exceeded') END;
END;
