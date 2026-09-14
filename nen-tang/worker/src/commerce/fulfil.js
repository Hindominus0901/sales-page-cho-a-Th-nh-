/**
 * Giao hang sau khi don da thanh toan: mo quyen truy cap cho nguoi mua.
 *
 * Truoc day buoc nay khong ton tai. Ngan hang bao da nhan tien -> don chuyen
 * 'paid', sinh hoa hong, gan tag Kit... roi HET. Khoa hoc van khoa. Admin phai
 * vao mo tay cho tung nguoi, va neu quen thi khach tra 399k xong khong xem duoc
 * gi ca.
 *
 * Chay duoc nhieu lan ma khong hong: chi muc unique tren (user_id, kind, ref)
 * kem "INSERT OR IGNORE" nen webhook ban lai bao nhieu lan cung chi mot quyen.
 *
 * Khong bao gio DOAN nguoi mua. Khong khop duoc thi ghi vao nhat ky de admin
 * noi tay - mo nham tai khoan con te hon la khong mo.
 */

const newId = () => crypto.randomUUID();

/** Bo dau cach va ky tu la, giu lai chu so, de so dien thoai de so sanh. */
const digits = (s) => String(s || '').replace(/\D/g, '');

/**
 * Tim tai khoan ung voi mot don hang.
 * Theo thu tu tin cay giam dan: email tren don -> so dien thoai tren don ->
 * so dien thoai cua lead da tao ra don.
 *
 * @returns {Promise<{id:string}|null>}
 */
export async function findBuyer(rc, order) {
  const email = String(order.customer_email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await rc.store.get('SELECT id FROM users WHERE lower(email) = ?', [email]);
    if (byEmail) return byEmail;
  }

  const phone = digits(order.customer_phone);
  if (phone.length >= 8) {
    // phone_e164 luu dang +84..., con don luu 09... - so sanh 8 chu so cuoi.
    const tail = phone.slice(-8);
    const byPhone = await rc.store.get(
      "SELECT id FROM users WHERE phone_e164 IS NOT NULL AND substr(replace(phone_e164,'+',''), -8) = ?",
      [tail]);
    if (byPhone) return byPhone;
  }

  if (order.lead_id) {
    const lead = await rc.store.get('SELECT phone_e164, email FROM leads WHERE id = ?', [order.lead_id]);
    if (lead?.email) {
      const byLeadEmail = await rc.store.get(
        'SELECT id FROM users WHERE lower(email) = ?', [String(lead.email).toLowerCase()]);
      if (byLeadEmail) return byLeadEmail;
    }
    const leadTail = digits(lead?.phone_e164).slice(-8);
    if (leadTail.length === 8) {
      const byLeadPhone = await rc.store.get(
        "SELECT id FROM users WHERE phone_e164 IS NOT NULL AND substr(replace(phone_e164,'+',''), -8) = ?",
        [leadTail]);
      if (byLeadPhone) return byLeadPhone;
    }
  }

  return null;
}

/** Danh sach thu can mo cho mot ma san pham. */
async function grantsFor(rc, sku) {
  // Luon ghi mot quyen theo chinh ma san pham. Nho vay he thong van biet "nguoi
  // nay da mua VIP" ngay ca khi admin chua khai bao san pham nao trong bang
  // products - va lan sau khai bao them thi chi la co them quyen, khong mat gi.
  const out = [{ kind: 'package', ref: sku }];

  const product = await rc.store.get('SELECT grants_json FROM products WHERE sku = ?', [sku])
    .catch(() => null);
  if (!product) return out;

  let list = [];
  try { list = JSON.parse(product.grants_json || '[]'); } catch { list = []; }
  for (const g of Array.isArray(list) ? list : []) {
    if (g && typeof g.kind === 'string' && typeof g.ref === 'string' && g.ref) {
      out.push({ kind: g.kind, ref: g.ref });
    }
  }
  return out;
}

/**
 * Mo quyen cho mot don da thanh toan.
 *
 * @returns {Promise<{ok:boolean, granted:number, userId?:string, reason?:string}>}
 */
export async function fulfilOrder(rc, order) {
  if (!order || order.status !== 'paid') return { ok: false, granted: 0, reason: 'don_chua_thanh_toan' };

  const buyer = await findBuyer(rc, order);
  if (!buyer) {
    // Rat hay gap: khach mua truoc, tao tai khoan sau. Ghi lai de admin mo tay,
    // va de sau nay lenh doi soat quet lai duoc.
    await rc.store.audit('order.fulfil_pending', order.code, {
      reason: 'chua_tim_thay_tai_khoan',
      email: order.customer_email || null,
      phone: order.customer_phone || null,
    }, rc.ip).catch(() => {});
    return { ok: false, granted: 0, reason: 'chua_tim_thay_tai_khoan' };
  }

  const grants = await grantsFor(rc, order.product_sku);
  const now = new Date().toISOString();
  let granted = 0;

  for (const g of grants) {
    /* eslint-disable no-await-in-loop */
    const res = await rc.store.run(
      `INSERT OR IGNORE INTO entitlements
         (id, user_id, kind, ref, source, order_id, product_sku,
          granted_at, created_date, updated_date)
       VALUES (?,?,?,?, 'order', ?,?, ?,?,?)`,
      [newId(), buyer.id, g.kind, g.ref, order.id, order.product_sku, now, now, now],
    ).catch((err) => {
      console.warn('[fulfil] khong cap duoc quyen', g.kind, g.ref, err?.message || err);
      return null;
    });
    if (res) granted += 1;
    /* eslint-enable no-await-in-loop */
  }

  await rc.store.audit('order.fulfilled', order.code, {
    user_id: buyer.id, granted, grants: grants.map((g) => `${g.kind}:${g.ref}`),
  }, rc.ip).catch(() => {});

  return { ok: true, granted, userId: buyer.id };
}
