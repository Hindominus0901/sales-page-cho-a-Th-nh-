# Đưa web lên Cloudflare — làm hoàn toàn trên trình duyệt

Bản này dành cho cách **nối repo GitHub vào Cloudflare**: không cần cài gì trên
máy, không cần gõ lệnh. Làm xong một lần, từ đó mỗi lần mã được cập nhật là
Cloudflare tự build tự đưa lên.

Ai đã quen terminal thì mục 3 của `README.md` có cách nhanh hơn (`npm run cf:prod`).

> **Tên menu trong Cloudflare hay đổi.** Bên dưới ghi cả chữ khoá để tìm, phòng
> khi giao diện đã khác lúc viết tài liệu này.

---

## Bước 1 — Tạo hai chỗ chứa dữ liệu

Vào <https://dash.cloudflare.com>, tìm mục **Storage & Databases** (có nơi ghi
là *Workers & Pages → D1 / KV*).

**a. Database D1** — nơi chứa lead, đơn hàng, học viên.

- Bấm **D1 SQL Database** → **Create**
- Tên: `goc-creator`
- Tạo xong, mở nó ra, chép **Database ID** (chuỗi dài có dấu gạch ngang).

**b. KV namespace** — chỗ đếm số lần gửi form để chặn spam.

- Bấm **KV** → **Create a namespace**
- Tên: `goc-creator-cache`
- Chép **Namespace ID** (chuỗi 32 ký tự chữ và số).

**Không cần R2.** Cloudflare sẽ mời đăng ký gói R2 (kèm thẻ thanh toán) — bỏ
qua. Ảnh của trang nằm ngay trong mã nguồn và đi cùng Worker; R2 chỉ cần khi nào
làm chức năng tải ảnh mới lên từ trang quản trị, mà tính năng đó chưa có.

> **Gửi hai chuỗi id vừa chép cho Claude** để điền vào `wrangler.jsonc`. Dán tay
> vào file cũng được, nhưng đây là chỗ dễ sai nhất, mà sai thì thông báo lỗi
> không nói được là sai ở đâu.

---

## Bước 2 — Nối repo

- Vào **Workers & Pages** (có nơi ghi là *Compute*)
- **Create** → tab **Workers** → **Import a repository** (hoặc *Connect to Git*)
- Cho phép Cloudflare truy cập GitHub, chọn repo
  `Hindominus0901/sales-page-cho-a-Th-nh-`
- Chọn nhánh: `claude/workshop-challenge-platform-8418nk`

Tới phần cấu hình build, điền **đúng** hai ô này:

| Ô | Điền |
|---|---|
| Build command | `npm run build` |
| Deploy command | `node scripts/cf-deploy.mjs` |

Các ô còn lại để nguyên mặc định.

**Đừng bấm Deploy vội** — làm bước 3 trước, không thì lần build đầu chắc chắn
dừng lại ở khâu soát cấu hình.

---

## Bước 3 — Đặt bốn khoá bí mật

Vào Worker vừa tạo → **Settings** → **Variables and Secrets** → **Add**.
Mỗi khoá chọn kiểu **Secret** (không phải Text), để nó không hiện lại sau này.

| Tên khoá | Lấy ở đâu |
|---|---|
| `SEPAY_ACCOUNT_NO` | **số tài khoản Techcombank của ANLIFE GROUP**, gõ liền không dấu cách |
| `SESSION_SECRET` | tự sinh — xem bên dưới |
| `IP_HASH_SALT` | tự sinh — xem bên dưới |
| `SEPAY_WEBHOOK_API_KEY` | SePay → Tích hợp webhook → API Key |
| `RESEND_API_KEY` | *(tuỳ chọn)* resend.com → API Keys. Không có thì hệ vẫn chạy, chỉ là khách không nhận được email xác nhận |

> **Vì sao số tài khoản cũng đặt ở đây, dù nó không bí mật gì** (nó được in
> thẳng trên trang cho khách chuyển khoản): vì `wrangler deploy` **ghi đè** phần
> biến thường bằng nội dung file cấu hình mỗi lần deploy, còn secret thì sống
> sót. Đặt ở đây là điền một lần rồi yên tâm, và không phải sửa mã.
>
> Anh Thành tự gõ trực tiếp vào đây thì không ai chép nhầm — kể cả Claude.

**Cách tự sinh `SESSION_SECRET` và `IP_HASH_SALT` mà không cần terminal:** mở tab mới, bấm `F12` để
mở cửa sổ dành cho lập trình viên, chọn tab **Console**, dán dòng này rồi Enter:

```js
crypto.randomUUID() + crypto.randomUUID()
```

Được một chuỗi dài — chép vào `SESSION_SECRET`. Chạy lại lần nữa lấy chuỗi khác
cho `IP_HASH_SALT`. **Hai chuỗi phải khác nhau.**

> `SESSION_SECRET` là khoá ký phiên đăng nhập. Đổi nó về sau là mọi người đang
> đăng nhập bị đăng xuất hết — nên đặt một lần rồi thôi.

Nếu chưa có `RESEND_API_KEY` thì bỏ qua, hệ vẫn deploy được: email vào hàng đợi
rồi đánh dấu "bỏ qua", và khách vẫn tìm lại được đơn ở trang `/tra-cuu`.

---

## Bước 4 — Deploy

Quay lại tab **Deployments** của Worker → **Retry deployment** (hoặc đẩy một
commit bất kỳ lên nhánh).

Cloudflare sẽ chạy:

1. `npm install`
2. `npm run build` — sinh 10 trang HTML tĩnh và hai giao diện quản trị
3. `node scripts/cf-deploy.mjs` — soát cấu hình, chạy migration, nạp dữ liệu
   nền lần đầu, rồi deploy

Cuối log sẽ in ra địa chỉ trang và **URL webhook để dán vào SePay**.

---

## Bước 5 — Tài khoản quản trị

Hiện phải chạy một lệnh trên máy có Node cho việc này:

```bash
node scripts/create-admin.mjs --email <email của anh> --remote
```

Không có Node thì nhắn Claude, sẽ có cách khác.

---

## Bước 6 — Việc quan trọng nhất

**Chuyển thật 2.000đ.**

1. Dán URL webhook vào SePay → Tích hợp webhook.
2. Mở trang, đăng ký một đơn thử, quét mã QR, chuyển đúng 2.000đ.
3. Xem trang thanh toán có tự đổi sang "đã nhận học phí" không.

Đây là thứ duy nhất chứng minh được cách hệ đọc dữ liệu SePay gửi sang là đúng.
Mọi thứ khác đã được kiểm bằng dữ liệu giả; riêng phần này thì không có cách nào
thay thế một giao dịch thật.

---

## Ba lỗi hay gặp

**Build dừng ở "3 LỖI CHẶN — deploy xong sẽ KHÔNG NHẬN ĐƯỢC TIỀN"**

Đây không phải lỗi hệ thống, mà là bộ soát đang chặn có chủ đích. Log ghi rõ
thiếu gì. Thường là số tài khoản ngân hàng chưa điền, hoặc id D1/KV còn là chuỗi
`00000000-…`. Sửa xong bấm **Retry deployment**.

**`Không chạy được migration D1`**

`database_id` trong `wrangler.jsonc` không khớp với database thật, hoặc D1 chưa
được tạo. Mở lại D1 trong dashboard, chép lại Database ID.

**Trang mở được nhưng bấm gì cũng lỗi**

Migration chưa chạy — Worker lên rồi nhưng database chưa có bảng nào. Xem lại
log build ở bước `[2/5] Migration D1`.

---

## Còn thiếu gì thì trang vẫn chạy

Chưa điền thông tin pháp nhân, chưa có link YouTube, chưa có ngày khai giảng —
những khối đó **tự ẩn**, trang không vỡ. Danh sách đầy đủ nằm ở
`TODO_TRUOC_KHI_CHAY.md`.

Nhưng **thiếu số tài khoản ngân hàng thì bộ soát chặn deploy**, vì đó là thứ
khiến hệ trông vẫn bình thường mà không nhận được đồng nào.

> **Đừng thay mã QR động bằng ảnh QR tĩnh trong app ngân hàng.** Mã QR trang
> thanh toán sinh ra đã điền sẵn **số tiền** và **mã đơn** vào nội dung chuyển
> khoản — chính mã đơn đó là thứ để hệ tự nhận ra tiền của ai. Ảnh QR tĩnh không
> có hai thứ đó, nên mọi giao dịch sẽ rơi vào "chưa khớp" và phải gán tay từng
> cái. Đó đúng là việc mà cả hệ thống này sinh ra để khỏi phải làm.
