PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 8 AND 16),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id),
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','activated','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  activated_at TEXT,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_owner_status ON referral_attributions(referrer_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_lessons (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  content_json TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  answer_key_json TEXT NOT NULL,
  reward_tc INTEGER NOT NULL CHECK (reward_tc BETWEEN 0 AND 10000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS learning_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL REFERENCES learning_lessons(id),
  answers_json TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_learning_attempts_user_lesson ON learning_attempts(user_id, lesson_id, created_at DESC);
CREATE TABLE IF NOT EXISTS learning_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL REFERENCES learning_lessons(id),
  best_score INTEGER NOT NULL CHECK (best_score >= 0),
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reward_transaction_id TEXT REFERENCES ledger_transactions(id),
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS presale_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  preview_enabled INTEGER NOT NULL DEFAULT 1 CHECK (preview_enabled IN (0,1)),
  sale_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sale_enabled IN (0,1)),
  launch_state TEXT NOT NULL DEFAULT 'disabled' CHECK (launch_state IN ('disabled','review','approved','active','paused')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO presale_settings (id, preview_enabled, sale_enabled, launch_state) VALUES (1, 1, 0, 'disabled');

INSERT OR IGNORE INTO learning_lessons (id,slug,title,category,summary,content_json,questions_json,answer_key_json,reward_tc,sort_order) VALUES
('market-basics','market-basics','Read a crypto market','Trading basics','Understand market pairs, quotes, and simulated prices.','[{"heading":"A market pair","body":"BTC/USDT shows how many USDT one BTC is quoted at. Pexoriy uses market data for practice; it does not send orders to a real exchange."},{"heading":"Price freshness","body":"A quote can become stale. A responsible practice system should block new trades when its price feed is not fresh."},{"heading":"Your balance","body":"Trade Credits (TC) fund simulated positions. TC is not cash and is not withdrawable money."}]','[{"question":"What does BTC/USDT represent?","options":["The amount of BTC per USDT","The quoted USDT price for one BTC","A real exchange order placed by Pexoriy"]},{"question":"What should happen when a quote is stale?","options":["Allow any trade","Pretend it is live","Block new trades until a fresh quote is available"]},{"question":"What is TC used for?","options":["Funding simulated trades","Buying real BTC on an exchange","A guaranteed cash balance"]}]','[1,2,0]',100,1),
('long-short','long-short','Understand long and short','Trading basics','Learn what direction means in a simulated position.','[{"heading":"Long","body":"A long position generally benefits when its reference price rises, before fees and other costs."},{"heading":"Short","body":"A short position generally benefits when its reference price falls, before fees and other costs."},{"heading":"No certainty","body":"Neither direction guarantees profit. Price gaps, fees, leverage, and execution assumptions can change outcomes."}]','[{"question":"A long position generally benefits when price…","options":["Rises","Falls","Never changes"]},{"question":"A short position generally benefits when price…","options":["Rises","Falls","Is guaranteed to stay flat"]},{"question":"Does choosing a direction guarantee profit?","options":["Yes","Only with AI","No"]}]','[0,1,2]',100,2),
('position-risk','position-risk','Size positions responsibly','Risk awareness','Learn why leverage and position size can magnify losses.','[{"heading":"Position size","body":"Position size determines how much market exposure a trade creates. Bigger exposure means a small price move can have a larger effect."},{"heading":"Leverage","body":"Leverage increases exposure relative to allocated collateral. It magnifies losses as well as gains and can increase liquidation risk in real markets."},{"heading":"Practice safely","body":"Use simulation to learn. Set a risk limit before entering and never interpret a simulated result as a prediction."}]','[{"question":"What does leverage do?","options":["Removes all risk","Magnifies exposure and potential gains or losses","Guarantees a win"]},{"question":"Why does position size matter?","options":["It affects exposure and P&L sensitivity","It makes prices predictable","It removes fees"]},{"question":"When should a risk limit be chosen?","options":["Only after a loss","Before entering a trade","It is never needed"]}]','[1,0,1]',150,3),
('ai-centre','ai-centre','Use the AI Centre responsibly','AI features','Understand AI Credits, AI proposals, and human review.','[{"heading":"AI Credits","body":"AI Credits pay for eligible AI-assisted features. They are separate from TC, which funds simulated trading."},{"heading":"A proposal is not a promise","body":"AI-generated setups can be wrong, incomplete, or unavailable. Review the rationale and market freshness before acting."},{"heading":"Simulation only","body":"Pexoriy AI workflows assist simulated crypto practice. They do not execute trades on a real exchange."}]','[{"question":"What do AI Credits pay for?","options":["Every manual trade","Eligible AI-assisted features","A guaranteed return"]},{"question":"Should an AI proposal be treated as certain?","options":["Yes","Only during a challenge","No, review it critically"]},{"question":"Does Pexoriy AI place real exchange trades?","options":["No, it is simulated practice","Yes, automatically","Only if the price rises"]}]','[1,2,0]',100,4),
('challenge-rules','challenge-rules','Compete fairly','Community rules','Learn how shared challenges and rewards should work.','[{"heading":"Shared leaderboard","body":"AI-assisted and manual simulated traders compete on the same leaderboard under the same published rules."},{"heading":"Eligibility","body":"Challenge eligibility should be based on published objectives, verified activity, and anti-exploit checks—not screenshots or self-reported claims."},{"heading":"Rewards","body":"TC is the usual mission reward. PXY is reserved for explicitly authorized campaigns and finalized prize allocations."}]','[{"question":"Who shares the leaderboard?","options":["Only AI users","Only manual users","AI-assisted and manual users under shared rules"]},{"question":"What should verify reward eligibility?","options":["A screenshot alone","Published rules and server-verified activity","A social media claim"]},{"question":"When may a mission issue PXY?","options":["For every lesson","Whenever the client asks","Only through an explicitly authorized campaign"]}]','[2,1,2]',100,5);

INSERT OR IGNORE INTO mission_definitions (id,title,reward_currency,reward_amount,active,rules_json) VALUES
('first-practice-trade','Make a practice trade','TC',250,1,'{"prerequisite":"practice_trade"}'),
('review-ai-setup','Review an AI trading setup','TC',150,1,'{"prerequisite":"ai_setup"}'),
('community-challenge','Join a community challenge','TC',200,1,'{"prerequisite":"community_challenge"}');
