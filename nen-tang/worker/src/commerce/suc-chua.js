/**
 * Dem cho con lai cua mot khoa.
 *
 * Trang ban hang tra loi cau "Lop co bao nhieu nguoi?" bang
 * "Toi da 30 cho moi khoa" (apps/funnel-gc/site.config.json). Truoc file nay
 * khong co gi dem cho, nen nguoi thu 31 dat don binh thuong - mot cau khan
 * hiem ma he thong khong giu duoc.
 *
 * ============ BA QUYET DINH, VA VI SAO ============
 *
 * 1. CHUA DAT TRAN = KHONG CHAN GI.
 *    `seats_total` NULL hoac <= 0 -> `conBan: true` va `conLai: null`. He
 *    thong chay y het khi chua ai dat con so. Mot cua chan mac dinh DONG la
 *    cach nhanh nhat de chan duong tien cua mot lop dang ban binh thuong.
 *
 * 2. CHI DEM DON DA TRA TIEN.
 *    Dem ca don 'pending' thi 30 nguoi bam thu roi bo di se khoa chet cho cua
 *    30 nguoi that. Don chi duoc tinh khi tien da ve: 'paid' hoac 'overpaid'.
 *
 * 3. DEM TU MOC `cohort_start_at`.
 *    Thieu moc nay thi bo dem cong don ca lich su, va mo ban khoa 2 la trang
 *    bao "het cho" ngay hom dau vi 30 don khoa 1 da an het cho khoa 2. Ung
 *    dung con lai trong repo nay da va phai dung cai bay do (xem
 *    src/routes/public.ts:30) - day la ban sao cua cach ho giai.
 *
 * Khong tim thay dong san pham thi cung KHONG chan: ve chinh cua chuong trinh
 * lay gia tu bien moi truong chu khong bat buoc co dong trong `products`
 * (orders.js:113), nen "khong co dong" la chuyen binh thuong, khong phai loi.
 */

const so = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @returns {{ tran: number|null, daBan: number, conLai: number|null, conBan: boolean }}
 *   tran   = so cho toi da, null khi chua dat
 *   daBan  = so don da tra tien trong khoa hien tai, cong seats_offset
 *   conLai = con bao nhieu cho, null khi chua dat tran
 *   conBan = con nhan don moi duoc khong
 */
export async function sucChua(store, sku) {
  const ma = String(sku || '').trim();
  if (!ma) return { tran: null, daBan: 0, conLai: null, conBan: true };

  const sp = await store.get(
    'SELECT seats_total, seats_offset, cohort_start_at FROM products WHERE sku = ?', [ma]);

  const tran = so(sp?.seats_total);
  if (!sp || tran <= 0) return { tran: null, daBan: 0, conLai: null, conBan: true };

  // PHAI loc theo product_sku.
  //
  // Khu vuc thanh vien co mot gian hang ban nhieu mon (worker/src/routes/
  // orders.js:120 nhan `product_sku` tuy y). Dem tat ca don da tra tien thi mot
  // nguoi mua goi qua 50.000d cung an mot cho cua lop 21 ngay - va lop bao het
  // cho trong khi chua ai ghi danh. Cau tren trang noi "LOP co 30 cho", nen chi
  // don cua chinh san pham do duoc tinh.
  const moc = sp.cohort_start_at || null;
  const dem = moc
    ? await store.get(
      `SELECT COUNT(*) AS n FROM orders
        WHERE product_sku = ? AND status IN ('paid','overpaid') AND paid_at >= ?`, [ma, moc])
    : await store.get(
      `SELECT COUNT(*) AS n FROM orders
        WHERE product_sku = ? AND status IN ('paid','overpaid')`, [ma]);

  const daBan = so(dem?.n) + so(sp.seats_offset);
  const conLai = Math.max(0, tran - daBan);
  return { tran, daBan, conLai, conBan: conLai > 0 };
}
