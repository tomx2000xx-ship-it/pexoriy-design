-- Seed the seven PXY bundle definitions already shown as planned in the AI Credit Store.
-- These rows are hidden from the public pack endpoint until the dedicated PXY reserve,
-- reserve verification, and launch approval gates are all enabled.
-- price_gram_atoms is an initial reference snapshot only. The Worker recalculates the
-- checkout amount from the live GRAM/USD quote and usd_equivalent_cents at display/order time.
-- Bonus issuance is a sub-allocation of the community allocation, not additional token supply.

INSERT OR IGNORE INTO pxy_pack_catalog
  (pack_id, title, price_gram_atoms, usd_equivalent_cents, ai_credits, pxy_amount, active)
VALUES
  ('entry_5_pxy',   'Entry Bundle',   3703703704,   500,  70,   100, 1),
  ('starter_10_pxy','Starter Bundle', 7407407407,  1000, 140,   200, 1),
  ('popular_25_pxy','Popular Bundle',18518518519,  2500, 350,   500, 1),
  ('pro_50_pxy',    'Pro Bundle',    37037037037,  5000, 700,  1000, 1),
  ('max_100_pxy',   'Maximum Bundle',74074074074, 10000,1400,  2000, 1),
  ('max_250_pxy',   'Maximum 250 Bundle',185185185185,25000,3500,5000,1),
  ('max_500_pxy',   'Maximum 500 Bundle',370370370370,50000,7000,10000,1);
