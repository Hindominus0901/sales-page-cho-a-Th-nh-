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

| Tên khoá | Bắt buộc? | Lấy ở đâu |
|---|---|---|
| `SEPAY_ACCOUNT_NO` | **có** | số tài khoản Techcombank của ANLIFE GROUP, gõ liền không dấu cách |
| `SEPAY_WEBHOOK_API_KEY` | nên có | SePay → Tích hợp → Webhooks |
| `RESEND_API_KEY` | không | resend.com → API Keys |

`SESSION_SECRET` và `IP_HASH_SALT` **không cần điền** — script deploy tự sinh ở
lần chạy đầu, và không bao giờ sinh lại (sinh lại là đá văng mọi người đang
đăng nhập).

**Chỉ một khoá thật sự chặn deploy: `SEPAY_ACCOUNT_NO`.** Thiếu nó thì trang
thanh toán không sinh được mã QR và khách bấm mua xong nhìn thấy một trang
trống. Hai khoá kia thiếu thì hệ vẫn chạy:

- thiếu khoá webhook → khách vẫn chuyển khoản được, tiền vẫn về tài khoản, chỉ
  là đơn nằm ở "chờ thanh toán" tới khi có người vào `/admin` → *Giao dịch chưa
  khớp* gán tay;
- thiếu `RESEND_API_KEY` → khách không nhận email xác nhận, nhưng vẫn tra lại
  được đơn ở `/tra-cuu`.

> **Số tài khoản BẮT BUỘC đặt kiểu Secret, không phải Text.**
>
> Trong bảng *Runtime variables and secrets* có sẵn một loạt dòng kiểu Text
> (`SEPAY_BANK_CODE`, `APP_ENV`…). Những dòng đó do `wrangler.jsonc` sinh ra, và
> **mỗi lần deploy `wrangler` ghi đè lại toàn bộ chúng bằng nội dung file**. Gõ
> số tài khoản vào một dòng Text nghĩa là lần deploy kế tiếp xoá sạch nó — không
> báo gì, và trang thanh toán im lặng hỏng.
>
> Secret thì không nằm trong file cấu hình nên deploy không đụng tới.
>
> Anh Thành tự gõ trực tiếp vào đây thì không ai chép nhầm — kể cả Claude.

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

Script deploy tự tạo tài khoản owner đầu tiên, nhưng cần biết tạo cho email nào.

Vào **Settings → Build → Variables and Secrets** → thêm:

| Tên | Giá trị |
|---|---|
| `ADMIN_EMAIL` | email anh dùng để đăng nhập `/admin` |

> ⚠️ **Hai chỗ "Variables and Secrets" khác nhau, đừng nhầm:**
>
> | Chỗ | Dành cho | Đặt gì ở đây |
> |---|---|---|
> | Settings → **Build** → Variables | lệnh build và deploy | `ADMIN_EMAIL` |
> | Settings → **Variables and Secrets** (của Worker) | trang web lúc chạy | `SEPAY_ACCOUNT_NO`, `SEPAY_WEBHOOK_API_KEY` |
>
> Đặt nhầm chỗ thì không báo lỗi gì, chỉ là thứ cần nó không thấy nó.

Deploy xong, **mật khẩu in ra ở cuối nhật ký build và chỉ hiện một lần** — chép
ra chỗ an toàn ngay, rồi đăng nhập `/admin` → Nhân sự → đổi mật khẩu.

Tài khoản chỉ được tạo khi bảng còn rỗng, nên những lần deploy sau không sinh
thêm tài khoản nào.

### Quên mật khẩu quản trị

Mật khẩu chỉ hiện một lần và hệ chỉ lưu bản băm một chiều — không ai đọc lại
được. Mất thì lấy lại thế này:

1. **Settings → Build → Variables** → thêm `RESET_ADMIN_PASSWORD` = `1`
2. **Deployments → Retry deployment**
3. Mật khẩu mới in ra ở cuối nhật ký build — chép ngay
4. **Xoá biến `RESET_ADMIN_PASSWORD` đi**, rồi deploy lại

Bước 4 là bắt buộc. Để nguyên thì mỗi lần deploy mật khẩu lại đổi một lần, và
mật khẩu anh vừa chép sẽ hết dùng được mà không có gì báo.

`ADMIN_EMAIL` phải trỏ đúng tài khoản cần đặt lại. Email chưa có trong bảng thì
script tạo tài khoản owner mới cho email đó, không đụng vào tài khoản cũ.

---

## Bước 5b — Tên miền riêng manhthanh.net

`manhthanh.net` đang chạy trên hosting PA Vietnam và có email `@manhthanh.net`.
Chuyển sang Cloudflare là chuyển **toàn bộ DNS** của tên miền, nên phải giữ lại
đúng những bản ghi đang nuôi email — thiếu một cái là thư ngừng tới, và không có
gì báo.

### Trạng thái trước khi chuyển

Đây là DNS hiện tại (tra ngày viết tài liệu này). Sau khi chuyển, Cloudflare
phải có đủ những dòng đánh dấu GIỮ:

| Bản ghi | Giá trị | |
|---|---|---|
| `@` A | 112.213.89.76 | **BỎ** — web mới thay chỗ này |
| `www` A | 112.213.89.76 | **BỎ** — web mới thay chỗ này |
| `mail` A | 112.213.89.76 | **GIỮ** — email đi qua đây |
| `webmail` A | 112.213.89.76 | **GIỮ** — trang đọc thư |
| `ftp` A | 112.213.89.76 | GIỮ nếu còn dùng FTP |
| `cpanel` A | 112.213.89.76 | GIỮ nếu còn vào cPanel |
| `autodiscover` A | 112.213.89.76 | **GIỮ** — Outlook tự dò cấu hình |
| `autoconfig` A | 112.213.89.76 | **GIỮ** — Thunderbird tự dò cấu hình |
| `@` MX | mail.manhthanh.net (10) | **GIỮ** |
| `@` TXT | `v=spf1 a mx ~all` | **GIỮ** |

> ### Bản quét tự động KHÔNG đủ. Đây là chuyện đã xảy ra thật.
>
> Lần chuyển này, bản quét của Cloudflare tìm được đúng 4 bản ghi và **sót
> `mail`** — trong khi MX trỏ thẳng vào `mail.manhthanh.net`. Kích hoạt lúc đó
> là email chết hoàn toàn, và thư gửi tới bị **trả về** chứ không nằm chờ.
>
> Nó sót vì tên miền có một **bản ghi ký tự đại diện** `*` → `112.213.89.76`.
> Ký tự đại diện không nằm trong danh sách nào để dò, nên không công cụ nào
> liệt kê được nó — chỉ có cách suy ra.
>
> **Cách tự kiểm:** tra một tên miền con bịa hoàn toàn.
>
> ```
> nslookup xyzq123abc-khong-he-co.manhthanh.net
> ```
>
> Ra một địa chỉ IP nghĩa là **có** ký tự đại diện, và mọi tên miền con đang
> chạy nhờ nó. Báo không tìm thấy nghĩa là không có.
>
> **Quyết định đã chốt: KHÔNG chép ký tự đại diện sang Cloudflare.** Chỉ khai
> tường minh 6 tên miền con ở bảng trên. Đổi lại, tên miền con gõ nhầm sẽ báo
> lỗi rõ ràng thay vì âm thầm trả về hosting cũ — dễ dò lỗi hơn nhiều về sau.
>
> Nếu vài ngày sau có thứ gì đó hỏng mà không rõ lý do, gần như chắc chắn là
> một tên miền con chưa khai. Thêm nó vào DNS của Cloudflare là xong.

> Website cũ trên hosting PA Vietnam sẽ **ngừng hiện** sau bước này — đúng như
> anh Thành đã chốt. File trên hosting không mất, chỉ là không ai vào bằng
> `manhthanh.net` nữa.

### Các bước

1. Cloudflare → **Add** → `manhthanh.net` → gói **Free**
2. Ở màn hình onboarding, để **Import DNS records: Automatic**. Cloudflare tự
   quét và chép các bản ghi đang có.
3. **Đối chiếu lại danh sách vừa nhập với bảng trên.** Bản quét tự động có thể
   sót tên miền con — nó chỉ tìm được những cái nó đoán ra. Thiếu dòng nào thì
   **DNS → Add record** thêm tay.
4. **Các bản ghi `mail`, `webmail`, `ftp`, `cpanel`, `autodiscover`,
   `autoconfig` phải để đám mây XÁM
   (DNS only), KHÔNG phải cam.** Đám mây cam nghĩa là Cloudflare đứng giữa —
   nó chỉ hiểu web, và bật cho mail là email chết ngay. Đây là lỗi hay gặp
   nhất khi chuyển tên miền sang Cloudflare.
5. Cloudflare đưa ra **hai nameserver**. Vào PA Vietnam →
   **Quản lý dịch vụ → Danh sách dịch vụ → manhthanh.net → Nameserver**, thay
   ba nameserver `pavietnam` bằng hai cái của Cloudflare.
6. Chờ Cloudflare báo **Active** (thường 15–30 phút, luật cho tới 24 giờ).
7. Workers & Pages → `goc-creator-challenge` → **Domains & Routes** → Add →
   **Custom domain** → `manhthanh.net`. Thêm lần nữa cho `www.manhthanh.net`.

Bước 7 tự thay bản ghi gốc, nên không phải xoá tay hai dòng "BỎ" ở trên.

### Kiểm sau khi xong

- Mở `https://manhthanh.net` — phải ra trang bán khoá 21 Ngày
- **Tự gửi một email tới hộp thư `@manhthanh.net` của anh và xem nó có tới không.**
  Đây là bước dễ bỏ qua nhất và cũng là thứ hỏng thì đau nhất. Làm ngay khi
  Cloudflare báo Active, đừng để hôm sau.
- Tra lại DNS cho chắc:
  ```
  nslookup mail.manhthanh.net     → phải ra 112.213.89.76
  nslookup -type=mx manhthanh.net → phải ra mail.manhthanh.net
  ```
- Địa chỉ `.workers.dev` vẫn chạy song song, không mất.

> **Mọi người phải đăng nhập lại một lần.** Cookie phiên dùng tiền tố `__Host-`
> nên nó bám vào đúng tên miền đang mở — phiên trên `.workers.dev` không đi theo
> sang tên miền mới. Đây là hành vi đúng, không phải lỗi.

---

## Bước 5c — Bật email thật (Resend)

Chưa có bước này thì email nằm trong hàng đợi với trạng thái "bỏ qua": khách trả
tiền xong **không nhận được đường link vào lớp**, và không ai lấy lại được mật
khẩu.

1. `resend.com` → đăng ký. Miễn phí 3.000 thư/tháng, 100 thư/ngày.
2. **Domains → Add Domain** → `manhthanh.net`
3. Resend đưa ra 3 bản ghi DNS (SPF, DKIM, DMARC). Tên miền đã nằm trong
   Cloudflare rồi nên vào **DNS → Add record** dán vào. Chờ Resend báo
   **Verified**.

   > **CHỖ NÀY DỄ HỎNG NHẤT.** `manhthanh.net` đã có sẵn một bản ghi SPF cho
   > email của PA Vietnam:
   >
   > ```
   > v=spf1 a mx ~all
   > ```
   >
   > Một tên miền chỉ được có **ĐÚNG MỘT** bản ghi SPF. Thêm bản ghi SPF thứ hai
   > của Resend vào là SPF hỏng hoàn toàn — và hỏng theo cách tệ nhất: cả email
   > cũ lẫn email mới đều bắt đầu rơi vào spam, mà không có gì báo lỗi.
   >
   > Cách đúng là **gộp làm một**. Resend bảo thêm `include:amazonses.com` thì
   > sửa dòng SPF đang có thành:
   >
   > ```
   > v=spf1 a mx include:amazonses.com ~all
   > ```
   >
   > Giữ nguyên phần `a mx` — đó là thứ cho phép hosting PA Vietnam tiếp tục gửi
   > thư. Bỏ nó đi là email từ hộp thư công ty vào spam.
   >
   > Nếu Resend cho chọn gửi qua một tên miền con (kiểu `send.manhthanh.net`)
   > thì **chọn cách đó** — tên miền con có SPF riêng, không đụng gì tới SPF của
   > email công ty, và đỡ hẳn chỗ dễ sai này.
4. **API Keys → Create API Key** → chép khoá.
5. Cloudflare → Worker → Settings → **Variables and Secrets** (loại **runtime**,
   KHÔNG phải mục Build) → thêm `RESEND_API_KEY`, kiểu **Secret**.

`EMAIL_FROM` đã nằm sẵn trong `wrangler.jsonc` — cố ý để ở đó chứ không đặt
trong dashboard, vì `wrangler deploy` ghi đè toàn bộ vars bằng file cấu hình và
một biến kiểu Text đặt trong dashboard sẽ bị xoá ở lần deploy kế tiếp.

**Kiểm sau khi bật:** vào `/quen-mat-khau`, xin đặt lại mật khẩu cho email của
anh, rồi xem thư có tới không và **nó vào Inbox hay Spam**. Vào `/admin` →
**Hộp thư đi** xem trạng thái từng thư; thư nào lỗi thì bấm "Xếp lại".

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

**Build lỗi ở bước `npm install` hoặc `npm run build`**

Bản build của trang đã nằm sẵn trong repo, nên không cần build cũng deploy được.
Vào Settings → Build → đổi **Build command** thành:

```
echo bo qua build, dung ban co san trong repo
```

rồi Retry deployment. Trang lên đúng như bản đã kiểm ở máy. Nhược điểm: từ đó
mỗi lần đổi nội dung phải chạy `npm run build` rồi commit — nên chỉ dùng khi
build trên Cloudflare thật sự không chạy được.

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
