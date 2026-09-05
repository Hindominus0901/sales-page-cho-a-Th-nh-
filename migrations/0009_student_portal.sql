-- Cổng học viên: học viên tự nộp bài thay vì gửi link qua nhóm Zalo.
--
-- KHÔNG dùng mật khẩu. Học viên khoá 21 ngày là người bận, mua một lần, học
-- ba tuần rồi thôi — bắt họ tạo tài khoản là dựng thêm một bức tường ngay
-- trước thứ mình muốn họ làm mỗi ngày. Thay vào đó mỗi enrollment có một
-- đường link riêng chứa mã ngẫu nhiên 128 bit; anh Thành copy trong trang
-- quản trị rồi gửi Zalo. Mất link thì cấp lại link mới, mã cũ chết theo.
--
-- Đánh đổi đã cân nhắc: ai có link là vào được. Với nội dung ở đây (bài tập
-- của chính học viên, số coin của họ) thì đó là mức rủi ro đúng — không có
-- tiền, không có dữ liệu người khác. Trang gắn noindex nên không lọt lên
-- Google, và mã đủ dài để không dò được.

ALTER TABLE enrollments ADD COLUMN access_token     TEXT;
ALTER TABLE enrollments ADD COLUMN token_created_at INTEGER;
ALTER TABLE enrollments ADD COLUMN last_seen_at     INTEGER;

-- Cấp mã cho những enrollment đã tồn tại. randomblob(16) = 128 bit.
UPDATE enrollments
   SET access_token = lower(hex(randomblob(16))),
       token_created_at = CAST(strftime('%s','now') AS INTEGER)
 WHERE access_token IS NULL;

CREATE UNIQUE INDEX ux_enroll_token ON enrollments(access_token);

-- Học viên giờ cũng là một loại người thao tác. Ghi họ vào nhật ký dưới danh
-- nghĩa 'system' thì sau này không còn phân biệt được việc nào do học viên
-- làm, việc nào do cron chạy — nên nới CHECK ra. SQLite không sửa được CHECK
-- tại chỗ, phải dựng lại bảng.
CREATE TABLE audit_log_new (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('admin','affiliate','student','system','webhook')),
  actor_id    TEXT,
  actor_label TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before_json TEXT,
  after_json  TEXT,
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);
INSERT INTO audit_log_new SELECT * FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX ix_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX ix_audit_actor  ON audit_log(actor_type, actor_id, created_at DESC);
CREATE INDEX ix_audit_time   ON audit_log(created_at DESC);
