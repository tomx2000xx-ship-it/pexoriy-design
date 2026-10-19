PRAGMA foreign_keys = ON;

-- Pexoriy 30-day user-relative onboarding mission journey.
CREATE TABLE IF NOT EXISTS mission_journeys (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  started_at TEXT NOT NULL,
  current_day INTEGER NOT NULL DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS mission_journey_days (
  user_id TEXT NOT NULL REFERENCES mission_journeys(user_id),
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 30),
  mission_id TEXT NOT NULL REFERENCES mission_definitions(id),
  unlock_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','available','completed','expired')),
  completed_at TEXT,
  PRIMARY KEY(user_id, day_number),
  UNIQUE(user_id, mission_id),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);
CREATE INDEX IF NOT EXISTS idx_mission_journey_days_user_status
  ON mission_journey_days(user_id, status, day_number);

-- One common mission pool; each user receives this same ordered sequence.
INSERT OR IGNORE INTO mission_definitions (id,title,reward_currency,reward_amount,issuance_cap,active,rules_json) VALUES
('journey-01','Learn how simulated trading works','TC',50,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":1}'),
('journey-02','Pass a market basics quiz','TC',75,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":2}'),
('journey-03','Explore a crypto market','TC',50,NULL,1,'{"prerequisite":"market_viewed","category":"explore","day":3}'),
('journey-04','Review position sizing','TC',75,NULL,1,'{"prerequisite":"learning_complete","category":"risk","day":4}'),
('journey-05','Complete a practice trade','TC',100,NULL,1,'{"prerequisite":"practice_trade","category":"practice","day":5}'),
('journey-06','Review a risk-management lesson','TC',75,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":6}'),
('journey-07','Check in and review your progress','TC',50,NULL,1,'{"prerequisite":"checkin_today","category":"habit","day":7}'),
('journey-08','Identify a trend in the market','TC',75,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":8}'),
('journey-09','Explore the AI trading workspace','TC',50,NULL,1,'{"prerequisite":"ai_setup","category":"ai","day":9}'),
('journey-10','Complete a lesson on volatility','TC',100,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":10}'),
('journey-11','Take a second knowledge check','TC',75,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":11}'),
('journey-12','Review your practice trade history','TC',50,NULL,1,'{"prerequisite":"practice_trade","category":"practice","day":12}'),
('journey-13','Learn about drawdown','TC',100,NULL,1,'{"prerequisite":"learning_complete","category":"risk","day":13}'),
('journey-14','Complete your second check-in','TC',50,NULL,1,'{"prerequisite":"checkin_today","category":"habit","day":14}'),
('journey-15','Compare two crypto markets','TC',75,NULL,1,'{"prerequisite":"market_viewed","category":"explore","day":15}'),
('journey-16','Pass a risk and reward quiz','TC',100,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":16}'),
('journey-17','Open the AI strategy workspace','TC',75,NULL,1,'{"prerequisite":"ai_setup","category":"ai","day":17}'),
('journey-18','Complete a lesson on trading discipline','TC',100,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":18}'),
('journey-19','Make another practice trade','TC',125,NULL,1,'{"prerequisite":"practice_trade","category":"practice","day":19}'),
('journey-20','Share a useful community post','TC',100,NULL,1,'{"prerequisite":"community_post","category":"community","day":20}'),
('journey-21','Check in and reflect on your week','TC',50,NULL,1,'{"prerequisite":"checkin_today","category":"habit","day":21}'),
('journey-22','Complete a market structure quiz','TC',100,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":22}'),
('journey-23','Read a lesson on fees and execution','TC',100,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":23}'),
('journey-24','Review your AI strategy settings','TC',75,NULL,1,'{"prerequisite":"ai_setup","category":"ai","day":24}'),
('journey-25','Review an open or closed practice position','TC',100,NULL,1,'{"prerequisite":"practice_trade","category":"practice","day":25}'),
('journey-26','Join a community discussion','TC',75,NULL,1,'{"prerequisite":"group_message","category":"community","day":26}'),
('journey-27','Pass a final risk-awareness quiz','TC',125,NULL,1,'{"prerequisite":"quiz_passed","category":"quiz","day":27}'),
('journey-28','Complete a final learning lesson','TC',125,NULL,1,'{"prerequisite":"learning_complete","category":"learn","day":28}'),
('journey-29','Review your 30-day progress','TC',100,NULL,1,'{"prerequisite":"journey_review","category":"reflect","day":29}'),
('journey-30','Complete the 30-day learning journey','TC',250,NULL,1,'{"prerequisite":"journey_complete","category":"milestone","day":30}');

-- Community spaces: posts, memberships, threaded comments, reactions and per-community chat.
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  posting_policy TEXT NOT NULL DEFAULT 'members' CHECK (posting_policy IN ('members','moderators')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS community_memberships (
  community_id TEXT NOT NULL REFERENCES communities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  muted_until TEXT,
  PRIMARY KEY(community_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_memberships_user ON community_memberships(user_id,joined_at DESC);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  edited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_posts_feed ON community_posts(community_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS community_post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS community_post_reactions (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reaction TEXT NOT NULL CHECK (reaction IN ('like','insightful','support')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(post_id,user_id,reaction)
);
CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1500),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_community_messages_history ON community_messages(community_id,status,created_at DESC);

INSERT OR IGNORE INTO communities (id,slug,name,description) VALUES
('community-general','general','General','Meet the community, share wins, and ask questions.'),
('community-trading-lab','trading-lab','Trading Lab','Discuss simulated strategies, risk, and market observations.'),
('community-learning','learning-lounge','Learning Lounge','Learn together through lessons, quizzes, and practice.'),
('community-ai','ai-strategies','AI Strategies','Discuss AI-assisted simulated trading and responsible strategy testing.');

-- Special packs have a distinct, hard-capped reserve; this is not the general PXY pool.
CREATE TABLE IF NOT EXISTS pxy_pack_reserve (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cap_pxy INTEGER NOT NULL DEFAULT 50000 CHECK (cap_pxy = 50000),
  issuance_enabled INTEGER NOT NULL DEFAULT 0 CHECK (issuance_enabled IN (0,1)),
  reserve_verified INTEGER NOT NULL DEFAULT 0 CHECK (reserve_verified IN (0,1)),
  launch_approved INTEGER NOT NULL DEFAULT 0 CHECK (launch_approved IN (0,1)),
  approval_reference TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (issuance_enabled = 0 OR (reserve_verified=1 AND launch_approved=1 AND approval_reference IS NOT NULL))
);
INSERT OR IGNORE INTO pxy_pack_reserve (id,cap_pxy,issuance_enabled,reserve_verified,launch_approved)
VALUES (1,50000,0,0,0);

CREATE TABLE IF NOT EXISTS pxy_pack_catalog (
  pack_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price_gram_atoms INTEGER NOT NULL CHECK (price_gram_atoms > 0),
  ai_credits INTEGER NOT NULL CHECK (ai_credits >= 0),
  pxy_amount INTEGER NOT NULL DEFAULT 0 CHECK (pxy_amount BETWEEN 0 AND 50000),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS pxy_pack_issuances (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES pxy_pack_catalog(pack_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  payment_order_id TEXT NOT NULL UNIQUE REFERENCES payment_orders(id),
  pxy_amount INTEGER NOT NULL CHECK (pxy_amount > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','issued','cancelled','review')),
  ledger_transaction_id TEXT UNIQUE REFERENCES ledger_transactions(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  issued_at TEXT,
  CHECK ((status='issued' AND ledger_transaction_id IS NOT NULL AND issued_at IS NOT NULL) OR status <> 'issued')
);
CREATE INDEX IF NOT EXISTS idx_pxy_pack_issuances_status ON pxy_pack_issuances(status,created_at);
CREATE TRIGGER IF NOT EXISTS pxy_pack_issuance_cap_insert
BEFORE INSERT ON pxy_pack_issuances
WHEN NEW.status IN ('reserved','issued')
BEGIN
  SELECT CASE WHEN
    (SELECT COALESCE(SUM(pxy_amount),0) FROM pxy_pack_issuances WHERE status IN ('reserved','issued')) + NEW.pxy_amount >
    (SELECT cap_pxy FROM pxy_pack_reserve WHERE id=1)
  THEN RAISE(ABORT,'PXY_PACK_RESERVE_CAP_EXCEEDED') END;
END;
CREATE TRIGGER IF NOT EXISTS pxy_pack_issuance_cap_update
BEFORE UPDATE OF pxy_amount,status ON pxy_pack_issuances
WHEN NEW.status IN ('reserved','issued')
BEGIN
  SELECT CASE WHEN
    (SELECT COALESCE(SUM(pxy_amount),0) FROM pxy_pack_issuances WHERE id <> NEW.id AND status IN ('reserved','issued')) + NEW.pxy_amount >
    (SELECT cap_pxy FROM pxy_pack_reserve WHERE id=1)
  THEN RAISE(ABORT,'PXY_PACK_RESERVE_CAP_EXCEEDED') END;
END;
