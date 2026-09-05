-- Cộng tác viên. Đặt trước bảng leads vì leads tham chiếu tới đây.

CREATE TABLE affiliates (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL,           -- giá trị ?ref=, ví dụ "MINHANH"
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  email_norm        TEXT NOT NULL,
  phone             TEXT,
  phone_norm        TEXT,                    -- dạng 84xxxxxxxxx
  password_hash     TEXT,                    -- NULL cho tới khi CTV đặt mật khẩu
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','suspended','rejected')),
  commission_rate   INTEGER NOT NULL DEFAULT 2000,   -- điểm cơ bản; 2000 = 20%
  bank_name         TEXT,
  bank_account_no   TEXT,
  bank_account_name TEXT,
  payout_threshold  INTEGER NOT NULL DEFAULT 500000,
  notes             TEXT,
  approved_at       INTEGER,
  last_login_at     INTEGER,
  last_login_ip_hash TEXT,                   -- dùng để phát hiện tự giới thiệu
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_affiliates_code   ON affiliates(code);
CREATE UNIQUE INDEX ux_affiliates_email  ON affiliates(email_norm);
CREATE INDEX        ix_affiliates_phone  ON affiliates(phone_norm);
CREATE INDEX        ix_affiliates_status ON affiliates(status);

-- Một click tính tiền cho mỗi (CTV, khách, ngày) — chặn spam F5.
CREATE TABLE affiliate_clicks (
  id             TEXT PRIMARY KEY,
  affiliate_id   TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  visitor_id     TEXT NOT NULL,
  click_date     TEXT NOT NULL,              -- 'YYYY-MM-DD' giờ Việt Nam
  landing_path   TEXT NOT NULL,
  referer        TEXT,
  utm_source     TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  country        TEXT,
  device         TEXT,
  ip_hash        TEXT,
  user_agent     TEXT,
  -- 0 khi khách đã có cookie ref của CTV khác: vẫn ghi nhận traffic cho CTV này,
  -- nhưng hoa hồng vẫn thuộc về CTV chạm đầu tiên.
  is_first_touch INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_aff_clicks_dedupe   ON affiliate_clicks(affiliate_id, visitor_id, click_date);
CREATE INDEX        ix_aff_clicks_aff_time ON affiliate_clicks(affiliate_id, created_at DESC);
