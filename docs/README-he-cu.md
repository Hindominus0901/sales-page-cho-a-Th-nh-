# Góc Creator — Landing page + Backend đăng ký

Trang bán khoá **Thử thách 21 ngày** của Đỗ Mạnh Thành, kèm hệ thống nhận đăng ký,
sinh mã QR chuyển khoản (VietQR) và trang quản trị đối soát.

---

## 1. Chạy trong 3 lệnh

```bash
npm install
npm run build
npm start
```

Mở `http://localhost:3210` (landing) và `http://localhost:3210/admin` (quản trị).

---

## 2. Cấu hình bắt buộc trước khi bán thật

Mở file `.env` và điền:

| Biến | Ý nghĩa | Bắt buộc |
|---|---|---|
| `BANK_BIN` | Mã BIN ngân hàng (MB `970422`, VCB `970436`, TCB `970407`, ACB `970416`, BIDV `970418`, VietinBank `970415`, TPBank `970423`, VPBank `970432`) | ✅ |
| `BANK_ACCOUNT_NUMBER` | Số tài khoản nhận tiền | ✅ |
| `BANK_ACCOUNT_NAME` | Tên chủ tài khoản (viết hoa, không dấu) | ✅ |
| `ADMIN_PASS` | Mật khẩu vào `/admin`. **Để trống = tắt trang quản trị** | ✅ |
| `START_DATE` | Ngày khai giảng, dạng `2026-09-15` | ✅ |
| `SEATS_TOTAL` | Tổng số chỗ (mặc định 30) | |
| `SEATS_OFFSET` | Số chỗ đã bán ngoài web, cộng thêm vào bộ đếm | |
| `PUBLIC_URL` | Domain thật, vd `https://goccreator.vn` | |
| `TRUST_PROXY` | Đặt `true` khi chạy sau Nginx/Cloudflare | |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Nhận thông báo đơn mới về Telegram | |

> ⚠️ **Quét thử một lần bằng app ngân hàng thật trước khi chạy quảng cáo.**
> Mã QR được sinh cục bộ theo chuẩn VietQR/EMVCo (không gọi dịch vụ bên thứ ba),
> nhưng vẫn nên chuyển thử 2.000đ để chắc chắn đúng số tài khoản và nội dung.

---

## 3. Nội dung trang — `site.config.json`

Những chỗ trong bản thiết kế còn để `[[X]]` được điều khiển ở đây.
**Trường nào để trống thì phần đó bị ẩn khỏi trang** (không bao giờ hiện `[[X]]` cho khách).

Sau khi sửa, chạy lại `npm run build`. Script sẽ in ra danh sách những gì còn thiếu.

Các trường quan trọng:

- `legal` — tên pháp nhân, MST, địa chỉ, hotline, email.
  **Bắt buộc theo quy định TMĐT**, phải có trước khi chạy quảng cáo.
- `policies` — link 3 trang chính sách (bảo mật / điều khoản / hoàn tiền).
- `stats` — 4 ô số liệu cuối trang. Phải điền đủ 4, không thì cả khối bị ẩn.
- `scholarshipName` — tên học bổng.
- `makeupPolicy` — quy tắc nộp bù khi trễ hạn.
- `faq` — danh sách câu hỏi. Câu nào để trống phần `a` sẽ bị ẩn khỏi trang.
- `textOverrides` — sửa câu chữ trên trang theo dạng `"câu gốc": "câu mới"`,
  không cần đụng vào mã. Nếu không tìm thấy câu gốc, build sẽ báo.
- `youtube` — ID video YouTube cho từng ô (xem mục 4).
- `startDateText`, `testimonialIndustry`, `videoCaptions`, `heroVideo`.

---

## 4. Video feedback

12 video học viên đã được chuyển mã sang `public/videos/fb-01.mp4` … `fb-12.mp4`
(720×1280, H.264, faststart) kèm ảnh poster `fb-01.jpg` … `fb-12.jpg`.

Chúng được gắn tự động vào **18 ô video** của trang (4 dải thumbnail).
Bấm vào thumbnail sẽ mở trình phát toàn màn hình, chuyển video bằng phím ← →, đóng bằng Esc.

Đặt tên caption cho từng video trong `site.config.json` → `videoCaptions`.

**Thêm video mới:** bỏ file `.mp4` (720×1280) và `.jpg` cùng tên vào `public/videos/`
rồi chạy lại `npm run build`.

**Ô hero (16:9)** hiện đang phát video dài nhất làm tạm. Khi có VSL thật,
đặt file vào `public/videos/` và đổi `"heroVideo"` trong `site.config.json`.

### Dùng YouTube thay cho file mp4

Nhẹ hơn nhiều và không tốn băng thông máy chủ — **bắt buộc nếu chạy trên Vercel**:

1. Tải 12 file trong `public/videos/` lên YouTube, đặt chế độ **Không công khai** (Unlisted).
2. Dán ID video vào mục `youtube` trong `site.config.json` (dán cả link cũng được).
3. Chạy lại `npm run build`.

Ô nào có ID YouTube thì phát qua `youtube-nocookie.com`; ô nào để trống vẫn phát file mp4.
Ảnh thumbnail luôn lấy từ poster trong `public/videos/` nên chất lượng không đổi.

---

## 5. API

### Công khai

| Method | Đường dẫn | Việc |
|---|---|---|
| `GET` | `/api/config` | Giá, số chỗ còn lại, ngày khai giảng |
| `POST` | `/api/register` | Tạo đơn → trả về mã đơn + QR chuyển khoản |
| `GET` | `/api/order/:code` | Tra cứu trạng thái đơn |
| `POST` | `/api/order/:code/confirm` | Học viên báo "đã chuyển khoản" |

### Quản trị (Basic Auth)

| Method | Đường dẫn | Việc |
|---|---|---|
| `GET` | `/api/admin/stats` | Thống kê + doanh thu |
| `GET` | `/api/admin/registrations` | Danh sách đơn (lọc `?status=` `?q=`) |
| `POST` | `/api/admin/registrations/:id/status` | Đổi trạng thái `pending`/`paid`/`cancelled` |
| `POST` | `/api/admin/registrations/:id/note` | Ghi chú nội bộ |
| `GET` | `/api/admin/export.csv` | Xuất Excel (UTF-8 có BOM) |

**Chống lạm dụng:** giới hạn 8 lần đăng ký / 10 phút / IP, bẫy bot (honeypot),
gộp đơn trùng số điện thoại trong 24h, so sánh mật khẩu chống timing-attack.

---

## 6. Ba trang của website

| Đường dẫn | Việc |
|---|---|
| `/` | Trang giới thiệu. Mọi nút CTA dẫn sang `/dang-ky` — trang này **không** có form hay QR. |
| `/dang-ky` | Bước 1: điền họ tên, SĐT, email. Gửi xong tự chuyển sang bước 2. |
| `/thanh-toan?ma=GCxxxxxx` | Bước 2: mã QR + thông tin chuyển khoản + nút "Tôi đã chuyển khoản". |
| `/admin` | Trang quản trị, có Basic Auth. |

Mã đơn nằm trên đường dẫn nên khách **mở lại trang thanh toán bất cứ lúc nào** bằng chính
đường link đó. Nếu đơn đã được xác nhận, trang tự chuyển sang màn hình "Đã nhận được học phí".

## 7. Quy trình bán hàng

1. Khách bấm nút trên trang chủ → sang `/dang-ky`, điền thông tin.
2. Hệ thống tạo mã đơn `GCxxxxxx` → chuyển sang `/thanh-toan` với QR đúng số tiền và nội dung.
3. Khách quét QR chuyển khoản, bấm **"Tôi đã chuyển khoản"**.
4. Thành mở `/admin`, đối chiếu sao kê ngân hàng theo mã đơn trong nội dung CK.
5. Bấm **"Đã nhận tiền"** → đơn chuyển sang `paid`, số chỗ còn lại tự giảm.
6. Nhắn Zalo gửi link vào nhóm (số điện thoại trong bảng bấm được để mở Zalo).

Đối soát đang làm **thủ công**. Muốn tự động thì tích hợp thêm dịch vụ đọc biến động
số dư (Casso, SePay…) rồi gọi vào `setStatus()` trong `server/db.js`.

---

## 8. Bản demo đang chạy trên Vercel

- Trang: https://goc-creator-challenge-hieupwork-1893s-projects.vercel.app
- Mã nguồn: https://github.com/Hindominus0901/goc-creator-challenge (repo riêng tư)
- Đẩy lên nhánh `main` là Vercel tự deploy lại.

**Đang ở chế độ demo** vì chưa gắn database. Ở chế độ này:

- Trang hiện băng cảnh báo màu cam ở trên cùng
- Đăng ký vẫn ra mã đơn và mã QR, nhưng **không được lưu lại**
- Số tài khoản là `0000000000` (số giả, không chuyển tiền vào đâu được)
- Trang `/admin` trả về 503 vì chưa đặt `ADMIN_PASS`

### Chuyển từ demo sang chạy thật

1. Vercel → project → **Storage** → Create Database → **Neon Postgres** → gắn vào project.
   Vercel tự thêm biến `DATABASE_URL`.
2. Vercel → **Settings → Environment Variables**, thêm:
   `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `BANK_BIN`, `ADMIN_PASS`, `START_DATE`.
3. Deploy lại. Có `DATABASE_URL` là hệ thống **tự thoát chế độ demo**, băng cảnh báo biến mất,
   bảng dữ liệu được tạo tự động ở lần chạy đầu.

> Tài khoản Vercel đang ở gói Hobby. Theo điều khoản của Vercel, gói này dành cho mục đích
> phi thương mại — nếu chạy bán thật thì cần nâng lên Pro.

### Ba cái bẫy của vercel.json (đã xử lý, đừng sửa lại)

1. **`cleanUrls: true` là bắt buộc.** Không có nó thì `/dang-ky` trả về trang chủ,
   vì Vercel không tự map sang `dang-ky.html`. Dưới máy không lộ lỗi này vì
   Express có `extensions: ['html']`.
2. **Đích rewrite phải là `/api`, không phải `/api/index.js`.** `cleanUrls` bỏ đuôi `.js`
   nên đích cũ không còn khớp và mọi API trả 404.
3. **Không thêm khoá lạ vào `vercel.json`.** Vercel kiểm tra theo schema và loại thẳng
   deploy ngay trước khi build, không để lại log nào để lần ra.

---

## 9. Triển khai lên máy chủ

Cần một máy chủ chạy Node liên tục (VPS, Render, Railway, Fly.io) — **không dùng được
hosting tĩnh** vì có database và API.

```bash
npm ci --omit=dev
npm run build
NODE_ENV=production node server/index.js
```

Sau đó đặt Nginx/Caddy phía trước để chạy HTTPS, và bật `TRUST_PROXY=true`.

Dữ liệu nằm ở `data/app.db` (SQLite) — **nhớ backup file này định kỳ**.

Nếu muốn tách: `public/` có thể đẩy lên CDN tĩnh, chỉ cần `/api/*` trỏ về máy chủ Node.
Riêng thư mục `public/videos/` khoảng 90 MB, nên để CDN phục vụ cho nhẹ máy chủ.

---

## 10. Cấu trúc thư mục

```
web/
├── site.config.json      Nội dung trang (điền [[X]] ở đây)
├── .env                  Cấu hình bí mật (không commit)
├── build/
│   ├── build.mjs         Script dựng 3 trang HTML từ file thiết kế
│   ├── transcode.sh      Chuyển mã video gốc sang định dạng web
│   └── partials/         Form, CSS, JS, lightbox của từng trang
├── design/               File thiết kế gốc (.dc.html) + bản handoff
├── api/index.js          Điểm vào cho Vercel Serverless
├── vercel.json           Cấu hình định tuyến trên Vercel
├── server/
│   ├── index.js          Express app
│   ├── config.js         Đọc .env
│   ├── db.js             SQLite (node:sqlite, không cần biên dịch)
│   ├── lib/vietqr.js     Sinh payload VietQR + CRC-16
│   ├── lib/validate.js   Kiểm tra form, chuẩn hoá SĐT
│   └── routes/           API công khai + quản trị
├── public/
│   ├── index.html        Trang giới thiệu   (build sinh ra — đừng sửa tay)
│   ├── dang-ky.html      Bước 1: form        (build sinh ra)
│   ├── thanh-toan.html   Bước 2: mã QR       (build sinh ra)
│   ├── admin.html        Trang quản trị
│   ├── media/            Ảnh Thành + ảnh chụp feedback
│   └── videos/           12 video feedback + poster
└── data/app.db           Database (tự tạo khi chạy)
```

> `public/index.html` là **file sinh tự động**. Muốn đổi nội dung thì sửa
> `site.config.json` hoặc `build/partials/`, rồi `npm run build`.
