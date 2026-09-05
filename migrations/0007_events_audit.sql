CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  event_name   TEXT NOT NULL,                -- page_view | cta_click | form_start |
                                             -- lead_created | checkout_started |
                                             -- qr_shown | order_paid | video_play
  visitor_id   TEXT,
  page_key     TEXT,
  path         TEXT,
  lead_id      TEXT REFERENCES leads(id) ON DELETE SET NULL,
  order_id     TEXT REFERENCES orders(id) ON DELETE SET NULL,
  affiliate_id TEXT REFERENCES affiliates(id) ON DELETE SET NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  device       TEXT,
  country      TEXT,
  value        INTEGER,
  props_json   TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);
CREATE INDEX ix_events_name_time ON events(event_name, created_at DESC);
CREATE INDEX ix_events_visitor   ON events(visitor_id, created_at DESC);
CREATE INDEX ix_events_page_time ON events(page_key, created_at DESC);
CREATE INDEX ix_events_aff       ON events(affiliate_id, created_at DESC);

-- Bảng tổng hợp theo ngày, cron 03:00 giờ VN dựng lại. Dashboard chỉ đọc bảng
-- này nên không bao giờ phải COUNT(*) trên events.
CREATE TABLE daily_stats (
  stat_date    TEXT NOT NULL,                -- 'YYYY-MM-DD' giờ Việt Nam
  page_key     TEXT NOT NULL,
  affiliate_id TEXT NOT NULL DEFAULT '',     -- '' = tổng, không chia theo CTV
  views        INTEGER NOT NULL DEFAULT 0,
  uniques      INTEGER NOT NULL DEFAULT 0,
  leads        INTEGER NOT NULL DEFAULT 0,
  orders       INTEGER NOT NULL DEFAULT 0,
  paid_orders  INTEGER NOT NULL DEFAULT 0,
  revenue      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_date, page_key, affiliate_id)
);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('admin','affiliate','system','webhook')),
  actor_id    TEXT,
  actor_label TEXT,
  action      TEXT NOT NULL,                 -- 'lead.update' | 'payout.approve' | 'order.paid'
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before_json TEXT,
  after_json  TEXT,
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX ix_audit_actor  ON audit_log(actor_type, actor_id, created_at DESC);
CREATE INDEX ix_audit_time   ON audit_log(created_at DESC);
