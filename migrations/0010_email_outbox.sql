-- Hộp thư đi.
--
-- Khách chuyển khoản xong đóng tab là mất dấu đơn của mình: không có email,
-- không có gì trong hộp thư để tìm lại. Hệ quả trực tiếp là anh Thành phải tra
-- tay từng người nhắn Zalo hỏi "em chuyển rồi mà sao chưa thấy gì".
--
-- KHÔNG gửi thẳng trong webhook SePay. Nhà cung cấp email chậm hoặc lỗi thì
-- webhook chậm hoặc lỗi theo, mà webhook lỗi thì SePay gửi lại — tức là lỗi
-- gửi mail biến thành lỗi ghi nhận thanh toán. Không đáng đổi. Thay vào đó
-- xếp email vào bảng này ngay trong chính db.batch() atomic đang ghi nhận đơn,
-- rồi gửi ở một lượt riêng.

CREATE TABLE email_outbox (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  to_name    TEXT,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  body_html  TEXT,

  template   TEXT NOT NULL,               -- order_paid | workshop_registered
  ref_type   TEXT,
  ref_id     TEXT NOT NULL,

  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','sent','failed','skipped')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at    INTEGER
);

-- Chốt chặn: webhook SePay gửi lại bao nhiêu lần cũng chỉ một email đi ra.
-- Cùng cách UNIQUE(order_id) chặn trả hoa hồng kép — không dựa vào việc mã
-- được viết cẩn thận, mà dựa vào việc cơ sở dữ liệu không cho phép.
CREATE UNIQUE INDEX ux_outbox_once ON email_outbox(template, ref_id);

-- Lượt gửi chỉ quét những cái còn phải gửi, nên index đặt theo đúng câu đó.
CREATE INDEX ix_outbox_pending ON email_outbox(status, attempts, created_at)
  WHERE status = 'pending';
CREATE INDEX ix_outbox_created ON email_outbox(created_at DESC);
