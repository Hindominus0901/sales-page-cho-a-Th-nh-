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


## 2b. Email — lỗ thủng lớn nhất nếu quên, và lưới đỡ cho nó

Khách trả tiền xong, hệ thống **tự động**: tạo tài khoản, cấp quyền vào khoá
`GC21`, sinh link đặt mật khẩu sống 7 ngày, rồi gửi **hai email**:

| Thư | Nội dung |
|---|---|
| `invite_app` | lời mời vào lớp, kèm link đặt mật khẩu |
| `order_paid` | xác nhận đã nhận học phí |

**Chưa đặt `RESEND_API_KEY` thì cả hai thất bại lặng lẽ.** Đã kiểm chứng, bảng
`emails_sent` ghi đúng như vậy:

```
invite_app  → failed: chua dat RESEND_API_KEY
order_paid  → failed: chua dat RESEND_API_KEY
```

Nghĩa là: **lấy tiền xong, khách không có đường nào vào lớp.**

**Lưới đỡ đã nối:** trang thanh toán có nút **"Vào lớp ngay"** — khách nhập lại
số điện thoại đã đăng ký là nhận link đặt mật khẩu ngay tại chỗ, không phụ thuộc
email. Đường dẫn `POST /api/order/:mã/vao-lop`.

> Cố ý hỏi lại số điện thoại chứ không chỉ dựa vào mã đơn: mã đơn là mã **đối
> soát**, nó nằm trong nội dung chuyển khoản và trong sao kê ngân hàng. Cấp link
> lớp học cho bất cứ ai biết mã là mở lớp cho người lạ. Sai số điện thoại và đơn
> chưa thanh toán trả **cùng một câu** — khác nhau là biến chỗ này thành công cụ
> dò xem số nào đã mua hàng.

Đã chạy thật trọn chuỗi: đăng ký → trả tiền → lấy link ở trang thanh toán → đặt
mật khẩu → đăng nhập → thấy đúng quyền `GC21`. **Không dùng email một lần nào.**

Dù vậy vẫn **nên đặt `RESEND_API_KEY`**: không có nó thì người đăng ký tài khoản
mới (không qua mua hàng) không nhận được mã OTP, và khách đóng tab trước khi bấm
"Vào lớp ngay" sẽ phải nhắn Zalo.

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

### Năm đường dẫn cũ đã nối đủ

| Trang gọi | Trạng thái |
|---|---|
| `POST /api/register` | ✓ |
| `GET /api/order/:mã` | ✓ |
| `POST /api/order/:mã/confirm` | ✓ khách tự báo đã chuyển khoản (chỉ ghi nhận, **không** đổi trạng thái đơn — tiền về hay chưa là do webhook ngân hàng nói) |
| `POST /api/order/:mã/vao-lop` | ✓ lưới đỡ giao hàng — xem mục 2b |
| `POST /api/tra-cuu` | ✓ tìm lại đơn bằng số điện thoại |

### Các trang cũ chưa nối — cần anh Thành quyết

`/hoc` · `/workshop` · `/ban-do-21-ngay` · `/ctv-dang-ky` · `/dang-nhap` ·
`/quen-mat-khau` · `/dat-lai-mat-khau`

Chúng **không vỡ**: rơi vào khu vực thành viên (SPA) chứ không phải trang 404.
Nhưng nền tảng có phần thay thế riêng cho từng cái — khu vực thành viên thay
`/hoc`, cổng `/dai-ly` thay `/ctv-dang-ky`, đăng nhập của nền tảng thay
`/dang-nhap`. **Giữ cái nào là việc cần bàn, không phải việc kỹ thuật.**

## 4. Deploy lên Cloudflare — CHƯA LÀM, và phải là anh chạy

**Trạng thái hiện tại: chưa deploy lần nào.** Bằng chứng nằm ngay trong
`wrangler.jsonc`: `database_id` và KV id đang là **mã toàn số 0** — cố ý, để bỏ
sót bước `setup:cloudflare` thì deploy hỏng to tiếng thay vì im lặng cắm vào cơ
sở dữ liệu của khách khác.

Máy chạy Claude không deploy được: chính sách mạng chặn `api.cloudflare.com`
(gateway trả 403 ngay ở bước CONNECT), và không có token Cloudflare nào.

### Đã kiểm được những gì trước khi giao

| Kiểm | Kết quả |
|---|---|
| `npm run build` (chính lệnh `npm run deploy` gọi) | ✓ chạy trọn |
| `wrangler deploy --dry-run` | ✓ đóng gói xong, 49 file tĩnh, đủ binding |
| Migration từ cơ sở dữ liệu trắng | ✓ 17 migration |
| `brand:seed` | ✓ sản phẩm GC21 · 2.000.000đ |
| Toàn bộ đường dẫn | ✓ 13/13 trả 200 |
| Trọn vòng tiền | ✓ đăng ký → QR → webhook → `paid` |
| `npm test` | ✓ 377/377 |

### Runbook — chạy trên máy anh, theo đúng thứ tự

**Bước 0 — token Cloudflare.** Tạo ở Cloudflare → My Profile → API Tokens, với
**sáu quyền GHI**:

| | | |
|---|---|---|
| Account | Workers Scripts | **Edit** |
| Account | D1 | **Edit** |
| Account | Workers KV Storage | **Edit** |
| Account | Workers R2 Storage | **Edit** |
| Account | Account Settings | Read |
| User | Memberships | Read |

Đặt vào `.env`: `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`.
`scripts/cf.mjs` đọc hai biến này rồi truyền sang wrangler — **deploy nhầm tài
khoản là không thể xảy ra**.

**Bước 1 — điền ba giá trị thật** ở mục 1 bên trên, rồi:

```bash
npm run brand:validate && npm run brand:apply
```

**Bước 2 — tạo tài nguyên.** Lệnh này ghi mã D1/KV/R2 **thật** đè lên mã số 0:

```bash
npm run setup:cloudflare
```

**Bước 3 — nạp bí mật.** Mỗi cái một lệnh, wrangler sẽ hỏi giá trị:

```bash
npm run hash-password "<mật khẩu quản trị>"    # chép kết quả cho lệnh dưới
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_SERVICE_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OTP_PEPPER
npx wrangler secret put BANK_WEBHOOK_SECRET     # PHẢI trùng giá trị bên SePay
```

Tuỳ chọn, thiếu thì tính năng tương ứng tắt chứ hệ vẫn chạy:

```bash
npx wrangler secret put RESEND_API_KEY          # không có -> không gửi được email, kể cả mã OTP đăng ký
npx wrangler secret put GOOGLE_CLIENT_ID        # không có -> tắt đăng nhập Google
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY       # không có -> không chấm bài bằng AI
```

Sinh chuỗi ngẫu nhiên:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Bước 4 — nạp dữ liệu và deploy:**

```bash
npm run db:migrate:remote
npm run brand:seed -- --remote --admin-email <email của anh Thành>
npm run deploy
```

**Bước 5 — nghiệm thu trên bản thật.** Bắt buộc, không bỏ:

1. Mở trang bán hàng, điền form, tạo một đơn.
2. **Quét mã QR và kiểm đúng số tài khoản của anh Thành.** Sai một chữ số là
   tiền sang tài khoản người khác.
3. **Chuyển thật 2.000đ** để xác minh webhook SePay và luồng đối soát đầu-cuối.
   Payload của SePay đổi tuỳ tài khoản có bật virtual sub-account hay không —
   đây là thứ duy nhất không test giả lập thay được.
4. Đăng nhập `/admin` bằng mật khẩu vừa đặt.
5. Chạy `node scripts/ra-soat-an-toan.mjs` — bộ rà soát chỉ đọc, không ghi, an
   toàn với bản thật.

**Bước 6 — tên miền.** `brand.json` đang để `useCustomDomains: false`, nên site
chạy tạm trên địa chỉ `.workers.dev`. Khi `manhthanh.net` đã nằm trong tài khoản
Cloudflare của anh Thành thì đổi thành `true` rồi `npm run brand:apply` và deploy
lại.

> **Cảnh báo:** hệ cũ ở thư mục gốc repo đang trỏ `PUBLIC_BASE_URL` về
> `https://manhthanh.net` và dùng Worker tên `goc-creator-challenge` với D1 thật
> `aab67b83-…`. **Hai hệ không được cùng chiếm một tên miền.** Quyết định cắt
> sang hệ mới lúc nào là việc anh Thành chốt, không phải việc kỹ thuật.

### CI

`.github/workflows/nen-tang.yml` ở **gốc repo** chạy trọn bộ test mỗi lần đẩy mã.
(Bản trước nằm trong `nen-tang/.github/workflows/` — GitHub không đọc thư mục đó
nên CI chưa từng chạy một lần nào, và không có gì báo là nó không chạy.)

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
