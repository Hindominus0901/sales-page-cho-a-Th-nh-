# ĐỌC TRƯỚC TIÊN — repo này chứa HAI ứng dụng, không phải một

Đây là thứ dễ vấp nhất ở repo này, và nó đã làm mất thời gian thật: `README.md`
ngay dòng 3 ghi *"Một codebase, một lần deploy"* — **sai**. Có hai ứng dụng
hoàn chỉnh, khác nhau hoàn toàn, **cả hai đều đã deploy lên Cloudflare thật**.

| | Thư mục gốc (chỗ bạn đang đứng) | `nen-tang/` |
|---|---|---|
| Worker | `goc-creator-challenge` | `goc-creator-platform` |
| Vào từ | `src/worker.ts` — Hono + TypeScript | `worker/src/index.js` — JS thuần |
| Giao diện | HTML tĩnh dựng sẵn + 2 SPA (`admin/`, `affiliate/`) | React SPA ở `apps/web/` |
| D1 | `goc-creator` — `aab67b83-6f86-4429-b7e8-215c6d4c5c2a` | `platform` — `2f1cb0b0-c3de-44e1-8765-a8b0cc52bcf7` |
| Bí mật webhook SePay | `SEPAY_WEBHOOK_API_KEY` | `BANK_WEBHOOK_SECRET` |
| Khai tên miền | không dòng nào, kể cả `env.production` | `manhthanh.net` + `app.manhthanh.net` (`wrangler.jsonc:23-26`) |
| Deploy bằng | **Workers Builds** — Cloudflare tự chạy `wrangler deploy` khi có push lên nhánh nó theo dõi | `npm run deploy` qua `nen-tang/scripts/cf.mjs` |
| Hướng dẫn riêng | (file này) | `nen-tang/CLAUDE.md` |

Hai bên **không dùng chung gì cả**: khác database, khác tên biến bí mật, khác
trang quản trị, khác bộ test. Sửa ở bên này không ảnh hưởng bên kia.

## Trước khi deploy: xác định cái nào đang giữ `manhthanh.net`

Custom domain là **độc quyền** — một hostname chỉ thuộc một Worker. Deploy nhầm
ứng dụng là **cướp tên miền khỏi bản đang phục vụ khách**. Đừng suy đoán từ
ngày sửa file; hỏi thẳng bản thật:

```bash
curl -i https://manhthanh.net/api/health
```

`/api/health` **chỉ có ở `nen-tang`** (`nen-tang/worker/src/router.js:77`). Ứng
dụng gốc không khai đường này.

- **200** kèm `{"ok":true,"storage":"d1","version":2,…}` → `goc-creator-platform`
  (`nen-tang/`) đang giữ tên miền.
- **404** hoặc trả HTML trang bán hàng → ứng dụng gốc đang giữ tên miền.

Cách chắc chắn nhất, không phải suy luận: Cloudflare dashboard →
**Workers & Pages** → từng Worker → **Settings → Domains & Routes**.

`wrangler deployments list --name <ten-worker>` **không** trả lời được câu này —
nó chỉ in lịch sử deploy, không in tên miền. Đừng dùng nó để kết luận.

## Cảnh báo riêng cho ứng dụng gốc: Workers Builds đẩy thẳng lên bản thật

`wrangler.jsonc:25-27` ghi rõ: Workers Builds chạy `wrangler deploy` **không
kèm `--env`**, nên nó luôn deploy tầng mặc định — và tầng mặc định **là bản
chạy thật** (D1 `goc-creator`, KV thật).

Nghĩa là **push lên nhánh Cloudflare đang theo dõi là lên thẳng bản thật**,
không qua tay ai, không có bước duyệt. Kiểm nhánh đó trong dashboard
(**Workers & Pages → goc-creator-challenge → Settings → Builds**) trước khi
push bất cứ thứ gì lên nhánh khác `main`.

## Đang sửa cái nào thì đọc hướng dẫn của cái đó

- Làm việc dưới `nen-tang/` → **`nen-tang/CLAUDE.md`** là luật. Nó có luật vàng
  riêng (`brand/brand.json` là nguồn sự thật duy nhất), các bất biến về test, và
  quy tắc an toàn tiền bạc. Đừng áp luật của file này vào đó.
- Làm việc ở thư mục gốc → `README.md` mô tả ứng dụng này, nhưng **bỏ qua câu
  "Một codebase, một lần deploy"**.
