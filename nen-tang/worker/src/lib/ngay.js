/**
 * MOT MOC NGAY DUY NHAT CHO CA HE THONG: NGAY THEO GIO VIET NAM.
 *
 * Vi sao phai co file nay: truoc day moi cho tu cat ngay lay, va phan lon cat
 * theo UTC bang `new Date().toISOString().slice(0, 10)`. UTC+7 nghia la moc do
 * roi vao 07:00 sang gio Viet Nam, nen tu 00:00 den 07:00:
 *
 *   - Tran/ngay (`point_rules.daily_cap`) chua reset, hoac vua reset som mot
 *     ngay - mot muc "moi ngay mot lan" an duoc HAI lan trong khoang do.
 *   - Chuoi ngay (`users.last_activity_date`) ghi nham sang ngay hom truoc,
 *     nen ai lam bai luc 1-2 gio sang bi tinh la "hoat dong cua hom qua".
 *   - Bang xep hang "Hom nay" hien diem cua HOM QUA.
 *   - Cron nhac chuoi ngay thi lai cat dung theo gio Viet Nam (cron.js) - tuc
 *     la hai nua cua cung mot tinh nang doc hai cai lich khac nhau, va nguoi
 *     dung nhan email "ban sap mat chuoi" trong khi ho vua lam bai xong.
 *
 * `ngayThuThach` trong functions/index.js da lam dung tu lau va co chu thich
 * giai thich vi sao. File nay chi keo phan con lai ve cung mot moc.
 *
 * Do lech lay tu TZ_OFFSET_MINUTES (sinh tu brand/brand.json), mac dinh 420.
 */
export const LECH_MAC_DINH = 420;

/**
 * `Number(x) || 420` la SAI o day: UTC+0 la mot mui gio that, ma so 0 thi
 * falsy nen no bi coi la "chua dat" va am tham nhay ve UTC+7. Cung mot loai
 * bay da duoc ghi ro o tyLeCua() trong affiliates.js - so 0 la mot quyet dinh,
 * khong phai mot o trong.
 */
const lechCua = (env) => {
  const n = Number(env?.TZ_OFFSET_MINUTES);
  return Number.isFinite(n) && env?.TZ_OFFSET_MINUTES !== '' && env?.TZ_OFFSET_MINUTES != null
    ? n : LECH_MAC_DINH;
};

/** 'YYYY-MM-DD' cua hom nay theo gio dia phuong. `lechNgay` de lui/tien ngay. */
export function ngayDiaPhuong(env, lechNgay = 0) {
  const ms = Date.now() + lechCua(env) * 60000 + lechNgay * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Khoang [tu, den) tinh bang moc thoi gian UTC cua mot ngay dia phuong.
 *
 * Tra ve chuoi ISO de so sanh THANG voi cac cot luu ISO (`awarded_at`,
 * `created_date`). Co y khong dung ham datetime() cua SQLite: cot dang luu
 * dang 'YYYY-MM-DDTHH:MM:SS.sssZ', ma SQLite khong doc chac chan duoc chu 'Z'
 * o cuoi tren moi phien ban - so sanh chuoi thi luon dung, va con dung duoc
 * chi muc.
 */
export function khoangNgayDiaPhuong(env, lechNgay = 0) {
  const lech = lechCua(env) * 60000;
  const dau = Date.parse(`${ngayDiaPhuong(env, lechNgay)}T00:00:00Z`) - lech;
  return [new Date(dau).toISOString(), new Date(dau + 86400000).toISOString()];
}

/** Moc UTC cua 00:00 ngay dia phuong - dung cho cac cau loc "tu dau hom nay". */
export function moDauNgayDiaPhuong(env, lechNgay = 0) {
  return khoangNgayDiaPhuong(env, lechNgay)[0];
}
