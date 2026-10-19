ALTER TABLE pxy_pack_catalog ADD COLUMN usd_equivalent_cents INTEGER NOT NULL DEFAULT 0 CHECK (usd_equivalent_cents >= 0);
