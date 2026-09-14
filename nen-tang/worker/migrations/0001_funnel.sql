-- Cac bang cua funnel ban hang, bung nguyen tu he thong cu tren Vercel/Neon.
--
-- Giu y nguyen ten cot va kieu du lieu (ke ca id so tu tang) de buoc di tru
-- du lieu chi la copy thang, khong phai anh xa lai gi. Cac ALTER TABLE cua ban
-- cu da duoc gop thang vao day.
--
-- Quy uoc chung: thoi gian luu chuoi ISO-8601, boolean luu 0/1.

-- Mot dong cho moi ten mien. v1 co dung 2 dong (trang ban hang + cong dong);
-- sau nay muon chay them thuong hieu khac thi them mot dong, khong phai sua code.
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  hostname    TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL,                    -- 'funnel' | 'app'
  name        TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

-- Khach truy cap chua dinh danh. id chinh la gia tri cookie fnl_sid.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  landing_url   TEXT, referrer TEXT,
  utm_source    TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  fbclid        TEXT, gclid TEXT, user_agent TEXT, ip TEXT
);

-- Nguoi dang ky. Dinh danh la so dien thoai (phone_e164), khong phai email.
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  phone_e164    TEXT NOT NULL UNIQUE,
  country_code  TEXT NOT NULL DEFAULT '+84',
  answers_json  TEXT NOT NULL DEFAULT '{}',
  score         INTEGER NOT NULL DEFAULT 0,
  segment       TEXT NOT NULL DEFAULT 'cold',
  status        TEXT NOT NULL DEFAULT 'registered',
  submissions   INTEGER NOT NULL DEFAULT 1,
  note          TEXT, utm_source TEXT, utm_campaign TEXT, ip TEXT, user_agent TEXT,
  referred_by   INTEGER,
  referral_valid INTEGER NOT NULL DEFAULT 1,
  referral_void_reason TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_email   ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_segment ON leads(segment);
CREATE INDEX IF NOT EXISTS idx_leads_ref     ON leads(referred_by);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT, lead_id INTEGER, type TEXT NOT NULL, page TEXT,
  meta_json   TEXT, ip TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,
  lead_id          INTEGER, session_id TEXT,
  product_sku      TEXT NOT NULL, product_name TEXT NOT NULL,
  amount           INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'VND',
  status           TEXT NOT NULL DEFAULT 'pending',
  transfer_content TEXT NOT NULL,
  customer_name    TEXT, customer_phone TEXT, customer_email TEXT,
  paid_at          TEXT, paid_amount INTEGER, payment_ref TEXT,
  cancel_reason    TEXT, note TEXT,
  created_at       TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_lead   ON orders(lead_id);

-- Giao dich ngan hang nhan tu webhook SePay/Casso.
CREATE TABLE IF NOT EXISTS bank_txns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider      TEXT NOT NULL, external_id TEXT, amount INTEGER, content TEXT, account TEXT,
  occurred_at   TEXT, matched_order TEXT, status TEXT NOT NULL DEFAULT 'received',
  raw_json      TEXT, created_at TEXT NOT NULL
);
-- Chot chong tinh tien hai lan khi ngan hang ban lai cung mot giao dich.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_txn_ext ON bank_txns(provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id         INTEGER UNIQUE,
  code            TEXT NOT NULL UNIQUE,
  token           TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  commission_rate REAL NOT NULL DEFAULT 0.2,
  unlocked_level  INTEGER NOT NULL DEFAULT 1,
  unlocked_at     TEXT,
  hide_from_leaderboard INTEGER NOT NULL DEFAULT 0,
  payout_info     TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_clicks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id  INTEGER NOT NULL,
  code          TEXT NOT NULL,
  session_id    TEXT,
  landing_url   TEXT, referrer TEXT, ip TEXT, user_agent TEXT,
  created_at    TEXT NOT NULL
);
-- Moi phien chi tinh mot luot bam cho moi nguoi gioi thieu.
CREATE UNIQUE INDEX IF NOT EXISTS idx_click_session ON referral_clicks(affiliate_id, session_id)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id  INTEGER NOT NULL,
  order_id      INTEGER NOT NULL UNIQUE,        -- moi don chi sinh mot hoa hong
  order_code    TEXT NOT NULL,
  lead_id       INTEGER,
  order_amount  INTEGER NOT NULL,
  rate          REAL NOT NULL,                  -- chot lai ty le tai thoi diem ban
  amount        INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  paid_at       TEXT, note TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comm_aff ON commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_comm_status ON commissions(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL, target TEXT, meta_json TEXT, ip TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Gioi han so lan goi. Ban cu dem trong bo nho cua tien trinh nen tren moi
-- truong serverless moi ban sao lai co bo dem rieng -> gioi han that bi nhan
-- len theo so ban sao. Dem trong D1 thi ca he thong dung chung mot con so.
CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL          -- epoch mili-giay
);
CREATE INDEX IF NOT EXISTS idx_rate_reset ON rate_limits(reset_at);
