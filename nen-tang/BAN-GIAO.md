# Bàn giao hệ thống Góc Creator cho anh Thành

Viết cho **người vận hành**, không phải lập trình viên. Ai chưa từng mở repo này
vẫn đọc và làm theo được.

> ### Nếu anh nhận bộ này dưới dạng file zip
>
> File zip là **một bản chụp tại một thời điểm**. Nó đủ để chạy, để sửa, để
> deploy — nhưng có hai chỗ hụt, nói trước để anh khỏi mất công tìm:
>
> **1. Không tự cập nhật được.** Zip không kèm lịch sử Git, nên lệnh
> `git pull` sẽ không chạy. Lần sau có bản sửa, anh phải xin file zip mới rồi
> chép đè — dễ lệch phiên bản, và dễ mất những thứ anh đã tự sửa.
>
> **2. Chưa nhờ AI sửa hộ được ngay** (Phần 6b). Claude Code trên web cần một
> repo GitHub để nối vào, mà zip thì không có.
>
> Cả hai chỗ hụt này biến mất khi anh được mời vào repo GitHub của dự án —
> một lần, rồi từ đó `git pull` là có bản mới nhất. Nếu định dùng lâu dài,
> xin quyền GitHub là việc đáng làm sớm.

---

## Phần 0 — Trạng thái thật, ngày bàn giao

Hệ thống **đã chạy trên tên miền thật** và đã bán được. Còn **một việc chặn
tiền tự động** ở Phần 3.

| | Trạng thái |
|---|---|
| `manhthanh.net` — trang bán hàng | ✅ đang chạy |
| `app.manhthanh.net` — khu thành viên | ✅ đang chạy |
| Tạo đơn, sinh mã QR | ✅ chạy |
| **Webhook ngân hàng → tự xác nhận đơn** | ❌ **CHƯA BẬT** — xem Phần 3.2 |
| Gửi email | ✅ đã bật, đã nhận được thư thật |
| Số Zalo | ✅ số thật `0377526213` |
| Kho ảnh (R2) | ✅ đã bật |
| Đăng nhập bằng Google | ❌ chưa bật — không chặn ai, nút tự ẩn |
| AI chấm bài | ❌ chưa bật — tự duyệt vẫn chạy nên không chặn ai |
| Nội dung 21 ngày | ❌ chưa nhập — xem Phần 4 |

Cách tự kiểm bất cứ lúc nào, không cần hỏi ai: mở
`https://manhthanh.net/api/config` và xem ô `capabilities`. Nó đọc thẳng từ máy
chủ nên nó nói đúng cái máy chủ đang thấy, không phải cái tài liệu này nhớ.

> **Một dòng trong bản cũ của tài liệu này từng ghi webhook ngân hàng "✅ chạy
> (đã thử trọn vòng)".** Điều đó không đúng: khoá `BANK_WEBHOOK_SECRET` chưa
> bao giờ được nạp, và thiếu nó thì `webhook.js:85` từ chối mọi cú gọi. Một tài
> liệu nói sai về đường tiền còn nguy hơn không có tài liệu, nên đã sửa.

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
| **Mật khẩu trang quản trị** | **Đổi ngay** — xem Phần 5. Tài khoản quản trị (`role = 'admin'`) đã mang email của anh Thành, chỉ mật khẩu là do người dựng đặt |
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

1. Anh Thành có mã nguồn trên máy mình — giải nén file zip được gửi, hoặc
   `git clone` nếu đã được mời vào repo GitHub. Rồi `npm install`.
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

## Phần 3 — Việc còn lại trước khi chạy quảng cáo

Phần này ban đầu có ba việc. **Hai việc đã xong** và được giữ lại ở đây thay vì
xoá đi, để anh biết chúng đã từng là vấn đề và đã được xử lý thế nào. Còn lại
một việc thật: **3.2**.

### 3.1. ~~Số Zalo~~ — XONG

Đã thay số thật `0377526213` và link nhóm Zalo. Nút "Gửi bill về Zalo" trong
khu thành viên giờ dẫn tới đúng chỗ.

### 3.2. Webhook ngân hàng — VIỆC ĐÁNG LÀM NHẤT CÒN LẠI

Khoá `BANK_WEBHOOK_SECRET` **chưa được nạp**. Thiếu nó thì `webhook.js:85` từ
chối mọi cú gọi từ SePay, nghĩa là **không đơn nào tự xác nhận** — mọi khách
chuyển tiền đều phải chờ anh vào trang quản trị bấm tay.

Nạp xong là hết:

```powershell
npx wrangler secret put BANK_WEBHOOK_SECRET
```

Dán đúng chuỗi đã đặt bên SePay. Không cần deploy lại. Kiểm bằng cách mở
`https://manhthanh.net/api/config` — ô `thanh_toan_tu_dong` phải đổi từ `false`
sang `true`.

### 3.3. Quét thử mã QR một lần — bằng mắt người

Vào `https://manhthanh.net`, điền form như một khách thật, tới trang thanh toán,
rồi **mở app ngân hàng quét mã đó**. Chỉ để nhìn thấy đúng:

- số tài khoản `937213`
- tên `CONG TY TNHH THUONG MAI & DICH VU ANLIFE GROUP`

Không cần chuyển tiền. Xem xong thoát.

> Đây là thứ duy nhất máy không kiểm thay người được. Sai số tài khoản thì trang
> vẫn đẹp, mã QR vẫn hiện, và **tiền khách chảy vào tài khoản người khác** — không
> báo lỗi, không ai biết cho tới khi khách hỏi.

### 3.4. ~~Email~~ — XONG

`RESEND_API_KEY` đã nạp, tên miền đã xác minh, và **đã nhận được thư thật**.
Thư xác thực, thư "đã nhận tiền", thư mời vào lớp, đặt lại mật khẩu — đều chạy.

Muốn xem thư gửi cho một người có tới nơi không: **Học viên** → bấm vào tên →
khối **Thư đã gửi**. Cột lỗi nói thẳng lý do nếu thư không đi được.

---

## Phần 4 — Việc anh Thành làm hằng ngày

Đăng nhập `https://app.manhthanh.net` bằng tài khoản quản trị, vào mục **Quản trị**.

| Muốn làm gì | Vào đâu |
|---|---|
| Xác nhận khách đã chuyển tiền | **Doanh thu** → đơn hàng → **Đã nhận tiền**. Khách nhận email biên nhận tự động |
| Duyệt bài tập và hoạt động | **Duyệt bài** — huy hiệu đỏ đếm cả hai hàng chờ |
| **Xem mọi thứ về một học viên** | **Học viên** → **bấm thẳng vào tên**. Hồ sơ có: đơn hàng, hoa hồng, bài tập, tiến độ từng bài, quyền đang có, quà đã đổi, thư đã gửi |
| Tìm người lập nhiều tài khoản | **Tài khoản trùng** |
| Giới hạn số chỗ mỗi khoá | **Sản phẩm** → cột **Sức chứa**. Để trống = không giới hạn. Bán đủ rồi thì bấm **"Mở khoá mới"** để đếm lại |
| Bật/tắt tự duyệt bài, đổi luật cộng điểm | **Cơ chế** |
| Nhập nội dung 21 ngày | **Challenge** |
| Thêm bài giảng, khoá học | **Khoá học** |
| Ẩn bài viết xấu | **Cộng đồng** — ẩn chứ không xoá, hoàn tác được |
| Gửi thông báo cho học viên | **Thông báo** |
| Xem cộng tác viên, hoa hồng | **Affiliate** |
| Cấp quyền coach cho người khác | **Nhân sự** |
| Xem ai làm gì | **Nhật ký** |

**Tất cả những việc trên sửa xong là chạy ngay, không cần deploy.**

Ba chỗ trang bán hàng đang tự ẩn vì thiếu nội dung, điền vào là hiện:
khối 4 ô số liệu, một câu FAQ chưa có câu trả lời (*"Lớp học vào khung giờ nào,
học trên nền tảng gì?"*), và nghề của người chứng thực.

> **Điểm giờ chỉ tính cho lớp và thử thách.** Hoạt động hằng ngày tự khai vẫn
> được ghi nhận và vẫn duyệt như cũ, nhưng không ra XP/xu nữa. Muốn bật lại:
> **Cơ chế** → bật luật *"Hoạt động được duyệt"*.

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

> **Lưu ý: hệ thống KHÔNG có nút "đổi mật khẩu" cho người đang đăng nhập.**
> Trong worker chỉ có hai đường dính mật khẩu: `/api/auth/reset-request` (gửi
> link qua email) và `/api/auth/reset` (đặt lại bằng token). Nên:
>
> - Đổi mật khẩu quản trị **phải làm bằng dòng lệnh** như trên, cộng thêm
>   `npm run brand:seed -- --remote --admin-email <email admin>` để đổi cả cửa
>   khu vực thành viên.
> - **Học viên quên mật khẩu thì tắc**, vì đường đặt lại đi qua email mà email
>   đang tắt (Phần 3.3).
>
> Cả hai chuyện này tan ngay khi bật `RESEND_API_KEY`. Đó là lý do email nên
> lên đầu danh sách chứ không phải "làm sau cũng được".

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

## Phần 6b — Nhờ AI sửa hộ, không cần lập trình viên

Cách dễ nhất cho người không rành kỹ thuật: **Claude Code trên web**. Mở
`claude.ai/code`, nối vào repo GitHub của dự án, rồi gõ tiếng Việt như nói
chuyện bình thường. Không phải cài gì lên máy.

Cần ba thứ:

1. Một tài khoản Claude trả phí của riêng anh Thành
2. Quyền trên repo GitHub (xem Phần 2)
3. Muốn nó deploy được thì `nen-tang/.env` phải có `CLOUDFLARE_API_TOKEN`.
   Lấy ở Cloudflare → My Profile → API Tokens → mẫu **"Edit Cloudflare
   Workers"**, và **thêm hai quyền**: `D1:Edit` và `Workers R2 Storage:Edit`
   (mẫu mặc định thiếu hai cái này, thiếu là báo lỗi `code: 7403`)

### Nói thế nào cho hiệu quả

- **Nói hiện tượng, đừng nói giải pháp.** *"Học viên bấm nộp bài xong không
  thấy gì"* tốt hơn *"sửa file Challenges.jsx"*. Nó tự tìm được file.
- **Bắt nó chạy `npm test` trước khi commit.** Có hơn 500 bài test đang xanh;
  chúng tồn tại để bắt lỗi thay anh.
- **Bắt nó giải thích trước khi sửa** nếu anh không chắc việc đó ảnh hưởng gì.
- Nghe một câu trả lời chắc nịch mà không kèm bằng chứng → hỏi lại
  **"dựa vào đâu?"**. Câu đó lọc được phần lớn những thứ nó đoán.

### Đừng

- **Đừng dán token, mật khẩu, khoá API vào khung chat.** Lệnh
  `npx wrangler secret put` sẽ hỏi và anh dán thẳng vào cửa sổ dòng lệnh.
- Đừng bảo nó deploy khi chưa chạy test.
- Đừng để nó sửa thẳng lên nhánh chính mà không xem lại.

### Những việc KHÔNG cần tới AI

Mọi thứ trong bảng ở Phần 4 sửa được ngay trong `/admin`. Chỉ cần tới AI khi
muốn đổi thứ nằm trong mã nguồn: bố cục trang bán hàng, thêm màn hình mới, đổi
cách tính điểm.

---

## Phần 7 — Khi có sự cố

| Hiện tượng | Làm gì |
|---|---|
| Trang trắng / lỗi sau khi deploy | Mở `goc-creator-platform.nhipsongsoserenitylife.workers.dev` — còn sống thì là lỗi tên miền, không phải lỗi hệ thống |
| Muốn quay về bản trước | Cloudflare → Workers → `goc-creator-platform` → Deployments → chọn bản cũ → Rollback |
| Khách báo không vào được lớp | Quản trị → Doanh thu → tìm đơn → xem đã "đã trả" chưa; chưa thì bấm **Đã nhận tiền** |
| Khách nói không nhận được mail | **Học viên** → bấm tên → khối **Thư đã gửi**. Cột lỗi nói thẳng lý do |
| Chuyển tiền rồi mà đơn chưa tự xác nhận | `BANK_WEBHOOK_SECRET` chưa nạp — xem Phần 3.2. Trong lúc đó xác nhận tay ở **Doanh thu** |
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

## Phần 10 — Chạy bản này ở máy anh Thành

Phần này dành cho lúc anh muốn thử sửa gì đó **mà không đụng tới bản thật**.
Bản chạy ở máy dùng một cơ sở dữ liệu riêng, rỗng — nghịch thoải mái, không
ảnh hưởng một khách nào.

### Cần có trước

- **Node.js phiên bản 22 trở lên** — tải ở `nodejs.org`, chọn bản LTS
- **Git** — `git-scm.com`

### Bước 0 — chỉ khi anh nhận bằng file zip: tạo kho Git

Làm **trước tiên**, trong thư mục ngoài cùng vừa giải nén:

```powershell
git init
git add -A
git commit -m "Ban ban giao"
```

Ba dòng, một lần, và **đừng bỏ qua**. File zip không kèm lịch sử Git, mà thiếu
nó thì hai thứ hỏng cùng lúc — cả hai đều hỏng im lặng:

1. **Không có đường lùi.** AI sửa hỏng một file thì anh không xem được nó vừa
   đổi gì, và không trả lại được như cũ. Có Git rồi thì `git diff` cho xem, và
   `git checkout -- <tên file>` trả lại.
2. **Cửa kiểm trước khi deploy tự tắt.** Bình thường nó chặn anh lại khi trong
   thư mục còn thay đổi dở dang, không cho đẩy lên bản thật. Không phải kho Git
   thì nó bỏ qua, và mã sửa dở dang lên thẳng trang khách đang dùng.

### Sáu bước

Mở PowerShell, vào thư mục `nen-tang` bên trong bộ mã nguồn, rồi:

```powershell
npm install

# Tao file cau hinh rieng cua may nay. KHONG BAO GIO dua file .env len mang.
copy .env.example .env

# Sinh mat khau quan tri cho ban chay o may
npm run hash-password "mat khau anh tu dat"
# -> chep chuoi in ra, dan vao dong ADMIN_PASSWORD_HASH= trong .env

npm run db:migrate                       # tao bang trong co so du lieu o may
npm run brand:seed -- --local --admin-email thanh@manhthanh.net
npm run build
npm run dev:worker                       # mo http://localhost:8787
```

Mở trình duyệt vào `http://localhost:8787` là thấy trang bán hàng chạy ở máy.
Khu quản trị ở `http://localhost:8787/admin`.

### Kiểm mọi thứ còn nguyên vẹn

```powershell
npm test
```

Hơn 500 bài kiểm tra tự động. **Tất cả phải xanh.** Có bài đỏ nghĩa là thứ gì
đó vừa hỏng — đừng deploy, hỏi lại trước.

Lần chạy đầu mất vài phút vì nó tự bật máy chủ. Máy chủ phải đang chạy ở cổng
8787 thì bộ test mới làm việc được.

### Ba điều tuyệt đối đừng làm

- **Đừng chạy `npm test` trỏ vào cơ sở dữ liệu thật.** Bộ test có lệnh xoá dọn.
  Mặc định nó chỉ chạy ở máy — đừng đổi.
- **Đừng đưa file `.env` cho ai, đừng đẩy lên mạng.** Nó giữ mật khẩu và khoá.
  File này đã được cấu hình để không bao giờ lên GitHub.
- **Đừng sửa file có dòng chữ `SINH TU brand/brand.json`.** Sửa `brand.json`
  rồi chạy `npm run brand:apply`.

---

## Phần 9 — Tài liệu khác trong repo

| File | Cho ai |
|---|---|
| `BAN-GIAO.md` (file này) | anh Thành — vận hành |
| `VIEC-CAN-DIEN.md` | người kỹ thuật — chi tiết việc còn dang dở |
| `CLAUDE.md` | lập trình viên / trợ lý AI — luật của dự án |
| `README.md` | tổng quan kỹ thuật |
