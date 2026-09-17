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

/**
 * @param {number} capDo Cap bac hien tai cua nguoi dung (computeLevel().levelNumber).
 * @returns {boolean} khoa nay co mo khong.
 *
 * `capDo` LA THAM SO BAT BUOC VE MAT Y NGHIA du no co gia tri mac dinh.
 *
 * gateByCourse ben may chu (worker/src/entities/repo.js) coi mot khoa la mo khi
 *     !requires_unlock VA myLevel >= min_level
 * nhung ham nay truoc day bo qua han `min_level`. Nen mot khoa
 * requires_unlock = 0, min_level = 2 se hien ra nhu DA MO: khong huy hieu khoa,
 * nut xanh "Xem khoa hoc", danh sach bai giang day du. Bam vao mot bai thi may
 * chu da che mat video_id, va hoc vien doc duoc cau "Can mua goi tuong ung" -
 * mot cau SAI: o day khong co gi de mua ca, chi la chua du XP. Ho di nhan admin
 * hoi ve mot goi khong ton tai.
 *
 * Mac dinh 0 la de nhung cho goi cu khong vo; nhung goi ma khong truyen cap bac
 * thi van hien nham nhu truoc, nen dung bo qua no.
 */
export function daMoKhoa(course, entitlements = [], quaGoi = new Set(), capDo = 0) {
  if (!course) return false;
  // Quyen rieng va quyen qua goi THANG cap bac: da mua thi khong con doi XP.
  if (quaGoi.has(course.id)) return true;
  if (entitlements.some((e) => e.kind === 'course' && e.ref === course.id && !e.revoked_at)) {
    return true;
  }
  if (course.requires_unlock) return false;
  return Number(capDo || 0) >= Number(course.min_level || 0);
}

/** Vi sao mot khoa dang dong - de man hinh noi dung chuyen thay vi doan. */
export function lyDoKhoa(course, capDo = 0) {
  if (!course) return '';
  const can = Number(course.min_level || 0);
  if (!course.requires_unlock && can > 0 && Number(capDo || 0) < can) {
    return `Khoá này mở từ cấp ${can}. Bạn tích thêm XP là vào được, không cần mua gì.`;
  }
  return 'Bạn cần được admin mở khoá hoặc mua gói tương ứng để vào học.';
}
