# Nền tảng Góc Creator — việc còn phải làm

Thư mục này là **nền tảng học viên + trang bán hàng** của Góc Creator, dựng từ
template `adm-ai-funnel` (nhánh `template`) rồi đổi thương hiệu sang Góc Creator.

Hệ cũ ở thư mục gốc của repo (`src/`, `admin/`, `build/`) **vẫn còn nguyên và
vẫn chạy** — chưa bỏ gì cả. Cắt sang hệ mới khi nào xong mục 3 bên dưới.

## Đã chạy được ở máy

```
brand:check      ✓ sạch
npm run build    ✓ 5 trang, giá 2.000.000đ
tests/smoke      ✓  86/86
tests/auth       ✓  53/53
tests/platform   ✓ 238/238
                   ─────────
                   377/377
```

Chạy trên cơ sở dữ liệu mới tinh (xoá `.wrangler/state`, migrate lại, seed lại).

## 1. Ba giá trị chỉ anh Thành mới có — ĐANG LÀ SỐ 0 GIẢ

Sửa trong `brand/brand.json` rồi chạy `npm run brand:validate && npm run brand:apply`.

| Trường | Hiện tại | Cần |
|---|---|---|
| `payment.account` | `0000000000` | **Số tài khoản Techcombank thật** |
| `contact.zaloPhone` | `0000000000` | Số Zalo thật |
| `contact.zaloUrl` | `https://zalo.me/0000000000` | Link Zalo thật |
| `contact.zaloGroupUrl` | `https://zalo.me/g/chua-co` | Link nhóm Zalo thật |

> Số tài khoản đi thẳng vào mã QR khách quét để trả tiền. **Sai một chữ số là
> tiền chạy sang tài khoản người khác.** Đối chiếu hai lần trước khi deploy.

Cũng nên kiểm lại `payment.bankBin`: đang để `970407` (Techcombank).

## 2. Nội dung

- `media.heroVideo.id` — video bán hàng trang chủ. Chưa có.
- `media.fbPixelId` — Facebook Pixel. Chưa có thì quảng cáo chạy mà không đo được gì.
- `funnel.testimonials.danhSach` — 5 ô lời chứng thực, đang trống.
- `REWARD_TIERS_JSON` — chưa đặt thì trang cộng tác viên hiện "Phần thưởng sẽ
  được công bố sớm" thay cho phần thưởng thật.

## 3. Trang bán hàng — ĐÃ BÊ SANG XONG

Trang bán hàng đã hoàn thiện của anh Thành giờ **là** trang bán hàng của nền tảng.
Không phải viết lại một chữ nào.

Cách làm: giữ nguyên trang, và dựng **lớp tương thích** trong Worker
(`worker/src/routes/tuong-thich.js`) để hai đường dẫn cũ vẫn sống:

| Trang gọi | Worker trả lời |
|---|---|
| `POST /api/register` | tạo lead + đơn, trả về **đúng hình dạng cũ** |
| `GET /api/order/:mã` | tra cứu đơn, **đúng hình dạng cũ** |

Nhờ vậy `dang-ky.js` và `thanh-toan.js` **không phải sửa một chữ**. Hai hàm này
không tự làm lấy việc — chúng gọi thẳng `createLead`/`createOrder` của nền tảng
rồi dịch lại câu trả lời, nên mọi lớp bảo vệ (chặn tốc độ, kiểm cấu hình tài
khoản nhận tiền, chống tạo đơn trùng, sinh mã đơn) đều chạy nguyên vẹn.

Bộ dựng trang nằm ở `apps/funnel-gc/` (bản chép của `build/` cũ, đã đổi đường
dẫn để xuất thẳng vào `dist/public/`). Chạy:

```bash
node apps/funnel-gc/build.mjs
```

Sửa nội dung trang thì sửa `apps/funnel-gc/site.config.json` rồi dựng lại — y
như trước.

### Đã chạy trọn vòng tiền

```
POST /api/register        -> đơn GC8JHS2P, mã QR đúng ngân hàng
GET  /thanh-toan/GC8JHS2P -> 200
POST /api/webhooks/bank   -> đơn sang "paid"
GET  /api/order/GC8JHS2P  -> paid, remaining 0
```

### Đường dẫn đã nối

`/` · `/dang-ky` · `/thanh-toan` · `/thanh-toan/:mã` · `/tra-cuu` ·
`/chinh-sach-hoan-tien` · `/chinh-sach-bao-mat` · `/dieu-khoan` · `/media/*` —
tất cả trả 200. Khu vực thành viên `/dashboard` vẫn chạy song song.

### Còn thiếu ở phần này

- **`/tra-cuu` chưa nối API.** Trang mở được nhưng nút tra cứu gọi
  `POST /api/tra-cuu` — đường dẫn đó chưa có trong nền tảng. Thêm vào
  `tuong-thich.js` là xong, cùng kiểu hai hàm đang có.
- Các trang cũ khác (`/hoc`, `/workshop`, `/ban-do-21-ngay`, `/ctv-dang-ky`,
  `/dang-nhap`…) **chưa nối** — chúng thuộc hệ cũ, và nền tảng có phần thay thế
  riêng (khu vực thành viên, cổng cộng tác viên `/dai-ly`). Quyết định giữ cái
  nào là việc cần bàn, không phải việc kỹ thuật.

## 4. Deploy — phải chạy trên máy có token Cloudflare

```bash
npm install
npm run brand:validate && npm run brand:apply
npm run setup:cloudflare     # tạo D1 + KV + R2, ghi mã tài nguyên thật vào wrangler.jsonc
```

> `wrangler.jsonc` đang để **mã tài nguyên toàn số 0** cho D1 và KV. Cố ý: bỏ
> sót bước `setup:cloudflare` thì deploy hỏng to tiếng, thay vì im lặng cắm vào
> cơ sở dữ liệu của khách khác.

Rồi nạp bí mật (mỗi cái một lệnh):

```bash
npm run hash-password "<mật khẩu quản trị>"   # dán kết quả vào ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SERVICE_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OTP_PEPPER
npx wrangler secret put BANK_WEBHOOK_SECRET   # phải TRÙNG giá trị đặt bên SePay
npx wrangler secret put RESEND_API_KEY
```

Sinh chuỗi ngẫu nhiên: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Cuối cùng:

```bash
npm run brand:seed -- --remote --admin-email <email>
npm run deploy
```

Nghiệm thu: mở trang bán hàng → tạo một đơn → **quét mã QR, kiểm đúng số tài
khoản của anh Thành** → đăng nhập `/admin` bằng mật khẩu vừa đặt.

## 5. Chạy ở máy

`.env` **không có trong git** (chứa bí mật). Tạo từ `.env.example`:

```bash
cp .env.example .env
npm run hash-password "<mật khẩu>"   # dán vào ADMIN_PASSWORD_HASH trong .env
npm run db:migrate
npm run brand:seed -- --local --admin-email <email>
npm run build
npm run dev:worker                    # cổng 8787
npm test
```

> `.env` giữ `ENVIRONMENT=development`. Nhờ vậy mã OTP in ra console thay vì đòi
> `RESEND_API_KEY`, nên bộ test đăng ký chạy được mà không cần tài khoản email thật.

> **Đừng đặt** `PRODUCT_*`, `PRICE_*`, `BANK_*`, `ZALO_*`, `MAIL_FROM`,
> `APP_HOST`, `CONFIRM_VIDEO_*`, `AFFILIATE_RATE` vào `.env`. Chúng được sinh ra
> trong `wrangler.jsonc` từ `brand/brand.json`, và `.env` **đè lên** — một dòng
> rỗng ở đó xoá mất giá trị thật, mà lỗi hiện ra chỉ là "Cổng thanh toán chưa
> được cấu hình".
