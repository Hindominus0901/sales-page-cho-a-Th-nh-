-- Khoá học (cohort) và nội dung 21 ngày.
--
-- Ba chuyện được vá cùng nhau vì cùng một gốc: hệ chỉ biết MỘT khoá, và không
-- biết ngày khai giảng thuộc về khoá nào.
--
-- 1. `enrollments.cohort` có từ đầu nhưng CHƯA BAO GIỜ được ghi — câu INSERT ở
--    fulfill.ts không có cột đó. Nên mọi học viên vĩnh viễn "Chưa xếp khoá", và
--    khoá 2 không tách được khỏi khoá 1 ở bất kỳ màn hình nào.
-- 2. Bộ đếm chỗ trống trừ COUNT(*) toàn bộ đơn đã trả tiền từ trước tới nay —
--    mở bán khoá 2 là trang bán báo "hết chỗ" ngay hôm đầu.
-- 3. `started_at` = giây chuyển khoản, nên khách mua sớm 12 ngày bị hệ coi là
--    đang ở ngày 13 lúc lớp mới khai giảng, và bài ngày 1 của họ bị gắn cờ
--    "nộp muộn" — tức bị loại khỏi học bổng vì tội mua sớm.

-- Khoá đang mở bán. Mã do anh Thành đặt, ví dụ 'K1-2026-09'.
ALTER TABLE products ADD COLUMN cohort_hien_tai TEXT;

-- Ngày khai giảng của CHÍNH khoá đang mở bán, tách khỏi start_date cũ để
-- start_date vẫn dùng được cho việc hiển thị chung.
ALTER TABLE products ADD COLUMN cohort_khai_giang TEXT;   -- 'YYYY-MM-DD'

-- Số chỗ đã bán RIÊNG cho khoá hiện tại. Đặt lại về 0 khi mở khoá mới.
-- Đếm trực tiếp từ orders theo cohort thì gọn hơn, nhưng orders không có cột
-- cohort và thêm vào đó là phải sửa cả đường thanh toán — để sau.
ALTER TABLE products ADD COLUMN cohort_bat_dau_tu INTEGER;  -- unix, mốc đếm đơn

-- Nội dung 21 ngày.
--
-- Trước bảng này, nội dung khoá học KHÔNG TỒN TẠI trong hệ thống: không bảng,
-- không màn hình, không API. Học viên vào ngày 1 thấy một ô trống hỏi "link bài
-- đăng" mà không biết phải đăng gì; đề bài nằm trong nhóm Zalo, ai bỏ lỡ tin
-- nhắn ngày 7 thì không có chỗ nào tra lại.
CREATE TABLE challenge_days (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  cohort      TEXT,                      -- NULL = dùng chung cho mọi khoá
  day         INTEGER NOT NULL,          -- 1..21
  title       TEXT NOT NULL,             -- 'Tìm ngách của anh chị'
  brief       TEXT,                      -- đề bài, xuống dòng được
  video_url   TEXT,                      -- YouTube, tùy chọn
  tips        TEXT,                      -- gợi ý làm bài
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Một ngày một dòng cho mỗi khoá. COALESCE để hàng dùng chung (cohort NULL)
-- không đụng với hàng riêng của một khoá.
CREATE UNIQUE INDEX ux_challenge_days
  ON challenge_days(product_id, COALESCE(cohort, ''), day);

-- Lịch sử nhận xét.
--
-- `submissions.feedback` bị xoá về NULL mỗi lần học viên nộp lại (để team không
-- tưởng nhầm là đã xem bài mới). Hợp lý, nhưng hệ quả không ai bù: học viên mất
-- chỗ đối chiếu xem mình sửa đúng chưa, và NGƯỜI DUYỆT LẦN SAU cũng không thấy
-- mình đã yêu cầu gì lần trước — nếu là một nhân sự khác thì họ duyệt mù.
CREATE TABLE submission_reviews (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,           -- 'approve' | 'needs_work'
  feedback      TEXT,
  reviewer_id   TEXT,
  reviewer_name TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX ix_submission_reviews ON submission_reviews(submission_id, created_at);
