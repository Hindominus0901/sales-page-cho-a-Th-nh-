-- Dữ liệu khởi tạo. Chạy bằng: npm run db:seed
-- Không nằm trong migrations/ vì migration phải chạy được nhiều lần trên
-- database đã có dữ liệu thật; seed thì chỉ chạy lúc dựng môi trường.

INSERT OR IGNORE INTO products
  (id, slug, name, price, compare_at_price, seats_total, seats_offset, start_date, is_active, created_at, updated_at)
VALUES
  ('prod_21ngay', 'thu-thach-21-ngay', 'Thử thách 21 ngày',
   2000000, 4000000, 30, 0, NULL, 1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO pages (id, page_key, title, path, is_published, created_at, updated_at) VALUES
  ('page_sales',    'sales_21d', 'Thử thách 21 ngày',   '/',                 1, unixepoch(), unixepoch()),
  ('page_workshop', 'workshop',  'Hành trình xây kênh', '/workshop',         1, unixepoch(), unixepoch()),
  ('page_bando',    'ban_do',    'Bản Đồ 21 Ngày',      '/ban-do-21-ngay',   1, unixepoch(), unixepoch());

INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES
  ('affiliate.default_rate_bp', '2000',  unixepoch()),
  ('affiliate.cookie_days',     '90',    unixepoch()),
  ('affiliate.payout_threshold','500000',unixepoch()),
  ('commission.hold_days',      '7',     unixepoch()),
  ('order.expires_hours',       '48',    unixepoch());
