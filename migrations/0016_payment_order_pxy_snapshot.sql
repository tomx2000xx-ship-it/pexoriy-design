ALTER TABLE payment_orders ADD COLUMN pack_pxy_amount INTEGER NOT NULL DEFAULT 0 CHECK (pack_pxy_amount BETWEEN 0 AND 50000);
