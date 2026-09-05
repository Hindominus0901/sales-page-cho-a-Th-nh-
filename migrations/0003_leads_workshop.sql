-- Lead gộp từ cả ba nguồn, kèm điểm chấm rule-based.

CREATE TABLE leads (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL,             -- mã ngắn để tra cứu, ví dụ LD7QF3KD
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  phone_norm      TEXT NOT NULL,             -- 84xxxxxxxxx
  email           TEXT,
  email_norm      TEXT,
  facebook_url    TEXT,
  source          TEXT NOT NULL
                  CHECK (source IN ('workshop','ban_do','consult','checkout','manual','import')),
  source_page     TEXT,
  answers_json    TEXT NOT NULL DEFAULT '{}',  -- câu trả lời form, giữ nguyên văn
  score           INTEGER NOT NULL DEFAULT 0,
  score_band      TEXT NOT NULL DEFAULT 'cold' CHECK (score_band IN ('hot','warm','cold')),
  score_breakdown TEXT NOT NULL DEFAULT '[]',  -- [{rule,label,points}] để hiện trong CMS
  scoring_version INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','consulting','won','lost','spam')),
  lost_reason     TEXT,
  owner_admin_id  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  -- Chạm đầu tiên. Ghi một lần lúc tạo lead, tầng repository chặn mọi lần ghi đè.
  affiliate_id    TEXT REFERENCES affiliates(id) ON DELETE SET NULL,
  visitor_id      TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  referer         TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  consent_at      INTEGER,
  last_contacted_at INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_leads_code      ON leads(code);
CREATE INDEX ix_leads_created          ON leads(created_at DESC);
CREATE INDEX ix_leads_phone            ON leads(phone_norm);
CREATE INDEX ix_leads_email            ON leads(email_norm);
CREATE INDEX ix_leads_status           ON leads(status, created_at DESC);
CREATE INDEX ix_leads_band             ON leads(score_band, created_at DESC);
CREATE INDEX ix_leads_affiliate        ON leads(affiliate_id, created_at DESC);
CREATE INDEX ix_leads_source           ON leads(source, created_at DESC);

CREATE TABLE lead_notes (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  admin_id   TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ix_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

-- ---------------------------------------------------------------- Workshop

CREATE TABLE workshop_sessions (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,             -- 'ws-2026-08-05'
  title           TEXT NOT NULL,
  starts_at       INTEGER NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 135,
  zoom_url        TEXT,
  zoom_meeting_id TEXT,
  zoom_passcode   TEXT,
  zalo_group_url  TEXT,
  capacity        INTEGER,
  status          TEXT NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('draft','upcoming','live','done','cancelled')),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_workshop_slug   ON workshop_sessions(slug);
CREATE INDEX        ix_workshop_starts ON workshop_sessions(status, starts_at);

-- UNIQUE(session_id, phone_norm): đăng ký lại cùng số điện thoại là no-op,
-- không tạo bản ghi trùng và không làm sai bộ đếm.
CREATE TABLE workshop_registrations (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES workshop_sessions(id) ON DELETE CASCADE,
  lead_id          TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  phone_norm       TEXT NOT NULL,
  email_norm       TEXT,
  answers_json     TEXT NOT NULL DEFAULT '{}',
  attended         INTEGER NOT NULL DEFAULT 0,
  attended_min     INTEGER,
  reminder_sent_at INTEGER,
  affiliate_id     TEXT REFERENCES affiliates(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_wsreg_session_phone ON workshop_registrations(session_id, phone_norm);
CREATE INDEX        ix_wsreg_session       ON workshop_registrations(session_id, created_at DESC);
CREATE INDEX        ix_wsreg_lead          ON workshop_registrations(lead_id);
