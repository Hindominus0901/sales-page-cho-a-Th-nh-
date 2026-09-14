-- Moi buoc co mot chuoi email rieng.
--
-- Truoc day chi co "chuoi chao mung" va chi thanh vien DA CO TAI KHOAN moi vao
-- duoc. Nguoi de lai thong tin o trang ban hang - nhom dong nhat va can nuoi
-- duong nhat - chi duoc gan tag roi thoi.

INSERT OR IGNORE INTO app_settings
  (id, key, value, type, options_json, category, label, description, sort_order, created_date, updated_date)
VALUES
 ('st-kit-seq-lead', 'kit_sequence_lead', '', 'string', NULL, 'kit',
  'Chuỗi email cho người vừa để lại thông tin',
  'Gửi ngay sau khi có người điền form ở trang bán hàng, dù họ chưa tạo tài khoản. Để trống thì chỉ gắn tag, không đưa vào chuỗi nào.',
  65, datetime('now'), datetime('now')),

 ('st-kit-seq-cus', 'kit_sequence_customer', '', 'string', NULL, 'kit',
  'Chuỗi email chăm sóc sau khi mua',
  'Gửi sau khi ngân hàng báo đã nhận được tiền. Dùng để hướng dẫn bắt đầu, nhắc vào nhóm, xin cảm nhận.',
  66, datetime('now'), datetime('now'));
