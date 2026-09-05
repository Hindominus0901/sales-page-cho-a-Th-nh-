-- Người dùng quản trị + phiên đăng nhập dùng chung cho cả admin và CTV.
-- Quy ước toàn bộ schema:
--   id        TEXT     crypto.randomUUID()
--   thời gian INTEGER  unix giây UTC
--   tiền      INTEGER  VND, không bao giờ dùng số thực
--   boolean   INTEGER  0/1

CREATE TABLE admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,              -- pbkdf2$<vòng>$<b64 muối>$<b64 hash>
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','staff')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_admin_users_email ON admin_users(email_norm);

-- Một bảng phiên phục vụ cả hai vai trò; subject_type phân biệt.
-- Cookie tách tên riêng (__Host-gc_admin / __Host-gc_aff) nên phiên CTV
-- không bao giờ được chấp nhận ở route admin, kể cả khi lộ id phiên.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,            -- 32 byte ngẫu nhiên, base64url
  subject_type TEXT NOT NULL CHECK (subject_type IN ('admin','affiliate')),
  subject_id   TEXT NOT NULL,
  csrf_secret  TEXT NOT NULL,
  ip_hash      TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);
CREATE INDEX ix_sessions_subject ON sessions(subject_type, subject_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);
