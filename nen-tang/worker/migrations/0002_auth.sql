-- Tai khoan nguoi dung cho nen tang cong dong.
--
-- Nguyen tac xuyen suot: KHONG bao gio luu thu co the dung de dang nhap.
--   - mat khau  -> chi luu ban bam PBKDF2
--   - ma OTP    -> chi luu ban bam (co them "pepper" tu bien bi mat)
--   - phien     -> chi luu ban bam SHA-256 cua token nam trong cookie
--   - link reset-> chi luu ban bam SHA-256 cua token nam trong URL
-- Ke ca ke doc duoc toan bo co so du lieu cung khong dang nhap thay ai duoc.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,              -- UUID
  email          TEXT NOT NULL UNIQUE,          -- luon luu chu thuong
  email_verified INTEGER NOT NULL DEFAULT 0,
  full_name      TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'member',   -- admin | coach | member
  status         TEXT NOT NULL DEFAULT 'active',   -- active | suspended | banned
  avatar_url     TEXT,
  phone          TEXT,
  phone_e164     TEXT UNIQUE,
  bio            TEXT,
  team_id        TEXT,
  mentor_id      TEXT,

  -- Cot game hoa nam thang tren bang nay (khong tach bang rieng) de auth.me()
  -- va entities.User.get() tra ve cung mot hinh dang ma frontend dang mong doi.
  total_xp          INTEGER NOT NULL DEFAULT 0,
  total_coin        INTEGER NOT NULL DEFAULT 0,
  content_count     INTEGER NOT NULL DEFAULT 0,
  call_count        INTEGER NOT NULL DEFAULT 0,
  assignment_count  INTEGER NOT NULL DEFAULT 0,
  current_streak    INTEGER NOT NULL DEFAULT 0,
  longest_streak    INTEGER NOT NULL DEFAULT 0,
  last_activity_date TEXT,

  -- Cau noi sang du lieu funnel cu (leads.id la so tu tang)
  legacy_lead_id INTEGER UNIQUE,
  source         TEXT NOT NULL DEFAULT 'signup',   -- signup | google | funnel_import
  org_id         TEXT NOT NULL DEFAULT 'adm',      -- chua dung, de san cho nhieu thuong hieu

  created_date   TEXT NOT NULL,
  updated_date   TEXT NOT NULL,
  created_by     TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_xp     ON users(total_xp DESC);

-- Tach mat khau ra bang rieng: truy van user thong thuong khong bao gio keo
-- theo ban bam mat khau, nen cung kho lo ra ngoai hon.
CREATE TABLE IF NOT EXISTS credentials (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  password_hash TEXT NOT NULL,                  -- pbkdf2:sha256:<vong>:<salt>:<hash>
  updated_at    TEXT NOT NULL
);

-- Phien co trang thai -> THU HOI DUOC. Cookie ky HMAC vo trang thai (cach cu
-- cua trang quan tri) khong the huy truoc han duoc.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id           TEXT PRIMARY KEY,                -- sha256 cua gia tri trong cookie
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sess_user    ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider         TEXT NOT NULL,               -- 'google'
  provider_user_id TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(id),
  email            TEXT,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

-- Ma 6 so xac thuc email. attempts de chan do ma; consumed_at de dung mot lan.
CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL,                    -- register
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes(email, purpose, consumed_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_resets(user_id);

-- Nhat ky mail da gui, de tra loi duoc cau "khach co nhan duoc ma khong?"
CREATE TABLE IF NOT EXISTS emails_sent (
  id              TEXT PRIMARY KEY,
  to_addr         TEXT NOT NULL,
  template        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL,                -- queued | sent | failed
  provider_id     TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL,
  sent_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_to ON emails_sent(to_addr, created_at);
