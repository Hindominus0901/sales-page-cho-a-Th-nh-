-- Đặt lại mật khẩu qua email.
--
-- Trước bảng này, quên mật khẩu là ngõ cụt: admin phải nhờ người khác đặt lại
-- hộ, CTV phải nhắn Zalo cho anh Thành, và nếu người quên chính là chủ hệ
-- thống duy nhất thì cả hệ khoá cứng — chỉ còn đường deploy lại với một biến
-- môi trường đặc biệt.
--
-- LƯU BẢN BĂM, KHÔNG LƯU MÃ THÔ. Cùng lý do với mật khẩu: một bản sao database
-- rơi ra ngoài không được phép biến thành chìa khoá vào mọi tài khoản. Mã thô
-- chỉ tồn tại đúng một lần, trong email gửi đi.

CREATE TABLE password_resets (
  id           TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('admin','affiliate','student')),
  subject_id   TEXT NOT NULL,
  email        TEXT NOT NULL,            -- để nhật ký đọc được mà không phải join
  token_hash   TEXT NOT NULL,            -- HMAC-SHA256 của mã, base64url
  expires_at   INTEGER NOT NULL,
  used_at      INTEGER,
  ip_hash      TEXT,
  created_at   INTEGER NOT NULL
);

-- Đổi mã lấy quyền đặt lại là tra đúng theo cột này, nên nó phải có index —
-- và UNIQUE luôn: hai phiếu cùng bản băm nghĩa là hai phiếu cùng mã, không
-- bao giờ được phép xảy ra.
CREATE UNIQUE INDEX ux_resets_token ON password_resets(token_hash);

-- Dọn phiếu cũ trong việc chạy hằng đêm.
CREATE INDEX ix_resets_expires ON password_resets(expires_at);

-- Đếm số lần một người xin đặt lại trong ngày, để chặn kẻ spam hộp thư của họ.
CREATE INDEX ix_resets_subject ON password_resets(subject_type, subject_id, created_at DESC);
