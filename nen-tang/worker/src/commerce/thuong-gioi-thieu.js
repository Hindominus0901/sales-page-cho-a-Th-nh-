/**
 * Phan thuong theo so nguoi da moi - trao TU DONG, khong bat ai phai xin.
 *
 * Trang ban hang ban ba loai ve:
 *
 *   Standard  0d                 dien form la co
 *   Premium   moi 2 nguoi ban    "mo khoa bang loi moi, khong phai bang tien"
 *   VIP       399.000d           hoac - theo quyet dinh cua chi Thanh - moi 10 nguoi
 *
 * Nhung trong he thong thi ve Premium CHUA TUNG TON TAI: khong mot dong nao
 * trong `products`, khong mot quyen nao trong `entitlements`, khong mot chu
 * "premium" nao trong ma nguon. 28 nguoi da moi du 2 ban va khong ai trong so
 * do nhan duoc gi tu nen tang - ai nhan duoc la do co nguoi gui link tay, khong
 * ghi lai o dau, nen khong ai biet ai da nhan va ai chua. Dung mot nguoi len
 * tieng hoi thi moi lo ra.
 *
 * File nay dong cho trong do. Hai nguon su that, khong bia them cai nao:
 *
 *   - Qua Premium = cac dong trong bang `rewards` co `min_referrals > 0`.
 *     Chi Thanh tu them/sua trong trang quan tri, khong phai deploy lai.
 *   - Ve VIP      = `package:<SKU ve VIP>`, dung thu ma nguoi TRA TIEN nhan
 *     duoc, de moi cho chan quyen trong app deu mo dung nhu nhau.
 *
 * Chay duoc nhieu lan ma khong hong, va khong bao gio duoc phep lam hong duong
 * ghi nhan luot gioi thieu: moi loi o day deu bi nuot lai.
 */

const newId = () => crypto.randomUUID();

/** Tai khoan nen tang ung voi mot affiliate. Khong doan: chi lead roi den email. */
async function taiKhoanCua(store, affiliate) {
  if (affiliate.lead_id) {
    const u = await store.get('SELECT id, full_name FROM users WHERE legacy_lead_id = ?',
      [affiliate.lead_id]);
    if (u) return u;
  }
  const email = String(affiliate.email || '').trim().toLowerCase();
  if (!email) return null;
  return store.get('SELECT id, full_name FROM users WHERE lower(email) = ?', [email]);
}

/**
 * Trao het nhung gi mot nguoi da du dieu kien nhan.
 *
 * @param {object} deps  { store, cfg }
 * @param {object} affiliate  dong trong bang affiliates
 * @param {number} soLuot  so luot gioi thieu HOP LE hien tai
 * @returns {Promise<{qua: string[], ve_vip: boolean}>}
 */
export async function traoThuongTheoLuot({ store, cfg }, affiliate, soLuot) {
  const ketQua = { qua: [], ve_vip: false };
  if (!affiliate || !Number(soLuot)) return ketQua;

  const user = await taiKhoanCua(store, affiliate);
  // Chua tao tai khoan thi chua co cho de mo. Lan sau ho dang nhap va co them
  // mot luot moi, ham nay chay lai va trao bu - nen khong mat gi.
  if (!user) return ketQua;

  const now = new Date().toISOString();

  // --- qua Premium ----------------------------------------------------------
  const dsQua = await store.all(
    `SELECT id, name, image_url, delivery_url, delivery_note, min_referrals
       FROM rewards
      WHERE is_active = 1 AND min_referrals > 0 AND min_referrals <= ?`,
    [soLuot]);

  for (const qua of dsQua) {
    /* eslint-disable no-await-in-loop */
    const daCo = await store.get(
      'SELECT id FROM redemptions WHERE user_id = ? AND reward_id = ? LIMIT 1',
      [user.id, qua.id]);
    if (daCo) continue;

    // `coin_spent = 0` va trang thai 'delivered': day la qua TRAO, khong phai
    // qua doi - khong tru xu cua ai, va khong xep vao hang cho duyet.
    await store.run(
      `INSERT INTO redemptions
         (id, user_id, user_name, reward_id, reward_name, reward_image_url,
          coin_spent, status, delivery_url, note, created_date, updated_date)
       VALUES (?,?,?,?,?,?, 0, 'delivered', ?,?,?,?)`,
      [newId(), user.id, user.full_name || '', qua.id, qua.name, qua.image_url || null,
        qua.delivery_url || null,
        qua.delivery_note || `Mở khoá vì bạn đã mời ${qua.min_referrals} người bạn.`,
        now, now],
    ).catch((err) => {
      console.warn('[thuong] khong trao duoc qua', qua.name, err?.message || err);
      return null;
    });
    ketQua.qua.push(qua.name);
    /* eslint-enable no-await-in-loop */
  }

  // --- ve VIP ---------------------------------------------------------------
  const moc = Number(cfg.affiliate.vipAtReferrals) || 0;
  if (moc > 0 && soLuot >= moc && cfg.product.sku) {
    const res = await store.run(
      `INSERT OR IGNORE INTO entitlements
         (id, user_id, kind, ref, source, product_sku, granted_at, note,
          created_date, updated_date)
       VALUES (?,?, 'package', ?, 'gift', ?, ?, ?, ?, ?)`,
      [newId(), user.id, cfg.product.sku, cfg.product.sku, now,
        `Mời đủ ${moc} người bạn`, now, now],
    ).catch((err) => {
      console.warn('[thuong] khong mo duoc ve VIP', err?.message || err);
      return null;
    });
    // changes = 0 nghia la ho da co ve VIP tu truoc (mua, hoac da duoc trao).
    if (res && res.changes > 0) ketQua.ve_vip = true;
  }

  return ketQua;
}
