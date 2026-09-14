# Nền tảng bán hàng + cộng đồng học viên — bản template

Một hệ thống chạy trên Cloudflare, gồm hai mặt:

- **Trang bán hàng** (`/`, `/dang-ky`, `/xac-nhan`, `/vip`, `/thanh-toan`) — đăng ký, chấm điểm khách
  tiềm năng, tạo đơn kèm mã VietQR, tự xác nhận khi tiền về, và chương trình giới thiệu có hoa hồng.
- **Cộng đồng học viên** — tài khoản thật, XP và xu, cấp bậc, huy hiệu, thử thách, lớp học, feed,
  đổi quà, và một cổng quản trị.

Đây là **bản template**: mọi giá trị của thương hiệu nằm trong đúng một file, `brand/brand.json`.
Không có tên, giá, số tài khoản hay ảnh của ai được viết cứng trong mã.

---

## Luật vàng

> Giá trị của khách chỉ sống ở **`brand/brand.json`**. Không bao giờ gõ tên, giá, số điện thoại,
> số tài khoản, màu hay tên miền vào bất kỳ file nào khác.

Những file dưới đây được **sinh ra** từ nó — sửa tay là mất khi chạy lại:

| File sinh ra | Chứa gì |
|---|---|
| `wrangler.jsonc` (3 vùng `BRAND:*`) | tên Worker, tên miền, toàn bộ `vars` |
| `.env` (vùng `# <<< BRAND`) | bản sao của các giá trị trên cho lúc chạy ở máy |
| `worker/src/routes.generated.js` | bảng đường dẫn trang bán hàng |
| `apps/web/src/brand.generated.css` | biến màu của khu vực thành viên |
| `apps/web/src/brand.generated.js` | tên, logo, link liên hệ cho React |
| `apps/web/index.html` | tiêu đề tab, màu thanh địa chỉ |
| `package.json` | `name`, `description` |

```bash
npm run brand:validate   # kiểm brand.json, báo lỗi bằng tiếng người
npm run brand:apply      # sinh lại tất cả file trên
npm run brand:check      # quét dấu vết thương hiệu cũ (chạy trước mọi lần deploy)
npm run brand:seed       # nạp sản phẩm + tài khoản quản trị vào cơ sở dữ liệu
```

---

## Dựng site mới, từ đầu đến cuối

```bash
npm install                      # Node >= 22
cp brand/brand.json.example brand/brand.json   # rồi điền thông tin thương hiệu
npm run brand:validate
npm run brand:apply
npm run hash-password "mật khẩu quản trị"      # dán vào .env: ADMIN_PASSWORD_HASH

npm run db:migrate               # tạo bảng trong cơ sở dữ liệu ở máy
npm run brand:seed -- --local --admin-email ban@example.com
npm run build
npm run dev:worker               # backend + trang bán hàng: localhost:8787
npm test                         # 323 bài kiểm tra (tự bật dev:worker nếu chưa có)

# Lên bản thật:
npm run setup:cloudflare         # tạo D1 + KV + R2, chạy migration, liệt kê bí mật còn thiếu
npm run brand:seed -- --remote --admin-email ban@example.com
npm run deploy
```

`npm run dev:web` (cổng 5173) chỉ để sửa giao diện cho nhanh; nó gọi API sang cổng 8787. Muốn xem
đúng như bản thật thì `npm run build` rồi mở `localhost:8787`.

### Ảnh

Template không đi kèm ảnh nào — ảnh chân dung, ảnh lớp học và ảnh kết quả đều là ảnh người thật.
Thả file của bạn vào `apps/funnel/assets/` đúng tên ghi trong `apps/funnel/assets/README.txt`.
Thiếu ảnh nào thì bước build tự dùng ảnh giữ chỗ và **in ra danh sách còn thiếu** — không có ô vỡ.

---

## Những thứ một con người phải tự làm

Agent không làm thay được, vì đều cần tài khoản hoặc giấy tờ:

| Việc | Vì sao | Thiếu thì sao |
|---|---|---|
| Tài khoản Cloudflare + API token (Workers/D1/KV/R2 **Edit**, Zone **Read**) | tạo tài khoản, thanh toán | **không deploy được** |
| Tên miền đã trỏ nameserver về Cloudflare | mua tên miền ở nhà đăng ký | vẫn chạy được trên `.workers.dev` |
| Resend API key + **xác minh tên miền gửi thư** (bản ghi DKIM) | Resend bắt xác minh thủ công | **không ai đăng ký được** (không nhận được mã) |
| Tài khoản ngân hàng + SePay/Casso + webhook | KYC ngân hàng | **không nhận tiền tự động được** |
| Google OAuth client + redirect URI | Google Console | vẫn đăng nhập bằng email/OTP được |
| Facebook Pixel ID | Business Manager | không đo được quảng cáo |
| Video bán hàng đã tải lên (Wistia/YouTube) | nội dung | trang chủ không có video |
| Kit (ConvertKit) API key | tài khoản | không chạy chuỗi email tự động |
| **Luật sư rà 2 trang pháp lý** | trách nhiệm pháp lý | không nên mở bán |

Token Cloudflare cần **quyền GHI**, không phải chỉ đọc:

| | | |
|---|---|---|
| Account | Workers Scripts | **Edit** |
| Account | D1 | **Edit** |
| Account | Workers KV Storage | **Edit** |
| Account | Workers R2 Storage | **Edit** |
| Account | Account Settings | Read |
| Zone | Zone | Read |
| User | Memberships | Read |

> Tài khoản Cloudflare nên đứng tên **khách hàng**, rồi mời mình vào làm thành viên. Workers và D1
> **không chuyển được** giữa hai tài khoản — xây ở tài khoản mình rồi tính bàn giao sau là phải xuất
> dữ liệu ra nhập lại.

---

## Thư mục

```
brand/           brand.json (nguồn sự thật), denylist.json, assets/
apps/web/        Giao diện cộng đồng (React + Vite). Xem apps/web/API.md
apps/funnel/     Trang bán hàng: designs/ (.dc.html), static/, build.mjs
worker/          Backend chạy trên Cloudflare Workers
  migrations/    Cấu trúc cơ sở dữ liệu — CHỈ có cấu trúc, nội dung do brand:seed
scripts/brand/   validate · apply · seed · check
tests/           3 bộ, 323 bài. `npm test` tự lo `wrangler dev` ở cổng 8787
```

## Những chỗ dễ vấp

- **Bộ test cần server đang chạy.** `npm test` gọi vào `localhost:8787`; không có `npm run dev:worker`
  thì mọi bài đều đỏ vì lý do không liên quan gì tới mã.
- **Chạy tuần tự, đừng chạy song song.** Ba bộ test dùng chung một cơ sở dữ liệu ở máy và đều kết
  thúc bằng lệnh `DELETE` để dọn; chạy chồng nhau là chúng xoá dữ liệu của nhau giữa chừng và báo
  lỗi hoàn toàn giả.
- **`auth.mjs` và `platform.mjs` chỉ chạy được ở máy.** Chúng đọc/ghi thẳng vào D1 cục bộ và có lệnh
  `DELETE` dọn dẹp — **không bao giờ** trỏ chúng vào cơ sở dữ liệu thật. `smoke.mjs` thì chạy được
  với bản đã deploy.
- **Đổi bộ câu hỏi khảo sát phải sửa hai nơi**: `worker/src/questions.js` (điểm) và thuộc tính
  `name="q1..q8"` trong `apps/funnel/designs/2-form.dc.html` (form). Lệch nhau thì chấm điểm sai mà
  không báo lỗi gì.
- **File `.dc.html` là bản xuất từ Claude Design.** Xuất lại là mất token `[[brand.*]]` và biến màu
  `var(--brand)`. Bộ token cố ý giữ nhỏ (11 cái) để còn nhớ mà đặt lại.
- **Sao lưu**: D1 có Time Travel 30 ngày — `wrangler d1 time-travel restore`.
