-- Lich & su kien: buoi live, workshop, hoi dap.
--
-- Ten bang la calendar_events chu KHONG phai events: `events` da thuoc ve funnel
-- (nhat ky hanh vi tren trang ban hang - luot xem, bam nut, gui form). Dung
-- trung ten la tron hai thu khong lien quan gi nhau vao mot cho.

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'live',        -- live | workshop | qna | offline
  starts_at TEXT NOT NULL,                  -- ISO 8601
  ends_at TEXT,
  location TEXT,                            -- dia diem, hoac ten phong Zoom
  -- Duong vao phong hop. Chi nguoi DA DANG KY moi doc duoc (xem gatedFields
  -- trong entities/schema.js): de lo la ai cung vao duoc buoi live.
  join_url TEXT,
  cover_url TEXT,
  capacity INTEGER,                         -- 0 hoac NULL = khong gioi han cho
  min_level INTEGER NOT NULL DEFAULT 0,
  requires_unlock INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,                       -- ban ghi lai, dang sau khi ket thuc
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | live | done | cancelled
  is_active INTEGER NOT NULL DEFAULT 1,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_calevent_time ON calendar_events(starts_at);

CREATE TABLE IF NOT EXISTS event_signups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_title TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT,
  status TEXT NOT NULL DEFAULT 'registered', -- registered | attended | absent | cancelled
  registered_at TEXT NOT NULL,
  attended_at TEXT,
  created_date TEXT NOT NULL, updated_date TEXT NOT NULL, created_by TEXT
);
-- Bam dang ky hai lan khong tao hai cho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_signup ON event_signups(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_signup_user ON event_signups(user_id);
