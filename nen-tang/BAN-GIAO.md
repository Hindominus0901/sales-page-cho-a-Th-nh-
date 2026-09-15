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

| Thứ | Đang ở đâu | Cần làm |
|---|---|---|
| **Tài khoản Cloudflare** | tài khoản đang dựng hệ thống | Mời email anh Thành làm **Administrator**, hoặc chuyển hẳn tên miền sang tài khoản của anh ấy |
| **Tên miền `manhthanh.net`** | cùng tài khoản Cloudflare trên | Đi theo tài khoản Cloudflare |
| **Mã nguồn (GitHub)** | repo `sales-page-cho-a-Th-nh-` | Mời tài khoản GitHub của anh Thành làm collaborator |
| **Mật khẩu trang quản trị** | đã đặt lúc dựng | **Đổi ngay sau khi bàn giao** — xem Phần 5 |
| **Tài khoản ngân hàng nhận tiền** | Techcombank `937213` | Đã là của công ty — chỉ cần anh Thành xác nhận đúng |
| **Số Zalo** | chưa có | Phần 3.1 |

> Nếu không chuyển quyền Cloudflare, anh Thành **không thể** sửa tên miền, xem
> dữ liệu, hay khôi phục khi có sự cố — mọi việc phải nhờ lại người dựng.

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
