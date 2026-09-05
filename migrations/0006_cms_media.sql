-- CMS. Nguyên tắc: code giữ mặc định và cấu trúc, DB chỉ giữ phần ghi đè.
-- Site phải render hoàn hảo khi page_content và page_sections đều rỗng.

CREATE TABLE pages (
  id              TEXT PRIMARY KEY,
  page_key        TEXT NOT NULL,             -- 'sales_21d' | 'workshop' | 'ban_do'
  title           TEXT NOT NULL,
  path            TEXT NOT NULL,
  seo_title       TEXT,
  seo_description TEXT,
  og_image_url    TEXT,
  is_published    INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_pages_key ON pages(page_key);

-- Thứ tự và bật/tắt các section do code định nghĩa. props_json CHỈ chứa phần
-- ghi đè lên mặc định trong code — không phải bản sao đầy đủ.
CREATE TABLE page_sections (
  id          TEXT PRIMARY KEY,
  page_key    TEXT NOT NULL,
  section_key TEXT NOT NULL,
  component   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  props_json  TEXT NOT NULL DEFAULT '{}',
  updated_by  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_page_sections       ON page_sections(page_key, section_key);
CREATE INDEX        ix_page_sections_order ON page_sections(page_key, sort_order);

-- Khoá/giá trị phẳng cho chuỗi không thuộc section nào (footer, pháp lý,
-- ngày giờ workshop). page_key '_global' dùng cho giá trị chung mọi trang.
CREATE TABLE page_content (
  id         TEXT PRIMARY KEY,
  page_key   TEXT NOT NULL,
  block_key  TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text'
             CHECK (value_type IN ('text','richtext','number','json','image','url','date')),
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_page_content ON page_content(page_key, block_key);

-- Ảnh chụp toàn bộ nội dung trang TRƯỚC mỗi lần lưu, để hoàn tác được.
CREATE TABLE content_revisions (
  id            TEXT PRIMARY KEY,
  page_key      TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  admin_id      TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX ix_content_rev_page ON content_revisions(page_key, created_at DESC);

CREATE TABLE media_assets (
  id          TEXT PRIMARY KEY,
  r2_key      TEXT NOT NULL,
  url         TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  alt_text    TEXT,
  uploaded_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_media_key ON media_assets(r2_key);

-- Cài đặt vận hành sửa được trong CMS. Bí mật thật (khoá webhook, khoá ký
-- phiên) KHÔNG nằm ở đây mà ở wrangler secret.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
