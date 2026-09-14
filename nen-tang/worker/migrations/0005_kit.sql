-- Kit (ten cu: ConvertKit) - danh sach nguoi nhan va chuoi email nuoi duong.
--
-- Kho API la secret cua Worker (KIT_API_KEY), KHONG nam trong bang nay: entity
-- AppSetting cho phep moi nguoi da dang nhap doc, cat kho API vao do la lo.
-- O day chi luu ma tag/sequence - biet cung khong lam gi duoc.

CREATE TABLE IF NOT EXISTS kit_sync_log (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  action     TEXT NOT NULL,               -- tag nao da gan, vd 'kit_tag_lead'
  status     TEXT NOT NULL,               -- ok | partial | failed
  error      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kitlog_time  ON kit_sync_log(created_at);
CREATE INDEX IF NOT EXISTS idx_kitlog_email ON kit_sync_log(email);

-- Nho ma nguoi nhan ben Kit de sau nay doi soat hai ben, va de lenh dong bo lai
-- biet ai da day sang roi.
ALTER TABLE users ADD COLUMN kit_subscriber_id INTEGER;
ALTER TABLE leads ADD COLUMN kit_subscriber_id INTEGER;

INSERT OR IGNORE INTO app_settings
  (id, key, value, type, options_json, category, label, description, sort_order, created_date, updated_date)
VALUES
 ('st-kit-on',       'kit_enabled',          'true', 'bool',   NULL, 'kit',
  'Bat dong bo sang Kit',
  'Tat di thi he thong ngung day nguoi sang Kit. Thu giao dich (ma OTP, dat lai mat khau) khong bi anh huong - nhung thu do khong di qua Kit.',
  60, datetime('now'), datetime('now')),

 ('st-kit-tag-lead', 'kit_tag_lead',         '',     'string', NULL, 'kit',
  'Tag cho nguoi moi de lai thong tin',
  'Ma tag trong Kit. Gan ngay khi co nguoi dien form o trang ban hang, du chua co tai khoan.',
  61, datetime('now'), datetime('now')),

 ('st-kit-tag-mem',  'kit_tag_member',       '',     'string', NULL, 'kit',
  'Tag cho thanh vien da xac thuc email',
  'Gan sau khi nhap dung ma OTP hoac dang nhap bang Google.',
  62, datetime('now'), datetime('now')),

 ('st-kit-tag-cus',  'kit_tag_customer',     '',     'string', NULL, 'kit',
  'Tag cho nguoi da mua ve VIP',
  'Gan khi ngan hang bao da nhan duoc tien.',
  63, datetime('now'), datetime('now')),

 ('st-kit-seq-wel',  'kit_sequence_welcome', '',     'string', NULL, 'kit',
  'Chuoi email chao mung',
  'Ma sequence trong Kit. De trong thi khong dua ai vao chuoi nao ca.',
  64, datetime('now'), datetime('now'));
