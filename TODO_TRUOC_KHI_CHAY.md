# Việc cần a Thành xác nhận trước khi chạy quảng cáo

Cập nhật sau buổi polish trang đăng ký 21 ngày + xây trang lead magnet (31/08/2026).
Danh sách này cũng chính là những gì `npm run build` sẽ in ra cảnh báo — chạy build
sau khi điền để kiểm tra lại.

## 1. Bắt buộc theo luật (trang có thanh toán)

Điền vào `site.config.json` → `legal`: `company`, `taxId`, `address`, `hotline`, `email`.
Thiếu thì trang **không được hiện thông tin pháp nhân** ở footer — bắt buộc phải có
trước khi chạy quảng cáo theo quy định TMĐT.

## 2. Thông tin thật còn thiếu (site.config.json)

- `stats` — 4 số liệu cuối trang (khoá đã chạy / học viên / người về đích / bài đã sửa).
  Thiếu 1 trong 4 thì cả khối bị ẩn.
- `startDateText`, và biến `START_DATE` trong `.env` — ngày khai giảng thật.
- `testimonialIndustry` — ngành nghề dùng trong 1 câu testimonial.
- `policies` — 3 link chính sách (bảo mật / điều khoản / hoàn tiền). Chưa có thì
  3 link ở footer bị ẩn.
- FAQ "Lớp học vào khung giờ nào, học trên nền tảng gì?" — để trống vì không biết
  lịch học thật và nền tảng dùng (Zoom? Google Meet?). Điền câu trả lời vào `faq`
  trong `site.config.json`.

## 3. Bản nháp cần a Thành duyệt lại (đã điền tạm để trang không bị trống)

- `makeupPolicy` — chính sách nộp bù khi trễ hạn. Bản nháp: nộp bù trong 48h, báo
  trước qua Zalo, không ảnh hưởng gì ngoài điều kiện học bổng. README gốc ghi
  chính sách này "chưa chốt" — xác nhận lại rồi xoá dòng `_makeupPolicyNhap`
  trong `site.config.json`.
- FAQ "hoàn tiền" — đã viết theo cam kết **14 ngày hoàn 100%, không cần lý do**
  (đúng như quyết định trong `claude/01-chien-luoc-he-thong.md`). Câu này cũng được
  thêm thành 1 dòng nhỏ ngay dưới nút "Đăng ký giữ chỗ" ở trang chủ. Xác nhận lại
  với a Thành rằng cam kết này đúng ý trước khi chạy quảng cáo — đây là điều khoản
  ràng buộc, không phải câu quảng cáo.
- `scholarshipName` đã điền "Gương sáng hiếu học" theo tên đã chốt trong
  `claude/02-rmbc-content-ai-system.md`. Xác nhận đúng chính tả/tên chính thức.

## 4. Trang lead magnet mới — `/ban-do-21-ngay`

Trang mới, xin tên + Zalo (+ email tuỳ chọn) để đổi lấy tài liệu "Bản Đồ 21 Ngày",
theo đúng phễu đã chốt: lead magnet 0đ → sự kiện 3 buổi (Content AI System Summit)
→ cohort 2tr. Trang **chưa được gắn link vào trang chủ** — dùng để chạy quảng cáo
riêng, dẫn traffic thẳng vào `/ban-do-21-ngay`.

Cần điền 2 biến trong `.env` trước khi chạy quảng cáo cho trang này:

- `LEAD_MAGNET_URL` — link tải file Bản Đồ 21 Ngày (PDF/Google Drive). File PDF
  thật **chưa được tạo** — cần thiết kế/viết nội dung riêng, ngoài phạm vi trang web.
- `LEAD_MAGNET_ZALO_URL` — link vào nhóm Zalo hoặc trang đăng ký sự kiện 3 buổi.

Chưa điền thì sau khi để lại thông tin, khách chỉ thấy lời cảm ơn, không có nút
tải/vào nhóm — trang vẫn chạy được, không lỗi, nhưng phễu bị đứt ở đây.

Nội dung trang (tiêu đề, gạch đầu dòng, câu cảm ơn) nằm ở `site.config.json` →
`leadMagnet`, sửa được mà không cần đụng code, y như các phần khác của trang.

## 5. Backend/dashboard cho lead — đã xây xong

- Bảng `leads` mới trong cùng database (Postgres khi deploy Vercel, SQLite khi
  chạy máy nhà/VPS) — không cần thêm dịch vụ ngoài.
- `POST /api/leads` — API công khai nhận đăng ký từ trang lead magnet.
- `/admin` — thêm tab "Lead — Bản Đồ 21 Ngày" cạnh tab đăng ký khoá học, có ô tìm
  kiếm, ghi chú nội bộ, và nút "Tải CSV" riêng cho leads.
- Thẻ số liệu tổng quan có thêm "lead Bản Đồ 21 Ngày".

## 6. Trước khi deploy bản này

Các file **mã nguồn** đã sửa (`server/`, `build/`, `site.config.json`, `public/admin.html`,
`.env.example`, `.env`) đã được cập nhật trực tiếp trong folder `web/` trên máy.
File **HTML đã build sẵn** trong `public/` (`index.html`, `dang-ky.html`,
`thanh-toan.html`, `ban-do-21-ngay.html`) **CHƯA được ghi đè** — máy làm việc
(môi trường của Claude) không có ảnh/video thật của a Thành nên bản build ở đó
thiếu ảnh. Trước khi deploy: chạy `npm run build` ngay trên máy đang có đủ
`public/media/` + `public/videos/` để trang mới ra đúng ảnh/video thật, rồi mới
`git commit` / push lên Vercel.
