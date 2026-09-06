-- Tài khoản học viên.
--
-- Trước migration này, học viên vào lớp bằng một đường link bí mật gửi qua
-- email. Mất link là mất lớp, và chuyển tiếp nhầm link cho người khác là người
-- đó vào được lớp. Link vẫn giữ (học viên đang học không bị đá ra), nhưng từ
-- nay có thêm đường đăng nhập bằng email và mật khẩu.

-- ── 1. sessions phải nhận thêm vai 'student' ────────────────────────────────
--
-- CHECK không sửa được bằng ALTER trong SQLite, nên phải dựng lại cả bảng.
-- Đây là bảng phiên đăng nhập của cả quản trị lẫn cộng tác viên, nên chép
-- nguyên các dòng sang chứ không xoá — nhưng nếu có sai sót thì hậu quả xấu
-- nhất cũng chỉ là mọi người đăng nhập lại một lần.

CREATE TABLE sessions_moi (
  id           TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('admin','affiliate','student')),
  subject_id   TEXT NOT NULL,
  csrf_secret  TEXT NOT NULL,
  ip_hash      TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);

INSERT INTO sessions_moi
  (id, subject_type, subject_id, csrf_secret, ip_hash, user_agent,
   created_at, last_seen_at, expires_at, revoked_at)
SELECT id, subject_type, subject_id, csrf_secret, ip_hash, user_agent,
       created_at, last_seen_at, expires_at, revoked_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_moi RENAME TO sessions;

CREATE INDEX ix_sessions_subject ON sessions(subject_type, subject_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

-- ── 2. Học viên có mật khẩu ─────────────────────────────────────────────────

ALTER TABLE students ADD COLUMN password_hash TEXT;
ALTER TABLE students ADD COLUMN last_login_at INTEGER;

-- Email trở thành tên đăng nhập nên phải là DUY NHẤT.
--
-- Index có điều kiện WHERE: bảng này cho phép email trống (học viên do admin
-- nhập tay có thể chưa có email), và nhiều dòng NULL thì không vi phạm gì.
--
-- CÂU LỆNH NÀY SẼ THẤT BẠI nếu đang có hai học viên cùng email. Đó là hành vi
-- đúng — hai người cùng tên đăng nhập thì không ai vào được đúng lớp của mình.
-- scripts/cf-deploy.mjs dò trước và dừng lại với lời giải thích, để lỗi không
-- hiện ra dưới dạng một câu SQLite khó hiểu giữa lúc deploy.
CREATE UNIQUE INDEX ux_students_email ON students(email_norm)
  WHERE email_norm IS NOT NULL AND email_norm != '';
