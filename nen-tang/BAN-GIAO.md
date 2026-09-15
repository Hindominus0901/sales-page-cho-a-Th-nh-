# Bàn giao hệ thống Góc Creator cho anh Thành

Viết cho **người vận hành**, không phải lập trình viên. Ai chưa từng mở repo này
vẫn đọc và làm theo được.

---

## Phần 0 — Trạng thái thật, ngày bàn giao

Hệ thống **đã chạy trên tên miền thật**. Nhưng **chưa sẵn sàng nhận tiền của
khách thật** — còn 3 việc ở Phần 3. Đừng chạy quảng cáo trước khi xong 3 việc đó.

| | Trạng thái |
|---|---|
| `manhthanh.net` — trang bán hàng | ✅ đã trỏ về hệ mới |
| `app.manhthanh.net` — khu thành viên | ✅ đang chạy |
| Tạo đơn, sinh mã QR | ✅ chạy |
| Webhook ngân hàng → tự mở quyền học | ✅ chạy (đã thử trọn vòng) |
| Gửi email | ❌ **chưa bật** — xem Phần 3.3 |
| Số Zalo | ❌ **còn số giả** — xem Phần 3.1 |
| Nội dung 21 ngày | ❌ chưa nhập — xem Phần 4 |

Bộ kiểm tra tự động: **377/377 xanh** (373 đạt + 4 bỏ qua vì kho ảnh đang tắt).

---

## Phần 1 — Hệ thống gồm những gì

Chỉ có **một** chương trình chạy trên Cloudflare, tên `goc-creator-platform`.
Nó phục vụ hai mặt:

```
manhthanh.net          trang bán hàng — khách lạ vào đây, xem, điền form, trả tiền
app.manhthanh.net      khu thành viên — khách đã trả tiền vào đây học
```

Cộng thêm một địa chỉ dự phòng luôn sống, dùng khi tên miền có sự cố:

```
goc-creator-platform.nhipsongsoserenitylife.workers.dev
```

Dữ liệu (khách, đơn hàng, bài học, điểm) nằm trong cơ sở dữ liệu `platform` của
Cloudflare. **Không có bản sao ở đâu khác.**

### Tiền đi đường nào

```
Khách điền form  →  hệ thống tạo đơn, mã đơn dạng GC0001
                 →  hiện mã QR: Techcombank 937213, đúng số tiền
Khách chuyển tiền
                 →  ngân hàng báo về  →  đơn chuyển "đã trả"
                 →  hệ thống TỰ tạo tài khoản + mở quyền học
                 →  khách bấm "Vào lớp ngay" để đặt mật khẩu
```

Nếu ngân hàng chưa nối (Phần 3.2), anh vào trang quản trị bấm **"Đã nhận tiền"**
thủ công — từ đó trở đi mọi thứ tự chạy y hệt.

---

## Phần 2 — Những thứ phải sang tên anh Thành

Đây là phần quan trọng nhất của việc bàn giao. Thiếu một dòng là sau này anh
Thành không tự làm chủ được hệ thống của mình.

Tài khoản Cloudflare **đã là của anh Thành** — tên miền, Worker, cơ sở dữ liệu
đều nằm sẵn trong đó, không phải chuyển gì. Còn lại bốn thứ:

| Thứ | Cần làm |
|---|---|
| **Mã nguồn (GitHub)** | Mời tài khoản GitHub của anh Thành vào repo `sales-page-cho-a-Th-nh-` |
| **Mật khẩu trang quản trị** | **Đổi ngay** — xem Phần 5. Mật khẩu hiện tại đã đi qua tay người dựng |
| **Token Cloudflare trong `.env`** | Đang nằm trên máy người dựng — xem ô cảnh báo ngay bên dưới |
| **Máy để deploy** | Anh Thành cần một máy có bản chép mã nguồn, hoặc nhờ người dựng chạy hộ mỗi lần sửa — chọn kiểu A hay B bên dưới |

> ### Token Cloudflare — việc phải làm, không phải "nên cân nhắc"
>
> Lúc dựng hệ thống, một **API token của tài khoản Cloudflare anh Thành** đã được
> tạo và lưu vào file `.env`. Token đó có quyền **ghi**: sửa Worker, sửa cơ sở dữ
> liệu, sửa tên miền.
>
> File `.env` không bao giờ lên GitHub (đã nằm trong `.gitignore`), nhưng nó
> **nằm trên máy của người dựng, không phải máy anh Thành**. Cùng file đó còn giữ
> `ADMIN_PASSWORD_HASH` và `SESSION_SECRET`.
>
> Nghĩa là: chừng nào token đó còn sống, người dựng còn toàn quyền ghi vào
> Cloudflare của anh Thành. Xử lý theo đúng một trong hai kiểu bàn giao bên dưới —
> đừng để lửng lơ.

### Hai kiểu bàn giao — chọn một

**Kiểu A — anh Thành tự làm chủ hoàn toàn.** Chọn kiểu này nếu anh Thành (hoặc
người kỹ thuật của anh ấy) sẽ tự chạy deploy mỗi khi sửa gì.

1. Anh Thành chép mã nguồn về máy mình: `git clone`, `npm ci`.
2. Anh Thành **tự tạo API token mới** trên Cloudflare của mình, điền vào `.env`
   của máy mình cùng các giá trị khác.
3. Đổi mật khẩu quản trị (Phần 5).
4. Người dựng vào Cloudflare → My Profile → API Tokens → **thu hồi token cũ**.
5. Người dựng xoá thư mục mã nguồn trên máy mình (hoặc ít nhất xoá file `.env`).

Sau bước 4, người dựng không còn quyền gì với hệ thống nữa — đúng như tên gọi
"bàn giao".

**Kiểu B — anh Thành vận hành, người dựng vẫn lo kỹ thuật.** Chọn kiểu này nếu
anh Thành chỉ dùng trang quản trị và không muốn động tới dòng lệnh nào.

- Token cũ **giữ nguyên**, không thu hồi — người dựng cần nó để deploy.
- Anh Thành vẫn nên đổi mật khẩu quản trị (Phần 5) để mật khẩu đăng nhập là của
  riêng anh ấy.
- **Ghi rõ ra giấy** rằng mọi thay đổi cần dòng lệnh (đổi giá, đổi số tài khoản,
  đổi số Zalo, bật email, khôi phục sự cố) đều phải qua người dựng. Đây là một
  phụ thuộc thật, không phải chi tiết kỹ thuật vụn vặt: nếu người dựng bận hoặc
  ngừng hợp tác, anh Thành kẹt cho tới khi tìm được người khác đọc được repo này.

Không chọn kiểu nào là rơi vào trạng thái xấu nhất của cả hai: anh Thành tưởng
mình đã làm chủ, mà thực ra vẫn phụ thuộc, và vẫn có một token quyền ghi nằm ở
máy người khác.

Ngoài ra, **bản sao mã nguồn đang nằm ở**:

```
C:\Users\Administrator\Documents\sales-page-cho-a-Th-nh-\nen-tang
```

nhánh `claude/exciting-keller-n58lug`. Mọi lần deploy đều chạy từ đó.

---

## Phần 3 — BA VIỆC PHẢI XONG TRƯỚC KHI CÓ KHÁCH THẬT

### 3.1. Số Zalo thật — đang là số giả

Trong khu thành viên có nút **"Gửi bill về Zalo để mình xác nhận nhé"**. Nó đang
trỏ tới `zalo.me/0000000000` — **link chết, ngay chỗ khách vừa chuyển tiền**.

Cần: số Zalo thật của anh Thành, và link nhóm Zalo nếu có. Sửa 3 dòng trong
`brand/brand.json` (`contact.zaloPhone`, `contact.zaloUrl`,
`contact.zaloGroupUrl`) rồi chạy lại 3 lệnh ở Phần 6.

### 3.2. Quét thử mã QR một lần — bằng mắt người

Vào `https://manhthanh.net`, điền form như một khách thật, tới trang thanh toán,
rồi **mở app ngân hàng quét mã đó**. Chỉ để nhìn thấy đúng:

- số tài khoản `937213`
- tên `CONG TY TNHH THUONG MAI & DICH VU ANLIFE GROUP`

Không cần chuyển tiền. Xem xong thoát.

> Đây là thứ duy nhất máy không kiểm thay người được. Sai số tài khoản thì trang
> vẫn đẹp, mã QR vẫn hiện, và **tiền khách chảy vào tài khoản người khác** — không
> báo lỗi, không ai biết cho tới khi khách hỏi.

### 3.3. Email — đang tắt, và vì sao vẫn bán được

Chưa có `RESEND_API_KEY` nên hệ thống **không gửi được email nào**: không thư xác
thực, không thư "đã nhận tiền", không thư mời vào lớp. Thư bị ghi vào nhật ký với
trạng thái `chua dat RESEND_API_KEY` chứ không mất im lặng.

Có **lưới đỡ**: sau khi trả tiền, khách bấm **"Vào lớp ngay"** ngay trên trang cảm
ơn là vào được, không cần email. Nên hệ thống vẫn bán và giao hàng được khi chưa
có email.

Nhưng khách **quên mật khẩu thì tắc** — đặt lại mật khẩu đi qua email. Vì vậy:
bật email trước khi số khách đông. Cần tạo tài khoản Resend, xác minh tên miền
`manhthanh.net` (thêm bản ghi DKIM), rồi nạp khoá.

---

## Phần 4 — Việc anh Thành làm hằng ngày

Đăng nhập `https://app.manhthanh.net` bằng tài khoản quản trị, vào mục **Quản trị**.

| Muốn làm gì | Vào đâu |
|---|---|
| Xác nhận khách đã chuyển tiền | Doanh thu → đơn hàng → **Đã nhận tiền** |
| Nhập nội dung 21 ngày | Quản trị → **Thử thách** |
| Thêm bài giảng, khoá học | Quản trị → **Khoá học** |
| Sửa chữ trên trang bán hàng (số liệu, FAQ, lời chứng thực) | Quản trị → **Nội dung trang** |
| Gửi thông báo cho học viên | Quản trị → **Thông báo** |
| Xem cộng tác viên, hoa hồng | Quản trị → **Cộng tác viên** |
| Xem ai làm gì | Quản trị → **Nhật ký** |

Ba chỗ trang bán hàng đang tự ẩn vì thiếu nội dung, điền vào là hiện:
khối 4 ô số liệu, một câu FAQ chưa có câu trả lời, và nghề của người chứng thực.

---

## Phần 5 — Đổi mật khẩu quản trị (làm ngay khi nhận bàn giao)

Mật khẩu hiện tại đã đi qua tay người dựng hệ thống. Đổi đi.

Mở PowerShell trong thư mục `nen-tang`:

```powershell
npm run hash-password "mật khẩu mới của anh"
npx wrangler secret put ADMIN_PASSWORD_HASH
```

Lệnh thứ nhất in ra một chuỗi dài. Dán chuỗi đó vào khi lệnh thứ hai hỏi.
Không cần deploy lại.

---

## Phần 6 — Khi muốn sửa gì đó

**Luật vàng: mọi giá trị của thương hiệu chỉ sống ở một file** —
`brand/brand.json`. Giá, tên, số tài khoản, số Zalo, màu, tên miền đều ở đó.
Đừng đi tìm sửa ở file khác; sửa chỗ khác sẽ bị ghi đè.

Sửa xong, chạy đúng ba lệnh này, đúng thứ tự:

```powershell
npm run brand:validate
npm run brand:apply
npm run deploy
```

- `brand:validate` chặn trước: sai định dạng số tài khoản, thiếu trường, giá gạch
  ngang thấp hơn giá bán — nó báo và dừng, chưa đụng gì tới bản thật.
- `brand:apply` chép giá trị ra các file cần.
- `deploy` build lại rồi đẩy lên. Khoảng 2 phút.

Deploy xong phải thấy đủ hai dòng:

```
manhthanh.net (custom domain)
app.manhthanh.net (custom domain)
```

---

## Phần 7 — Khi có sự cố

| Hiện tượng | Làm gì |
|---|---|
| Trang trắng / lỗi sau khi deploy | Mở `goc-creator-platform.nhipsongsoserenitylife.workers.dev` — còn sống thì là lỗi tên miền, không phải lỗi hệ thống |
| Muốn quay về bản trước | Cloudflare → Workers → `goc-creator-platform` → Deployments → chọn bản cũ → Rollback |
| Khách báo không vào được lớp | Quản trị → Doanh thu → tìm đơn → xem đã "đã trả" chưa; chưa thì bấm **Đã nhận tiền** |
| Khách quên mật khẩu mà email chưa bật | Chưa có đường tự phục vụ — xem Phần 3.3 |
| Kiểm hệ thống còn sống không | Mở `https://manhthanh.net/api/health`, phải thấy `ok: true` |

---

## Phần 8 — Những thứ đừng làm

- **Đừng gõ số tài khoản, giá, số điện thoại vào bất kỳ file nào ngoài
  `brand/brand.json`.** Hệ thống cố ý không có giá trị mặc định cho những thứ
  dính tiền: thiếu cấu hình thì nó **từ chối tạo đơn**, thay vì âm thầm dùng số
  của người khác.
- **Đừng chạy `npm test` trỏ vào cơ sở dữ liệu thật.** Bộ test có lệnh xoá dọn —
  trỏ vào bản thật là **xoá dữ liệu thật**. Nó chỉ chạy ở máy.
- **Đừng sửa tay các file có dấu `SINH TU brand/brand.json`.** Lần
  `brand:apply` sau sẽ ghi đè.
- **Đừng xoá Worker cũ `goc-creator-challenge` vội.** Nó không còn giữ tên miền
  nữa, nhưng để đó thêm một thời gian cho chắc.

---

## Phần 9 — Tài liệu khác trong repo

| File | Cho ai |
|---|---|
| `BAN-GIAO.md` (file này) | anh Thành — vận hành |
| `VIEC-CAN-DIEN.md` | người kỹ thuật — chi tiết việc còn dang dở |
| `CLAUDE.md` | lập trình viên / trợ lý AI — luật của dự án |
| `README.md` | tổng quan kỹ thuật |
