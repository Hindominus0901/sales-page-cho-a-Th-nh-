# Phát hành bản template

## Bắt buộc: lịch sử git phải sạch

`npm run brand:check` chỉ quét **cây làm việc**. Nó không nói gì về `.git`. Xoá một file ở commit mới
**không** xoá nó khỏi lịch sử — người mua vẫn `git log -p` đào ra được số tài khoản, mã tài nguyên
Cloudflare đang sống, và cả một bản sao lưu cơ sở dữ liệu nếu nó từng được commit.

Nên bản template **luôn được phát hành sang một repo trắng**, không bao giờ `git clone` từ repo của
khách:

```bash
# 1. Xuất cây làm việc từ nhánh template (không mang .git theo)
mkdir /tmp/phat-hanh && git archive template | tar -x -C /tmp/phat-hanh

# 2. Lịch sử mới, một commit
cd /tmp/phat-hanh && git init -b main && git add -A && git commit -m "Ban template"

# 3. Chứng minh sạch — cả cây lẫn lịch sử
npm run brand:check -- --git

# 4. Đẩy lên repo riêng
gh repo create <ten-repo> --private --source=. --push
```

`git archive` chỉ lấy file **có trong git**, nên tự động loại: `.env`, `data/`, `*.zip`, `_unused/`,
`kit-ids.json`, `node_modules/`, `dist/`, `.wrangler/`.

## Trước khi chuyển repo sang công khai

- [ ] `npm run brand:check -- --git --strict` sạch
- [ ] `npm test` — 278/278
- [ ] `npm run build` không báo thiếu gì ngoài ảnh
- [ ] Không còn ảnh chân dung, lời chứng thực hay tên của người thật nào
- [ ] Hai trang pháp lý đã có luật sư rà (`chinh-sach-bao-mat`, `dieu-khoan`)
- [ ] `wrangler.jsonc` chỉ chứa mã tài nguyên giả (`00000000-...`)
- [ ] Dựng thử một thương hiệu mới từ số không, không sửa một dòng mã nào

## Khi dựng site cho khách tiếp theo

Thêm tên, tên miền và số tài khoản của **khách vừa xong** vào `brand/denylist.json`. Lần sau
`brand:check` sẽ chặn nếu chúng lỡ đi theo sang site mới.
