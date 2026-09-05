-- Hoa hồng. Hai ràng buộc UNIQUE dưới đây là thứ khiến trả tiền hai lần
-- trở thành bất khả thi về cấu trúc, không phụ thuộc vào code cẩn thận:
--   ux_commissions_order       — một đơn hàng sinh đúng một hoa hồng
--   ux_payout_items_commission — một hoa hồng vào đúng một đợt chi

CREATE TABLE commissions (
  id           TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  lead_id      TEXT REFERENCES leads(id) ON DELETE SET NULL,
  base_amount  INTEGER NOT NULL,             -- amount_total - discount
  rate         INTEGER NOT NULL,             -- chốt tại thời điểm phát sinh, 2000 = 20%
  amount       INTEGER NOT NULL,             -- floor(base * rate / 10000)
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','held','approved','payout_requested',
                                 'paid','void','rejected')),
  hold_reason  TEXT,                         -- 'self_referral_suspected', 'same_ip'...
  available_at INTEGER NOT NULL,             -- paid_at + cửa sổ hoàn tiền
  approved_at  INTEGER,
  approved_by  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  payout_id    TEXT,
  paid_at      INTEGER,
  void_reason  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_commissions_order  ON commissions(order_id);
CREATE INDEX ix_commissions_aff_status    ON commissions(affiliate_id, status, created_at DESC);
CREATE INDEX ix_commissions_status        ON commissions(status, available_at);
CREATE INDEX ix_commissions_payout        ON commissions(payout_id);

CREATE TABLE payouts (
  id                TEXT PRIMARY KEY,
  payout_code       TEXT NOT NULL,           -- 'PO-2026-0007'
  affiliate_id      TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount            INTEGER NOT NULL,
  item_count        INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested','approved','paid','rejected','cancelled')),
  -- Chụp lại thông tin ngân hàng tại thời điểm yêu cầu: CTV đổi số tài khoản
  -- sau đó không được làm sai lịch sử chi trả.
  bank_name         TEXT,
  bank_account_no   TEXT,
  bank_account_name TEXT,
  requested_at      INTEGER NOT NULL,
  approved_at       INTEGER,
  approved_by       TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  paid_at           INTEGER,
  paid_by           TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  payment_reference TEXT,                    -- mã giao dịch ngân hàng
  proof_media_id    TEXT,
  rejected_reason   TEXT,
  admin_note        TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_payouts_code ON payouts(payout_code);
CREATE INDEX ix_payouts_aff         ON payouts(affiliate_id, created_at DESC);
CREATE INDEX ix_payouts_status      ON payouts(status, requested_at DESC);

CREATE TABLE payout_items (
  payout_id     TEXT NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  commission_id TEXT NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  PRIMARY KEY (payout_id, commission_id)
);
CREATE UNIQUE INDEX ux_payout_items_commission ON payout_items(commission_id);
