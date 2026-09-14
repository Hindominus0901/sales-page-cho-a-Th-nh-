# Hướng dẫn cho coding agent

Đây là **template** dựng site bán hàng + cộng đồng học viên trên Cloudflare Workers + D1. Một người
đưa repo này cho bạn để dựng site cho **một thương hiệu mới**.

## Luật vàng — đọc trước khi gõ dòng đầu tiên

> **Giá trị của khách chỉ sống ở `brand/brand.json`.**
> Không bao giờ gõ tên, giá, số điện thoại, số tài khoản, màu, tên miền hay ID video vào bất kỳ file
> nào khác. Nếu thấy mình đang định làm thế — dừng lại, thêm trường vào `brand.json` rồi cho file kia
> đọc từ đó.

Các file mang dấu `SINH TU brand/brand.json` là **file sinh ra**: sửa tay sẽ bị ghi đè ở lần
`npm run brand:apply` tiếp theo. `node scripts/brand/apply.mjs --check` báo lỗi nếu ai đó đã sửa tay.

## Sổ tay dựng site mới

1. `npm install` (Node ≥ 22).
2. Phỏng vấn người dùng để điền `brand/brand.json` — xem `brand/README.md` cho từng trường. Những
   thứ **phải hỏi**: tên thương hiệu, tên người hướng dẫn, tên miền, sản phẩm và giá, **số tài khoản
   ngân hàng**, số Zalo, màu thương hiệu.
3. `npm run brand:validate` → sửa cho tới khi sạch lỗi.
4. `npm run brand:apply`.
5. `npm run hash-password "<mật khẩu>"` → dán vào `.env` (`ADMIN_PASSWORD_HASH`).
6. `npm run db:migrate` rồi `npm run brand:seed -- --local --admin-email <email>`.
7. `npm run build`.
8. `npm run dev:worker` (nền) → chờ `/api/health` trả 200.
9. `npm test` — **377/377 phải xanh** (86 smoke + 53 auth + 238 platform). Nó tự bật `wrangler dev` nếu chưa có, chạy ba bộ
   tuần tự, và tự bật lại máy chủ nếu giữa chừng nó sập (xem `scripts/chay-test.mjs`).
10. `npm run brand:check` — không được còn dấu vết nào.
11. `npm run setup:cloudflare` → tạo D1/KV/R2, chạy migration thật, in ra bí mật còn thiếu.
12. Nạp từng bí mật, `npm run brand:seed -- --remote --admin-email <email>`, rồi `npm run deploy`.
13. Nghiệm thu bản thật: mở trang bán hàng, điền form, tạo đơn, **kiểm mã QR ra đúng số tài khoản
    mới**, đăng nhập webapp bằng tài khoản quản trị vừa tạo.

**Dừng lại và hỏi người dùng** ở bất kỳ bước nào cần: tài khoản Cloudflare/Resend/ngân hàng, tiền,
tên miền, hoặc nội dung thật (ảnh, video, lời chứng thực). Xem bảng "Những thứ một con người phải tự
làm" trong `README.md`.

## Bất biến — vi phạm là hỏng ngầm

- **Migration chỉ có cấu trúc.** Nội dung (sản phẩm, cấp bậc, huy hiệu) do `brand:seed` nạp. Nhét
  nội dung vào migration là đánh nhau với quản trị viên: họ sửa trong trang quản trị, migration chạy
  lại đè mất, hoặc không chạy và không ai biết.
- **Test cần `wrangler dev` chạy ở cổng 8787.** Không có nó thì mọi bài đỏ vì lý do không liên
  quan. `npm test` tự lo việc này; chỉ khi gọi thẳng `npm run test:platform` mới phải tự bật.
  Trên Windows `wrangler dev` thỉnh thoảng sập ngang không in ra chữ nào — đó là lý do
  `scripts/chay-test.mjs` tồn tại, đừng gỡ nó đi để "cho gọn".
- **`tests/auth.mjs` và `tests/platform.mjs` chỉ chạy ở máy** — chúng có lệnh `DELETE` dọn dẹp.
  Trỏ vào cơ sở dữ liệu thật là **xoá dữ liệu thật**. Chỉ `tests/smoke.mjs` chạy được với bản deploy.
- **Ba bộ test dùng chung một D1 cục bộ.** Chạy song song là chúng xoá dữ liệu của nhau giữa chừng,
  cho ra lỗi giả rất khó hiểu (`FOREIGN KEY constraint failed`, `unauthorized` hàng loạt). `npm test`
  đã chạy tuần tự — đừng "tối ưu" thành song song.
- **`worker/src/questions.js` ↔ `name="q1..q8"` trong `apps/funnel/designs/2-form.dc.html`** là một
  hợp đồng ngầm giữa hai file cách xa nhau. Đổi bộ câu hỏi phải sửa cả hai; lệch nhau thì chấm điểm
  khách tiềm năng sai mà không báo lỗi.
- **File `.dc.html` là bản xuất từ Claude Design.** Xuất lại từ Claude Design sẽ **xoá sạch** token
  `[[brand.*]]` và biến `var(--brand)`. Sau mỗi lần xuất lại phải đặt lại chúng — bộ token cố ý giữ
  nhỏ (11 cái) để việc đó còn khả thi.
- **Đừng đổi bất kỳ mã màu nào thành giá trị cứng.** Màu đi qua `var(--brand)` và
  `brand.generated.css`.
- **Trong `1-landing.dc.html` có selector khớp theo chuỗi màu** (`a[data-cta]` trước đây là
  `a[style*="background:#..."]`). Nếu đổi cách tô màu nút, phải kiểm bằng mắt: hiệu ứng hover/loé sẽ
  chết lặng lẽ, không test nào bắt được.

## Chỗ nào làm gì

```
brand/brand.json          nguồn sự thật duy nhất
brand/denylist.json       chuỗi cấm cho brand:check
scripts/brand/            validate · apply · seed · check
worker/src/config.js      đọc biến môi trường; KHÔNG có giá trị mặc định cho tiền
worker/src/routes/        API: leads, orders, webhook ngân hàng, affiliate, files
worker/src/mail/          Resend + 5 mẫu email (nhận `brand` làm tham số)
apps/funnel-gc/           bộ dựng trang bán hàng ĐANG DÙNG (bản của anh Thành)
apps/funnel/              bộ dựng của template — KHÔNG dùng ở đây, xem funnel.trangRieng
apps/funnel/designs/      .dc.html — bản thiết kế của template
apps/web/                 React SPA của khu vực thành viên
```

## An toàn tiền bạc — đừng gỡ

`worker/src/config.js` **không có giá trị mặc định** cho `BANK_BIN`, `BANK_ACCOUNT`,
`BANK_ACCOUNT_NAME`, `PRICE_VIP`. Thiếu thì `orders.js` từ chối tạo đơn (503).

Đây không phải sự cẩn thận thừa: bản gốc từng đặt sẵn số tài khoản thật của một khách làm giá trị
mặc định. Ai quên cấu hình sẽ có một trang bán hàng trông hoàn chỉnh, in ra mã QR đẹp đẽ, và **tiền
của khách chạy vào tài khoản người khác** — không log, không cảnh báo. Nếu bạn thấy mình đang định
thêm một giá trị mặc định cho thứ gì dính tiền: đừng.

## Xong là khi nào

```bash
npm run brand:check && npm test && npm run build
```
cả ba xanh, và trên bản thật: form gửi được, đơn tạo được, **mã QR ra đúng số tài khoản của khách**.
