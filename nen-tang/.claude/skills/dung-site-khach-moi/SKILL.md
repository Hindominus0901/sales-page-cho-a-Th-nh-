---
name: dung-site-khach-moi
description: Dung mot site ban hang + cong dong hoc vien moi tu template nay, tu phong van thuong hieu den deploy len Cloudflare. Dung khi nguoi dung noi "dung site moi", "lam site cho khach", "setup thuong hieu moi", "bootstrap", hoac dua thong tin mot thuong hieu de len site.
---

# Dựng site cho khách mới

Đọc `CLAUDE.md` trước. Luật vàng: **giá trị của khách chỉ sống ở `brand/brand.json`**.

## Bước 1 — Phỏng vấn

Hỏi gọn, hỏi hết một lượt, đừng hỏi lắt nhắt. Cần:

| Nhóm | Hỏi gì |
|---|---|
| Danh tính | Tên thương hiệu; tên pháp nhân; tên chương trình; tên người hướng dẫn; màu chủ đạo (mã hex) |
| Tên miền | Tên miền trang bán hàng; tên miền khu vực thành viên; **đã trỏ nameserver về Cloudflare chưa** |
| Sản phẩm | Tên; giá bán; giá niêm yết gạch ngang; mã sản phẩm; tỉ lệ hoa hồng |
| Nhận tiền | **Ngân hàng, số tài khoản, tên chủ tài khoản viết hoa không dấu** |
| Liên hệ | Số Zalo; link Zalo; link nhóm Zalo |
| Nội dung | Video bán hàng (Wistia/YouTube ID); Facebook Pixel; ảnh (logo, chân dung, lớp học) |

Chưa có gì thì để trống và nói rõ tính năng nào sẽ tắt — **trừ số tài khoản**: thiếu nó thì không
bán được, hệ thống sẽ từ chối tạo đơn (cố ý).

## Bước 2 — Điền và kiểm

```bash
npm run brand:validate && npm run brand:apply
```
`validate` báo lỗi bằng tiếng người (số tài khoản có dấu gạch, tên miền kèm `https://`, giá niêm yết
thấp hơn giá bán). Sửa tới khi sạch.

## Bước 3 — Chạy thử ở máy

```bash
npm run hash-password "<mật khẩu quản trị>"    # dán vào .env
npm run db:migrate
npm run brand:seed -- --local --admin-email <email>
npm run build
npm run dev:worker &                            # chờ /api/health trả 200
npm test                                        # 278/278, chạy TUẦN TỰ
npm run brand:check
```

## Bước 4 — Lên bản thật

```bash
npm run setup:cloudflare      # tạo D1 + KV + R2, migration thật, liệt kê bí mật thiếu
# nạp từng bí mật theo lệnh nó in ra
npm run brand:seed -- --remote --admin-email <email>
npm run deploy
```

## Bước 5 — Nghiệm thu bản thật

- Mở trang bán hàng: có hiện đúng tên thương hiệu và màu không.
- Điền form đăng ký → có nhận được email mã xác nhận không (cần Resend đã xác minh tên miền).
- Tạo đơn → **quét thử mã QR, phải ra đúng số tài khoản của khách**. Đây là phép kiểm quan trọng nhất.
- Đăng nhập webapp bằng tài khoản quản trị vừa tạo.
- `node tests/smoke.mjs https://<tên miền>` — bộ duy nhất chạy được với bản đã deploy.

## Gặp lỗi

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `Authentication error` khi setup | token thiếu quyền **Edit** (không phải Read) |
| Gắn tên miền thất bại | tên miền chưa là zone trong chính tài khoản đó |
| `wrangler secret put` lỗi 10007 | Worker chưa tồn tại — deploy một lần trước rồi nạp bí mật |
| Trang trả 404 | đường dẫn khai trong `brand.funnel.pages` chưa khớp với file thiết kế |
| Build báo `.env dang noi khac brand.json` | chạy `npm run brand:apply` |
| Test đỏ hàng loạt với `unauthorized` | có hai bộ test chạy chồng nhau, hoặc `wrangler dev` chưa chạy |
| Tạo đơn trả 503 | chưa cấu hình tài khoản nhận tiền — cố ý chặn |

## Đừng làm

- Đừng gõ giá trị của khách vào bất kỳ file nào ngoài `brand/brand.json`.
- Đừng chạy `tests/auth.mjs` hay `tests/platform.mjs` trỏ vào cơ sở dữ liệu thật — chúng có lệnh xoá.
- Đừng thêm giá trị mặc định cho thứ gì dính tiền.
- Đừng mở repo template ra công khai khi còn nội dung của một khách cụ thể trong đó.
