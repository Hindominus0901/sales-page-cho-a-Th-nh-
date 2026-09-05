CREATE TABLE products (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL,            -- 'thu-thach-21-ngay'
  name             TEXT NOT NULL,
  price            INTEGER NOT NULL,         -- 2000000
  compare_at_price INTEGER,                  -- 4000000, giá gạch ngang
  seats_total      INTEGER,
  seats_offset     INTEGER NOT NULL DEFAULT 0,  -- số chỗ đã bán ngoài web
  start_date       TEXT,                     -- 'YYYY-MM-DD' ngày khai giảng
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_products_slug ON products(slug);

CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  order_code     TEXT NOT NULL,              -- 'GC7QF3KD' — nội dung chuyển khoản
  product_id     TEXT NOT NULL REFERENCES products(id),
  lead_id        TEXT REFERENCES leads(id) ON DELETE SET NULL,
  student_id     TEXT,                       -- điền khi thanh toán xong
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  phone_norm     TEXT NOT NULL,
  email          TEXT,
  email_norm     TEXT,
  field          TEXT,                       -- lĩnh vực đang làm
  note           TEXT,
  amount_total   INTEGER NOT NULL,           -- số tiền phải trả
  amount_paid    INTEGER NOT NULL DEFAULT 0, -- tổng các giao dịch đã khớp
  currency       TEXT NOT NULL DEFAULT 'VND',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','partially_paid','paid','overpaid',
                                   'cancelled','expired','refunded')),
  payment_method TEXT NOT NULL DEFAULT 'sepay_vietqr',
  discount       INTEGER NOT NULL DEFAULT 0,
  affiliate_id   TEXT REFERENCES affiliates(id) ON DELETE SET NULL,
  visitor_id     TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT,
  admin_note     TEXT,
  ip_hash        TEXT,
  user_agent     TEXT,
  expires_at     INTEGER,                    -- hạn của QR, mặc định +48h
  paid_at        INTEGER,
  cancelled_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_orders_code ON orders(order_code);
CREATE INDEX ix_orders_status      ON orders(status, created_at DESC);
CREATE INDEX ix_orders_created     ON orders(created_at DESC);
CREATE INDEX ix_orders_phone       ON orders(phone_norm);
CREATE INDEX ix_orders_affiliate   ON orders(affiliate_id, created_at DESC);
CREATE INDEX ix_orders_lead        ON orders(lead_id);
-- Dùng cho nhánh ghép dự phòng theo số tiền khi nội dung CK không đọc được
CREATE INDEX ix_orders_pending_amount ON orders(status, amount_total, created_at DESC);

-- provider_tx_id là khoá chống trùng của webhook: SePay gửi lại bao nhiêu lần
-- thì bản ghi thứ hai cũng không vào được.
CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL DEFAULT 'sepay',
  provider_tx_id   TEXT NOT NULL,
  reference_code   TEXT,                     -- mã tham chiếu của ngân hàng
  order_id         TEXT REFERENCES orders(id) ON DELETE SET NULL,  -- NULL = chưa khớp
  matched_code     TEXT,                     -- mã đơn trích được từ nội dung CK
  match_method     TEXT CHECK (match_method IN ('auto_code','auto_amount_phone','manual','none')),
  direction        TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount           INTEGER NOT NULL,
  gateway          TEXT,                     -- 'TCB'
  account_number   TEXT,
  sub_account      TEXT,
  transaction_date TEXT,                     -- chuỗi thời gian của SePay, giữ nguyên
  content          TEXT,
  accumulated      INTEGER,
  status           TEXT NOT NULL DEFAULT 'unmatched'
                   CHECK (status IN ('unmatched','matched','ignored','manual_review')),
  raw_json         TEXT NOT NULL,
  matched_by       TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  matched_at       INTEGER,
  created_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_payments_provider_tx ON payments(provider, provider_tx_id);
CREATE INDEX ix_payments_order   ON payments(order_id);
CREATE INDEX ix_payments_status  ON payments(status, created_at DESC);
CREATE INDEX ix_payments_created ON payments(created_at DESC);

-- Nhật ký nguyên văn mọi lần webhook gọi vào, ghi trước khi xử lý.
-- Sai shape payload cũng không mất dữ liệu — replay lại được từ bảng này.
CREATE TABLE webhook_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  event_key    TEXT,                         -- provider_tx_id nếu đọc được
  http_status  INTEGER NOT NULL,
  outcome      TEXT NOT NULL,                -- processed|duplicate|unmatched|rejected|error|ignored
  error        TEXT,
  headers_json TEXT,
  body_text    TEXT NOT NULL,
  ip           TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX ix_webhook_events_created ON webhook_events(created_at DESC);
CREATE INDEX ix_webhook_events_key     ON webhook_events(provider, event_key);

-- ---------------------------------------------------------------- Học viên

CREATE TABLE students (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT REFERENCES leads(id) ON DELETE SET NULL,
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  phone_norm   TEXT NOT NULL,
  email        TEXT,
  email_norm   TEXT,
  zalo         TEXT,
  facebook_url TEXT,
  notes        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_students_phone   ON students(phone_norm);
CREATE INDEX        ix_students_created ON students(created_at DESC);

-- UNIQUE(order_id): webhook chạy lại không bao giờ tạo hai lần ghi danh.
CREATE TABLE enrollments (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id),
  order_id     TEXT REFERENCES orders(id) ON DELETE SET NULL,
  cohort       TEXT,                          -- 'K1-2026-09'
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','completed','paused','refunded','cancelled')),
  started_at   INTEGER,
  completed_at INTEGER,
  progress_day INTEGER NOT NULL DEFAULT 0,    -- 0..21
  posts_done   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_enroll_order   ON enrollments(order_id);
CREATE INDEX        ix_enroll_student ON enrollments(student_id);
CREATE INDEX        ix_enroll_cohort  ON enrollments(cohort, status);
