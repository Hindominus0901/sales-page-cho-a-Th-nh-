# Bàn giao hệ thống — GIAO ĐỨT

Tài liệu này để bàn giao toàn quyền site bán hàng + cộng đồng học viên
cho một người mới, khi lập trình viên hiện tại **rời hẳn**.

## Bối cảnh (đã xác nhận)

- **Tài khoản Cloudflare**: của **khách** — Worker, D1 (dữ liệu học viên), KV, R2,
  DNS tên miền đều đã nằm trong quyền sở hữu của khách. **Không cần di cư gì.**
- **Tài khoản bên thứ ba** (Resend, SePay/ngân hàng, Google OAuth, Kit, Facebook,
  video): đều của **khách**. Lập trình viên cũ không sở hữu → không có gì để chuyển.
- **Mã nguồn**: repo GitHub `Hindominus0901/adm-ai-funnel` đứng tên lập trình viên cũ.
- **Kiểu bàn giao**: giao đứt — sau khi xong, lập trình viên cũ **không còn quyền nào**.

Vì tài khoản Cloudflare và tiền đã của khách, **hệ thống không gián đoạn** trong suốt
quá trình bàn giao. Việc bàn giao chỉ là chuyển *quyền chỉnh sửa*, không đụng vào bản chạy.

---

## Ai làm gì — checklist

### A. Lập trình viên cũ (người rời đi)

- [ ] **Chuyển repo GitHub** sang tài khoản/tổ chức của khách hoặc dev mới:
      GitHub → repo → `Settings → General → Danger Zone → Transfer ownership`.
      Giữ nguyên toàn bộ lịch sử commit. *(Cần biết username/tổ chức GitHub của bên nhận.)*
- [ ] **Đưa file `.env`** (bí mật để chạy ở máy) cho dev mới qua kênh an toàn —
      trình quản lý mật khẩu hoặc file mã hoá. **Không dán vào chat/email/Zalo dạng chữ thường.**
- [ ] Đưa kèm `.env.example` (đã có sẵn trong repo) để dev mới đối chiếu từng trường.
- [ ] Bàn giao tài liệu này + `README.md` + `CLAUDE.md`.
- [ ] Sau khi mọi bước dưới xong: xác nhận đã **không còn** đăng nhập vào Cloudflare,
      GitHub, hay bất kỳ dịch vụ nào của khách. File `.env` còn trên máy cũ sẽ **vô hiệu**
      sau khi khách xoay khoá ở bước C.

### B. Khách (chủ tài khoản Cloudflare) — cấp quyền cho dev mới

- [ ] Mời dev mới vào Cloudflare: `Manage Account → Members → Invite` → email dev mới →
      role **Administrator** (hoặc Super Administrator nếu muốn toàn quyền tuyệt đối).
- [ ] Chấp nhận (hoặc yêu cầu bên nhận chấp nhận) lời mời **Transfer** repo GitHub từ bước A.
- [ ] Nếu Kit/Resend/Google/SePay/Facebook cần dev mới thao tác: mời dev mới vào từng
      dịch vụ đó (đều là tài khoản của khách nên chỉ cần "mời thành viên").

### C. Khách — gỡ lập trình viên cũ & xoay khoá (làm SAU khi dev mới vào được)

- [ ] **Gỡ lập trình viên cũ** khỏi Cloudflare: `Manage Account → Members` → xoá.
- [ ] Gỡ lập trình viên cũ khỏi GitHub (nếu từng là collaborator) và các dịch vụ khác.
- [ ] **Xoay lại Cloudflare API token** lập trình viên cũ từng dùng
      (`CLOUDFLARE_API_TOKEN` trong `.env`): Cloudflare → My Profile → API Tokens →
      Roll/Delete token cũ, tạo token mới cho dev mới.
- [ ] **Xoay các bí mật** lập trình viên cũ từng thấy (xem bảng dưới). Việc này do
      **dev mới** chạy trên tài khoản Cloudflare của khách.

### D. Dev mới — chạy được ở máy + xoay bí mật

- [ ] Clone repo (sau khi transfer), `npm install` (Node ≥ 22).
- [ ] `wrangler login` bằng tài khoản Cloudflare của khách (đã được mời ở bước B).
- [ ] Tạo `.env` riêng ở máy (từ `.env.example` + giá trị thật do khách/lập trình viên cũ cấp).
- [ ] Cài Claude Code (nếu muốn dùng) trên máy mình.
- [ ] **Xoay các bí mật** ở bảng dưới, rồi `npm run deploy`.
- [ ] Nghiệm thu: mở trang bán hàng → tạo một đơn thật → quét mã QR → xác nhận
      **ra đúng số tài khoản ngân hàng của khách** → đăng nhập webapp bằng tài khoản admin.

---

## Bảng xoay bí mật (bắt buộc khi giao đứt)

Đây là những khoá lập trình viên cũ từng thấy. Đổi mới để họ không còn cửa vào.
Chạy trên tài khoản Cloudflare của khách:

| Bí mật | Cách đổi |
|---|---|
| `ADMIN_PASSWORD_HASH` | `npm run hash-password "<mật khẩu mới>"` → `npx wrangler secret put ADMIN_PASSWORD_HASH` |
| `ADMIN_SERVICE_TOKEN` | sinh chuỗi ngẫu nhiên mới → `npx wrangler secret put ADMIN_SERVICE_TOKEN` |
| `SESSION_SECRET` | sinh chuỗi ngẫu nhiên mới → `npx wrangler secret put SESSION_SECRET` |
| `OTP_PEPPER` | sinh chuỗi ngẫu nhiên mới → `npx wrangler secret put OTP_PEPPER` |
| `BANK_WEBHOOK_SECRET` | đặt trùng với secret cấu hình bên SePay/Casso → `npx wrangler secret put BANK_WEBHOOK_SECRET` |

Sinh chuỗi ngẫu nhiên nhanh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> ⚠️ Đổi `SESSION_SECRET` và `OTP_PEPPER` sẽ **đăng xuất toàn bộ học viên** và làm mọi
> mã OTP đang chờ hết hiệu lực. Làm lúc vắng người, và báo trước nếu cần.

> ⚠️ `BANK_WEBHOOK_SECRET` phải **khớp** với giá trị đặt bên SePay/Casso, nếu không
> webhook ngân hàng bị từ chối 401 và **đơn không tự xác nhận** dù tiền đã về.

---

## Không cần làm (vì đã của khách)

- ❌ Chuyển tài khoản ngân hàng / đổi `BANK_ACCOUNT` — đã đúng của khách.
- ❌ Chuyển tên miền — DNS đã trong Cloudflare của khách.
- ❌ Di cư D1 / R2 / KV — đứng yên trong tài khoản khách, không export/import.
- ❌ Chuyển Resend / Google / Kit / Facebook — đều của khách, chỉ cần mời dev mới vào.

---

## Kiểm tra "đã xong" (nghiệm thu cuối)

```bash
npm run brand:check && npm test && npm run build
```

Cả ba xanh, và trên bản thật:
- form gửi được, đơn tạo được, **mã QR ra đúng số tài khoản của khách**;
- đăng nhập webapp bằng tài khoản admin (mật khẩu mới);
- lập trình viên cũ xác nhận không còn truy cập được vào đâu.
