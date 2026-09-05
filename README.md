# Góc Creator — 3 trang bán hàng + CMS + hệ affiliate

Chạy trên Cloudflare Workers. Một codebase, một lần deploy.

| Đường dẫn | Việc |
|---|---|
| `/` | Trang bán **Thử thách 21 ngày** (2.000.000đ) |
| `/workshop` | Đăng ký **workshop Zoom miễn phí** — thay hoàn toàn Google Form |
| `/ban-do-21-ngay` | Lead magnet **Bản Đồ 21 Ngày** (0đ) |
| `/dang-ky` → `/thanh-toan/<mã>` | Điền thông tin → QR chuyển khoản, tự nhận biết khi tiền về |
| `/admin` | Trang quản trị |
| `/aff` | Portal cộng tác viên |
| `/r/<mã CTV>` | Link giới thiệu rút gọn |

---

## 1. Chạy trên máy

```bash
npm install
npm run db:migrate          # tạo bảng trong D1 cục bộ
npm run db:seed             # sản phẩm + cài đặt mặc định
npm run build               # dựng 5 trang HTML + 2 SPA
cp .dev.vars.example .dev.vars   # rồi điền các khoá bên trong
npm run dev                 # http://localhost:8787
```

Tạo tài khoản quản trị đầu tiên (mật khẩu in ra **một lần**):

```bash
node scripts/create-admin.mjs --email thanh@goccreator.vn --name "Đỗ Mạnh Thành"
```

---

## 2. Kiểm chứng

```bash
npm run typecheck     # TypeScript
npm test              # 73 unit test: chấm điểm lead, trích mã đơn, so tên, chuỗi ngày, thứ hạng
npm run test:flows    # 13 kịch bản thanh toán thật qua HTTP (cần npm run dev)
npm run test:admin -- --email <email> --password <mật khẩu>
npm run test:student  # cổng học viên: nộp bài, nộp lại, khoá bài đã duyệt, đổi quà
```

`test:flows` phủ đúng những chỗ dễ mất tiền: webhook gửi lại, chuyển thiếu rồi
chuyển nốt, chuyển thừa, nội dung chuyển khoản bị ngân hàng cắt xén, sai khoá
webhook, đơn hết hạn trả muộn, CTV tự mua, và CTV thứ hai cướp quy kết.

---

## 3. Deploy lên Cloudflare

### Một câu lệnh

```bash
npx wrangler login          # một lần duy nhất, mở trình duyệt rồi bấm Allow
npm run cf:preview          # dựng preview: goc-creator-preview.workers.dev
```

Xong preview và đã chuyển thật 2.000đ kiểm chứng SePay thì cắt sang thật:

```bash
npm run cf:prod
```

Script tự làm hết, và **chạy lại được nhiều lần** — lần hai không tạo trùng tài
nguyên, không sinh lại khoá, không nạp đè dữ liệu:

| Bước | Script làm gì |
|---|---|
| Tài nguyên | Tạo D1, KV, R2 nếu chưa có. Đã có thì dùng lại. |
| `wrangler.jsonc` | Tự điền `database_id` và id KV vào đúng khối môi trường, giữ nguyên chú thích trong file. |
| Khoá bí mật | Sinh `SESSION_SECRET` và `IP_HASH_SALT` **chỉ khi chưa có** — sinh lại là đá văng mọi người đang đăng nhập. Đẩy qua stdin, không ghi ra file. |
| Soát cấu hình | Chạy `scripts/preflight.mjs`, **dừng hẳn** nếu thiếu thứ khiến hệ không nhận được tiền. |
| Migration | `d1 migrations apply --remote`. Nạp dữ liệu nền chỉ khi database còn trắng. |
| Deploy | `npm run build` rồi `wrangler deploy`. |
| Tài khoản | Tạo admin nếu chưa có ai (thêm `-- --email <email>`). |

Cuối cùng script in ra đủ đường dẫn cần dùng, gồm **URL webhook để dán vào SePay**.

### Thứ script KHÔNG tự làm được

Hai thứ phải tự điền, vì chúng nằm ở tài khoản ngân hàng và tài khoản SePay:

```jsonc
// wrangler.jsonc → env.preview.vars (và env.production.vars)
"SEPAY_ACCOUNT_NO": "<số tài khoản Techcombank của ANLIFE GROUP>",
```

```bash
npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env preview
```

Thiếu một trong hai thì `preflight` **chặn deploy**, kèm giải thích vì sao — chứ
không để deploy thành công rồi phát hiện lúc có người chuyển tiền thật.

Muốn soát trước mà chưa deploy:

```bash
npm run preflight
```

### Ba lỗi hay gặp

**`Wrangler chưa đăng nhập Cloudflare`** — chạy `npx wrangler login`. Nếu máy
không mở được trình duyệt thì dùng API token: tạo token quyền *Edit Workers* ở
dashboard rồi `export CLOUDFLARE_API_TOKEN=...` trước khi chạy.

**`Không kết nối được tới api.cloudflare.com`** — mạng công ty hoặc VPN đang
chặn. Đây là lỗi mạng, không phải lỗi đăng nhập; đăng nhập lại bao nhiêu lần
cũng không hết.

**Có nhiều KV namespace cùng khớp** — tài khoản đang có mấy namespace tên na ná
nhau từ lần thử trước. Script không đoán bừa; vào dashboard xoá bớt, hoặc điền
tay id đúng vào `wrangler.jsonc`.

### Cách thứ hai: không cần terminal

Nếu không muốn cài Node trên máy, dựng bằng dashboard Cloudflare rồi để GitHub
tự deploy:

1. **Workers & Pages → D1** → tạo `goc-creator-preview`, chép `Database ID`.
2. **Workers & Pages → KV** → tạo một namespace, chép `ID`.
3. **R2** → tạo bucket `goc-creator-media-preview`.
4. Dán ba id vào `wrangler.jsonc` → `env.preview` (sửa thẳng trên GitHub cũng được).
5. **Workers & Pages → Create → Connect to Git**, chọn repo này, lệnh build
   `npm run build`, rồi đặt các khoá bí mật trong phần Settings → Variables.

Từ đó mỗi lần push lên nhánh là Cloudflare tự build và deploy. Dựng lâu hơn,
nhưng sau đó không phải gõ lệnh nào nữa.

---

## 4. Cấu hình SePay

1. Đăng ký SePay, kết nối tài khoản Techcombank của ANLIFE GROUP.
2. Tích hợp → Webhook → thêm endpoint:
   - URL: `https://<domain>/api/webhooks/sepay`
   - Kiểu xác thực: **API Key**, giá trị đúng bằng `SEPAY_WEBHOOK_API_KEY` ở trên.
3. **Chuyển thật 2.000đ** vào tài khoản, nội dung ghi một mã đơn có thật.
4. Vào `/admin` → **Nhật ký** kiểm tra webhook đã tới, và **Giao dịch chưa khớp**
   xem có rơi vào đó không.

> ⚠️ Shape payload của SePay đổi tuỳ tài khoản có bật virtual sub-account hay
> không. Toàn bộ payload gốc luôn được ghi vào bảng `webhook_events` trước khi
> xử lý, nên nếu shape khác dự đoán thì **không mất dữ liệu** — đọc lại bảng đó
> rồi chỉnh nhánh ghép đơn trong `src/routes/webhook-sepay.ts`.

### Vì sao gõ đúng nội dung chuyển khoản lại quan trọng

Hệ thống khớp giao dịch với đơn bằng mã đơn (`GC` + 6 ký tự) trong nội dung
chuyển khoản. Mã dùng bảng chữ bỏ các ký tự dễ nhầm (B I O S U 0 1 2 5 8) và
nội dung được bỏ dấu, viết hoa, lọc ký tự lạ trước khi dò — nên sống sót qua
việc ngân hàng cắt xén và chèn thêm chữ.

Không đọc được mã thì có một nhánh dự phòng: khớp đúng số tiền với **duy nhất
một** đơn đang chờ trong 48h mà 4 số cuối điện thoại xuất hiện trong nội dung.
Đòi cả ba điều kiện vì ghép nhầm đơn tệ hơn nhiều so với để giao dịch chưa
khớp — chưa khớp thì admin gán tay một cú bấm, còn ghép nhầm thì hai người cùng
sai và có thể phát sinh hoa hồng cho nhầm CTV.

---

## 5. Việc anh Thành cần làm trước khi chạy quảng cáo

### Bắt buộc theo luật thương mại điện tử

Điền `legal` trong `site.config.json`: tên công ty, mã số thuế, địa chỉ,
hotline, email, và đánh dấu đã thông báo Bộ Công Thương. **Thiếu thì không được
chạy quảng cáo.**

### Ba trang chính sách

`policies` trong `site.config.json` — bảo mật, điều khoản, và **hoàn tiền**.
Trang đang in cam kết "14 ngày hoàn 100%, không cần lý do": đây là điều khoản
ràng buộc, không phải câu quảng cáo, nên phải có trang chính sách thật đứng sau.

### 12 video feedback

Repo chỉ giữ ảnh poster. File `.mp4` không mang lên được vì Workers Assets giới
hạn 25 MB/file (`fb-01.mp4` nặng 24,5 MB) và tổng 112 MB thì mỗi lần deploy phải
đẩy lại toàn bộ.

1. Tải 12 file lên YouTube, đặt **Không công khai (Unlisted)**.
2. Dán ID (hoặc cả link) vào `site.config.json` → `youtube`.
3. `npm run build:pages`.

Ô nào có ID thì phát qua `youtube-nocookie.com`; ô nào trống vẫn hiện poster.
Thumbnail luôn lấy từ poster nên chất lượng ảnh không đổi.

### Số liệu còn trống

Chạy `npm run build:pages`, script in ra đúng danh sách còn thiếu:

- `stats` — 4 ô số liệu cuối trang. **Thiếu 1 trong 4 là cả khối bị ẩn.**
- `startDateText` và ngày khai giảng trong `/admin` → Cài đặt.
- `testimonialIndustry` — ngành nghề trong một câu testimonial.
- FAQ "Lớp học vào khung giờ nào, học trên nền tảng gì?" — đang bỏ trống nên bị ẩn.
- `makeupPolicy` — chính sách nộp bù đang là **bản nháp**, cần xác nhận.

Nguyên tắc chung: trường nào trống thì khối đó **tự ẩn**, không bao giờ hiện
`[[X]]` cho khách thấy.

### Workshop

Vào `/admin` → **Workshop** tạo buổi, điền link Zoom và nhóm Zalo. Trang
`/workshop` tự lấy buổi sắp diễn ra gần nhất. Chưa có link Zoom thì khách đăng
ký xong không thấy nút vào phòng — nút bị ẩn chứ không hiện nút chết.

---

## 6. Cách hệ thống chấm điểm lead

Rule-based thuần, không AI. Bảng điểm nằm trong `src/lib/scoring/rules.ts` —
để trong code để review được, diff được, và có test đi kèm.

| Nhóm | Tối đa | Ghi chú |
|---|---|---|
| Ngân sách / sẵn sàng đầu tư | 30 | Tín hiệu mua mạnh nhất |
| Thời điểm muốn bắt đầu | 25 | |
| Thời gian mỗi ngày | 15 | Khoá đòi mỗi ngày một bài |
| Hiện trạng kênh | 12 | "Chưa có kênh" vẫn được 5đ — vẫn đúng tệp mục tiêu |
| Mục tiêu | 10 | Ra khách > xây thương hiệu > tò mò |
| Nguồn | 10 | Đã dự workshop +10, qua CTV +5 |
| Chất lượng liên hệ | 8 | SĐT hợp lệ +5, email +2, Facebook +1 |
| Trừ điểm | −10 | Trùng trong 24h −5, tự luận bỏ trống −5 |

**NÓNG ≥70** gọi trong 2 giờ · **ẤM 40–69** gọi trong 24 giờ · **LẠNH <40** nuôi
bằng nội dung.

Điểm **chỉ được tăng**: form workshop ngắn không hạ điểm của lead đã điền form
tư vấn đầy đủ. Đổi bảng điểm thì tăng `SCORING_VERSION`; lead cũ giữ nguyên
version của nó cho tới khi bấm "Chấm lại điểm" trong CMS.

---

## 7. Hệ affiliate 20%

**Quy kết theo chạm đầu tiên, cửa sổ 90 ngày.** Tệp này mua theo nội dung: CTV
làm video giới thiệu cho người lạ, người đó cân nhắc vài tuần rồi mới quyết.
Tính chạm cuối thì ai chạy retarget từ khoá thương hiệu cũng gặt được công của
người giới thiệu đầu, và mọi tranh chấp thành không phân xử được.

`leads.affiliate_id` ghi **một lần** lúc lead ra đời và không bao giờ bị ghi đè
— chặn ở tầng repository chứ không chỉ là quy ước. Khách xoá cookie sau đó cũng
không dịch chuyển được hoa hồng. CTV thứ hai vẫn thấy click của mình trong
dashboard (`is_first_touch = 0`) nhưng hoa hồng không đổi chủ.

**Vòng đời hoa hồng:**

```
đơn paid → pending (chờ hết cửa sổ hoàn tiền 7 ngày)
              ├─ nghi tự giới thiệu → held → admin bỏ treo / từ chối
              └─ tới hạn → approved (cron 03:00 tự duyệt)
   → CTV yêu cầu rút (đủ ngưỡng) → payout_requested
   → admin duyệt → admin đánh dấu đã chi (bắt buộc có mã giao dịch) → paid
```

**Trả hoa hồng hai lần là bất khả thi về cấu trúc**, không phụ thuộc code cẩn
thận: `UNIQUE(order_id)` trên `commissions` và `UNIQUE(commission_id)` trên
`payout_items`.

**Chống tự giới thiệu** phân tầng: chỉ từ chối thẳng khi trùng số điện thoại
hoặc email của chính CTV; tín hiệu yếu hơn (cùng IP, tên trùng tài khoản ngân
hàng) thì **treo lại** chờ admin xem — treo thì CTV còn khiếu nại được, huỷ âm
thầm thì họ chỉ thấy hoa hồng biến mất mà không hiểu vì sao.

---

## 8. Học viên: bài nộp, coin, XP, thứ hạng

Thử thách 21 ngày sống hay chết ở chỗ học viên có nộp bài mỗi ngày hay không.
Phần này biến việc đó thành thứ nhìn thấy được — cho học viên và cho anh Thành.

**Duyệt bài** (`/admin/duyet-bai`). Mỗi bài nộp gắn với một enrollment và một
ngày 1–21, `UNIQUE(enrollment_id, day)` nên một ngày chỉ có một bài. Duyệt là
thao tác **cộng thưởng**, và cộng đúng một lần: câu lệnh duyệt là
`UPDATE ... WHERE id = ? AND status != 'approved'`, bấm duyệt lần hai không đổi
gì. Tiến độ `posts_done` chỉ đếm bài **đã duyệt**, không đếm bài chờ.

**Coin và XP.** Mặc định 50 coin + 100 XP mỗi bài được duyệt. Sổ cái
`coin_ledger` là nguồn sự thật duy nhất; `students.coin` chỉ là số dư đã cộng
sẵn để đọc nhanh, và bộ test khẳng định hai con số luôn khớp. Muốn cộng/trừ tay
thì vào chi tiết học viên — mọi lần điều chỉnh đều ghi vào sổ cái kèm lý do,
không có đường nào sửa số dư mà không để lại dấu vết.

**Chuỗi ngày (streak).** Tính theo **ngày nộp bài, không phải ngày duyệt** —
anh Thành duyệt dồn cuối tuần thì học viên không mất chuỗi. Nộp liền ngày hôm
sau thì chuỗi +1, cách quãng thì về 1. Chuỗi cho hệ số thưởng coin
`1 + (chuỗi − 1) × 10%`, chặn trần ở ×2.00.

**Thứ hạng** theo XP tích luỹ: 🌱 Mới bắt đầu 0 · 🌿 Đều đặn 300 · 🌳 Bền bỉ 900
· 🏅 Về đích 1.600 · 👑 Gương sáng 2.100. Bậc cuối đặt đúng bằng 21 bài × 100 XP
— đi trọn thử thách thì chạm được, không đi trọn thì không.

**Quà tặng** (`/admin/qua-tang`). Học viên đổi coin lấy quà; đổi xong là
**trừ coin và trừ tồn kho ngay**, nếu admin từ chối thì **hoàn lại cả hai**.
Bộ test khẳng định hoàn đúng một lần dù bấm từ chối nhiều lần.

**Cơ chế** (`/admin/co-che`). Toàn bộ con số trên nằm trong `settings`, sửa
được trong CMS, không phải sửa mã. Màn hình này tính thẳng cho anh Thành thấy
hệ quả của con số vừa đổi: đi trọn 21 ngày được bao nhiêu coin, bao nhiêu XP,
có đủ chạm bậc cao nhất không.

**Bảng vàng** (`/admin/bang-vang`) xếp theo XP, kèm bản đồ nhiệt 8 tuần để nhìn
ra ai đang đuối trước khi họ bỏ cuộc.

### Cổng học viên — `/hoc/<mã>`

Mỗi học viên có một đường link riêng để tự nộp bài. **Không có mật khẩu.** Học
viên khoá 21 ngày là người bận, mua một lần, học ba tuần rồi thôi — bắt họ tạo
tài khoản là dựng thêm một bức tường ngay trước thứ mình muốn họ làm mỗi ngày.

Anh Thành vào `/admin` → Học viên → **Chép link** rồi gửi Zalo. Cột bên cạnh
ghi lần mở gần nhất, nên nhìn ra ngay ai chưa bao giờ mở link. Học viên lỡ đăng
link vào nhóm chung thì bấm **Cấp lại** — mã cũ chết ngay lúc đó.

Trên trang, học viên thấy: bậc hiện tại và còn bao nhiêu XP nữa lên bậc, số
coin, chuỗi ngày, 21 ô ngày theo màu (đã duyệt / chờ duyệt / cần sửa / chưa
nộp), form nộp bài, nhận xét của team, và kho quà đổi được.

Vài quyết định đáng nói:

- **Ô ngày mở sẵn là ngày bị trả về**, không phải ngày hôm nay. Ở đó có nhận
  xét đang chờ đọc và một việc cụ thể phải làm; ô trống thì lúc nào cũng còn.
- **Bài đã duyệt thì khoá.** Sửa được sau khi đã cộng coin nghĩa là link đã
  nhận thưởng có thể bị thay bằng link khác mà coin vẫn giữ nguyên.
- **Nộp lại thì xoá nhận xét cũ.** Giữ lại thì học viên tưởng team đã đọc bài
  mới rồi.
- **Đổi quà trừ coin ngay trong chính câu `UPDATE ... WHERE coin >= ?`**, nên
  bấm đổi hai lần cùng lúc chỉ trừ được một lần.

Đánh đổi đã cân nhắc: ai có link là vào được. Với nội dung ở đây — bài tập của
chính học viên, số coin của họ — đó là mức rủi ro đúng: không có tiền, không có
dữ liệu người khác. Trang gắn `noindex` và `Referrer-Policy: no-referrer` để mã
không lọt lên Google hay rò qua Referer, và mã dài 128 bit nên không dò được.

---

## 9. Cấu trúc

```
build/               Pipeline sinh 10 trang HTML tĩnh từ file thiết kế .dc.html
  build.mjs          Đọc design/ + site.config.json → public/*.html
  partials/          CSS, JS, và mảnh HTML của từng trang
design/              File thiết kế gốc (.dc.html) — nguồn của mọi trang public
site.config.json     Toàn bộ chữ trên trang. Trường trống thì khối tự ẩn.
migrations/          10 file schema D1 + seed
src/
  worker.ts          Điểm vào Hono
  routes/
    public.ts        Đăng ký workshop, lead magnet, theo dõi sự kiện
    checkout.ts      Tạo đơn, tra cứu đơn
    webhook-sepay.ts ⚠️ Phần rủi ro nhất — chống trùng + ghép đơn
    admin/*          API quản trị
    affiliate/*      API portal CTV
    student.ts       Cổng học viên — nộp bài, đổi quà, chạy bằng mã trong link
  lib/
    scoring/         Bảng điểm lead (+ test)
    payments/        Mã đơn, VietQR, fulfillOrder dùng chung
    affiliate/       Quy kết, máy trạng thái hoa hồng, chi trả
    auth/            Phiên đăng nhập, CSRF, phân quyền
    game/            Chuỗi ngày, thứ hạng, cộng thưởng khi duyệt bài, cổng học viên
    email/           Hộp thư đi: xếp hàng, nội dung mail, bộ gửi Resend
admin/               SPA quản trị (React + Vite) → public/admin/
affiliate/           SPA portal CTV → public/aff/
scripts/             Tạo tài khoản admin, ba bộ test đầu-cuối
  deploy-cloudflare.mjs  Dựng D1/KV/R2 và deploy bằng một lệnh
  preflight.mjs          Chặn deploy thiếu thông tin nhận tiền
```

**Trang public không dùng React.** Chúng đã tồn tại dưới dạng HTML tĩnh sinh từ
file thiết kế gốc; viết lại thành component là cách chắc chắn nhất làm hỏng
thiết kế, và không được lợi gì vì đó là trang đọc-và-bấm-nút. Zero JS framework
cũng cho LCP tốt hơn hẳn trên 3G/4G Việt Nam.

---

## 10. Sửa nội dung trang

Sửa `site.config.json` rồi `npm run build:pages`. Script in ra danh sách những
gì còn thiếu và những khối đang bị ẩn.

Muốn đổi một câu cụ thể mà không đụng vào mã: thêm dòng vào `textOverrides`
theo dạng `"câu gốc": "câu mới"`. Không tìm thấy câu gốc thì build báo.

---

## 11. Email xác nhận

Khách chuyển khoản xong đóng tab là mất dấu đơn của mình. Hai đường chữa:
trang `/tra-cuu` (không cần cấu hình gì) và email xác nhận (cần một khoá).

```bash
npx wrangler secret put RESEND_API_KEY --env production
# EMAIL_FROM đặt trong wrangler.jsonc → vars, ví dụ: "Góc Creator <no-reply@tenmien.vn>"
```

**Không có khoá thì hệ vẫn chạy bình thường** — email vào hàng đợi rồi đánh dấu
`skipped`, không phải `failed`. Hai chữ này đọc khác hẳn nhau trong trang quản
trị: `failed` nghĩa là có gì đó hỏng cần sửa, `skipped` nghĩa là tính năng chưa
bật, đúng như thực tế.

**Vì sao là hàng đợi chứ không gửi thẳng.** Gửi thẳng trong webhook SePay nghĩa
là nhà cung cấp email chậm thì webhook chậm theo, mà webhook trả lời chậm hoặc
lỗi là SePay gửi lại — tức là **lỗi gửi mail biến thành lỗi ghi nhận thanh
toán**. Thay vào đó email được xếp vào `email_outbox` ngay trong chính
`db.batch()` atomic đang ghi nhận đơn, rồi gửi ở một lượt riêng sau khi đã trả
lời SePay.

`UNIQUE(template, ref_id)` bảo đảm webhook gửi lại bao nhiêu lần cũng chỉ một
email đi ra — cùng cách `UNIQUE(order_id)` chặn trả hoa hồng kép.

Gửi ở hai nơi: ngay sau webhook (khách nhận mail trong vài giây) và một lượt
quét trong việc chạy hằng đêm để nhặt những cái lỗi. Thử tối đa 4 lần rồi
chuyển sang `failed` để nó hiện ra, thay vì nằm im trong hàng đợi.

**Zalo ZNS chưa làm.** Zalo yêu cầu doanh nghiệp xác minh và duyệt từng mẫu tin,
mất vài ngày làm việc. Bảng `email_outbox` có sẵn cột `template` nên sau này
thêm một bộ gửi Zalo là đủ, không phải sửa lại luồng.

---

## 12. Việc chạy hằng đêm

Cron 03:00 giờ Việt Nam (`0 20 * * *` UTC):

- Chuyển đơn quá hạn chưa nhận đồng nào sang `expired`. **Không xoá** — khách
  chuyển khoản muộn vẫn phải khớp được vào đúng đơn.
- Tự duyệt hoa hồng đã qua cửa sổ hoàn tiền và **không bị treo**. Hoa hồng
  `held` không bao giờ tự duyệt, phải có người xem.
- Dọn phiên đăng nhập hết hạn.
