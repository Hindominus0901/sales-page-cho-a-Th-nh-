# Việc cần làm trước khi chạy quảng cáo

Danh sách này cũng chính là những gì `npm run build:pages` in ra cảnh báo —
chạy build sau khi điền để kiểm tra lại.

## 1. Chặn hoàn toàn — không làm thì không bán được

- [ ] **Số tài khoản nhận tiền.** `SEPAY_ACCOUNT_NO` trong `wrangler.jsonc` →
      `env.production.vars`. Bỏ trống thì trang thanh toán báo lỗi.
- [ ] **Khoá webhook SePay.** `npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env production`,
      giá trị lấy trong SePay → Tích hợp webhook.
- [ ] **Chuyển thật 2.000đ** để xác minh shape payload webhook và luồng đối
      soát đầu-cuối. Payload của SePay đổi tuỳ tài khoản có bật virtual
      sub-account hay không.

## 2. Bắt buộc theo luật thương mại điện tử

- [ ] `legal` trong `site.config.json`: tên công ty (CÔNG TY TNHH THƯƠNG MẠI &
      DỊCH VỤ ANLIFE GROUP), mã số thuế, địa chỉ, hotline, email, và
      `mocNotified` khi đã thông báo Bộ Công Thương.
- [ ] `policies` — link ba trang chính sách: bảo mật, điều khoản, **hoàn tiền**.

Trang đang in cam kết **"14 ngày hoàn 100%, không cần lý do"**. Đây là điều
khoản ràng buộc chứ không phải câu quảng cáo — phải có trang chính sách thật
đứng sau, và anh Thành xác nhận đúng ý trước khi chạy quảng cáo.

## 3. Nội dung thật còn thiếu

- [ ] `stats` — 4 ô số liệu cuối trang (khoá đã chạy / học viên / người về đích
      / bài Thành đã sửa). **Thiếu 1 trong 4 thì cả khối bị ẩn.**
- [ ] `startDateText` và ngày khai giảng trong `/admin` → Cài đặt.
- [ ] `testimonialIndustry` — ngành nghề dùng trong một câu testimonial.
- [ ] FAQ *"Lớp học vào khung giờ nào, học trên nền tảng gì?"* — đang bỏ trống
      nên câu này bị ẩn khỏi trang.
- [ ] `logo.src` — bỏ file logo vào `public/media/` rồi ghi tên vào đây.
- [ ] `contact.zalo` và `contact.email` — hiện ở chân trang.

## 4. Bản nháp cần xác nhận

- [ ] `makeupPolicy` — chính sách nộp bù khi trễ hạn. Bản nháp hiện tại: nộp bù
      trong 48h, báo trước qua Zalo, không ảnh hưởng gì ngoài điều kiện học
      bổng. Xác nhận rồi xoá dòng `_makeupPolicyNhap`.
- [ ] `scholarshipName` đang là "Gương sáng hiếu học" — xác nhận đúng chính tả.

## 5. Video feedback

Repo chỉ giữ 12 ảnh poster; file `.mp4` không mang lên được vì Workers Assets
giới hạn 25 MB/file (`fb-01.mp4` nặng 24,5 MB).

- [ ] Tải 12 video lên YouTube, đặt **Không công khai (Unlisted)**.
- [ ] Dán ID (hoặc cả link) vào `site.config.json` → `youtube`.
- [ ] `npm run build:pages`.

Chưa làm thì 18 ô video trên trang vẫn hiện poster nhưng bấm vào không phát
được gì.

## 6. Lead magnet Bản Đồ 21 Ngày

- [ ] File PDF "Bản Đồ 21 Ngày" — **chưa tồn tại**, cần thiết kế riêng.
- [ ] `/admin` → Cài đặt → điền link tải và link nhóm Zalo.

Chưa điền thì sau khi để lại thông tin, khách chỉ thấy lời cảm ơn — phễu đứt ở
đây. Trang vẫn chạy, không lỗi.

## 7. Workshop

- [ ] `/admin` → Workshop → tạo buổi, điền link Zoom, ID phòng, link nhóm Zalo.

Trang `/workshop` tự lấy buổi sắp diễn ra gần nhất. Chưa có link Zoom thì khách
đăng ký xong không thấy nút vào phòng.

## 8. Nên cân nhắc thêm

Hiện **không có email hay SMS xác nhận** — theo quyết định "không cần thông
báo, xem trong CMS". Hệ quả: link Zoom và xác nhận mua hàng chỉ tồn tại trên
trang cảm ơn, ai đóng tab sau khi chuyển khoản là mất dấu vết đơn hàng của
mình. Schema cố ý chưa có bảng gửi email, nhưng thêm vào là thuần bổ sung,
không phá gì đang chạy.

Ngoài ra nên tắt bản deploy cũ trên Vercel sau khi cắt sang Cloudflare — gói
Hobby của Vercel không được dùng cho mục đích thương mại.
