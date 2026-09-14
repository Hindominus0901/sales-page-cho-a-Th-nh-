/**
 * Mot khoa hoc co mo cho nguoi nay khong.
 *
 * BA DUONG MO, thieu duong nao cung sai lech voi may chu:
 *   1. Khoa khong doi mo khoa (`requires_unlock = 0`)
 *   2. Co quyen `course` tro dung khoa do - cap luc mua, hoac admin cap tay
 *   3. Dang so huu mot GOI ma `grants_json` cua goi do chua khoa nay
 *
 * Duong 3 la duong hay bi quen nhat, va quen no thi hong theo kieu te nhat:
 * may chu MO video (gateByCourse trong worker/src/entities/repo.js da tinh ca
 * goi), nhung giao dien van ve man hinh khoa len - nguoi da tra tien nhin thay
 * o khoa trong khi ho co quyen day du.
 *
 * `fulfilOrder` cap quyen `course` theo grants_json TAI THOI DIEM tra tien, nen
 * ai mua goi luc no con rong thi chi co quyen `package`. Do la 44 nguoi da mua
 * ve VIP truoc khi chi Thanh soan noi dung.
 */

/** Tap id khoa hoc duoc mo boi cac goi nguoi nay dang so huu. */
export function khoaMoQuaGoi(entitlements = [], sanPham = []) {
  const skuDangCo = new Set(
    entitlements.filter((e) => e.kind === 'package' && !e.revoked_at).map((e) => e.ref),
  );
  const out = new Set();
  for (const sp of sanPham) {
    if (!skuDangCo.has(sp.sku)) continue;
    let ds = sp.grants_json;
    if (typeof ds === 'string') { try { ds = JSON.parse(ds); } catch { ds = []; } }
    for (const g of Array.isArray(ds) ? ds : []) {
      if (g?.kind === 'course' && g?.ref) out.add(g.ref);
    }
  }
  return out;
}

/** @returns {boolean} khoa nay co mo khong. */
export function daMoKhoa(course, entitlements = [], quaGoi = new Set()) {
  if (!course) return false;
  if (!course.requires_unlock) return true;
  if (quaGoi.has(course.id)) return true;
  return entitlements.some(
    (e) => e.kind === 'course' && e.ref === course.id && !e.revoked_at,
  );
}
