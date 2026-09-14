# `brand/` — nơi duy nhất chứa thông tin của khách

Mọi thứ mang dấu vết một thương hiệu — tên, giá, số tài khoản, màu, tên miền, video — đều bắt đầu
từ `brand.json`. Sửa xong chạy:

```bash
npm run brand:validate && npm run brand:apply
```

Chưa có `brand.json` thì tạo bằng cách trả lời từng câu:

```bash
node scripts/brand/init.mjs
node scripts/brand/init.mjs --from ho-so.json   # hoặc đưa sẵn một file JSON
```

## Từng trường

### `meta`
| Trường | Nghĩa |
|---|---|
| `slug` | tên ngắn không dấu, dùng đặt tên tài nguyên |
| `locale` | `vi-VN` — quyết định cách chấm phẩy số tiền |
| `currencySuffix` | `đ` — ký hiệu tiền dán sau con số |
| `timezoneOffsetMinutes` | `420` = UTC+7. Cron dùng số này để biết "hôm nay" là ngày nào |

### `identity`
| Trường | Hiện ở đâu |
|---|---|
| `name` | logo, tiêu đề email, tên cộng đồng |
| `legalName` | chân trang, hai trang pháp lý |
| `productLine` | tên chương trình trong webapp và email |
| `hostName` | thay cho tên riêng trong nội dung ("… sẽ nhắn qua Zalo") |
| `logoText` | chữ hiện tạm khi ảnh logo chưa tải xong |
| `nameLead` + `nameAccent` | tiêu đề lớn trang chủ; phần `accent` in nghiêng màu thương hiệu |

### `theme`
`primaryHex` là màu chủ đạo. Nó chảy vào **cả hai** mặt: biến `--brand` của trang bán hàng và biến
`--primary` của webapp. Không cần đổi màu ở đâu khác.

### `domains`
| Trường | Nghĩa |
|---|---|
| `funnelHost` | tên miền trang bán hàng — **không** kèm `https://`, **không** có dấu `/` |
| `appHost` | tên miền khu vực thành viên |
| `workerName` | tên Worker trên Cloudflare |
| `useCustomDomains` | `false` = chạy tạm trên `.workers.dev` khi tên miền chưa trỏ về Cloudflare |

### `product` và `payment`

`orderPrefix` là tiền tố mã đơn (`VIP7KD2QA`). Nó dùng ở **hai nơi**: lúc sinh mã đơn và lúc đọc nội
dung chuyển khoản từ ngân hàng — nên nó phải là một giá trị, không phải hai.

> **`payment` đi thẳng vào mã QR khách quét để trả tiền.** Sai một chữ số là tiền chạy sang tài khoản
> người khác. Thiếu thì hệ thống **từ chối tạo đơn** thay vì đoán — cố ý như vậy.

`accountName` phải **viết hoa không dấu**, đúng như ngân hàng ghi.

### `media`
`heroVideo` là video bán hàng ở trang chủ, `confirmVideo` là video hướng dẫn ở trang cảm ơn — hai
video nói hai chuyện khác nhau. Để trống `id` thì trang dùng nội dung có sẵn trong thiết kế.

### `funnel.pages`
Đường dẫn và tiêu đề từng trang. `worker/src/routes.generated.js` và `apps/funnel/build.mjs` đều đọc
từ đây, nên không thể lệch nhau. Bỏ một trang = xoá dòng tương ứng.

### `funnel.testimonials`
> Chỉ dùng tên và video của người thật **khi đã xin phép họ**. Bản template đi kèm 5 ô trống ghi
> "Học viên mẫu" — `videoId` để trống thì hiện ảnh giữ chỗ.

## `assets/`

Không có ảnh nào đi kèm template. Thả ảnh của bạn vào, đúng tên ghi trong `assets/README.txt`.
Thiếu ảnh nào thì build tự dùng ảnh giữ chỗ và in ra danh sách.

## `denylist.json`

Danh sách chuỗi cấm cho `npm run brand:check`. Nếu bạn dựng site cho khách của mình, **thêm** vào đây
tên và số tài khoản của khách trước đó — để lần sau không lỡ tay mang chúng sang site mới.

Mọi mẫu đều phải có **neo**: grep trần chữ "Thanh" trúng cả "thanh toán", "hoàn thành".
