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
- [x] Ba trang chính sách đã có: `/chinh-sach-bao-mat`, `/dieu-khoan`,
      `/chinh-sach-hoan-tien`. Còn phải **đọc và xác nhận** — xem mục 9.

Cam kết hoàn tiền trên trang nay là **14 ngày, đã nộp ít nhất 3 bài** và nói
cùng một điều kiện ở cả ba chỗ: dòng dưới giá, câu FAQ, và trang chính sách.
Đây là điều khoản ràng buộc chứ không phải câu quảng cáo.

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

## 8. Vận hành thử thách 21 ngày

- [ ] `/admin` → Cơ chế → xác nhận các con số thưởng: 50 coin + 100 XP mỗi bài
      duyệt, thưởng chuỗi 10%/ngày (trần ×2). Màn hình tính sẵn tổng cả chặng
      21 ngày để anh Thành nhìn thấy hệ quả trước khi đổi.
- [ ] `/admin` → Quà tặng → thay 4 phần quà mẫu bằng quà thật, điền số lượng
      tồn. Quà hết tồn thì tự ẩn, không cần xoá.
- [ ] Gửi link nộp bài cho từng học viên: `/admin` → Học viên → **Chép link** →
      gửi Zalo. Không gửi thì học viên không có đường vào nộp bài. Cột bên cạnh
      ghi lần mở gần nhất nên nhìn ra ngay ai chưa từng mở.
- [ ] Dặn học viên **giữ link riêng, đừng đăng vào nhóm chung** — ai có link là
      xem được tiến độ và đổi quà của người đó. Lỡ đăng rồi thì bấm **Cấp lại**,
      mã cũ chết ngay.

## 9. Email xác nhận và ba trang chính sách

- [ ] Đọc lại ba trang `/chinh-sach-bao-mat`, `/dieu-khoan`, `/chinh-sach-hoan-tien`.
      Nội dung do máy soạn theo điều kiện đã chốt (14 ngày, đã nộp 3 bài). Đồng ý
      với từng câu thì đổi `policies.confirmed` thành `true` trong
      `site.config.json`. Còn `false` thì preflight vẫn cảnh báo mỗi lần deploy.
- [ ] Điền `contact.zalo` và `contact.email` trong `site.config.json` — trang
      chính sách hoàn tiền đang bảo khách "nhắn Zalo theo số ở chân trang", mà
      chân trang chưa có số nào.
- [ ] Đặt `RESEND_API_KEY` nếu muốn khách nhận email xác nhận đơn. Không đặt thì
      hệ vẫn chạy, chỉ là khách phải dùng `/tra-cuu` để tìm lại đơn.

## 10. Nhân sự

- [ ] Đổi mật khẩu tài khoản quản trị đầu tiên (cái sinh ra từ
      `scripts/create-admin.mjs`): `/admin` → Nhân sự → Đặt lại mật khẩu.
- [ ] Tạo **thêm một tài khoản `owner` thứ hai** trước khi giao việc cho người
      khác. Chỉ có một owner nghĩa là mất tài khoản đó là mất luôn quyền quản lý
      nhân sự, và chữa thì phải bới cơ sở dữ liệu.
- [ ] Người trực page nên để vai trò `staff` — xem và chăm lead được, nhưng
      không duyệt hoa hồng hay đổi cơ chế thưởng được.

## 11. Nên cân nhắc thêm

**Zalo ZNS chưa làm.** Zalo yêu cầu doanh nghiệp xác minh và duyệt từng mẫu tin,
mất vài ngày làm việc. Email xác nhận đã có; muốn thêm Zalo thì bảng
`email_outbox` đã để sẵn chỗ, chỉ cần viết thêm một bộ gửi.

Ngoài ra nên tắt bản deploy cũ trên Vercel sau khi cắt sang Cloudflare — gói
Hobby của Vercel không được dùng cho mục đích thương mại.
