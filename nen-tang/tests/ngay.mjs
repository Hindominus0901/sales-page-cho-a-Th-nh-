/**
 * Bo test THUAN TUY thu hai: moc cat ngay.
 *
 * `worker/src/lib/ngay.js` khong cham database va khong cham HTTP, nen chay
 * thang bang node duoc - va do la cach DUY NHAT kiem duoc no cho ra so dung.
 * Ba bo kia deu goi qua HTTP nen chung chi thay duoc ngay HOM NAY, tuc la
 * chung chay dung y het nhau du moc cat la UTC hay gio Viet Nam. Dung lo hong
 * do da song lau: khe ho chi mo ra trong khoang 00:00-07:00 gio Viet Nam, va
 * bo test khong bao gio chay vao khung gio do o may cua ai ca.
 *
 * O day thi khac: co the chon thang mot khoanh khac de kiem.
 *
 * Chay rieng: node tests/ngay.mjs
 */
import { ngayDiaPhuong, khoangNgayDiaPhuong, moDauNgayDiaPhuong, LECH_MAC_DINH }
  from '../worker/src/lib/ngay.js';

let dat = 0;
let loi = 0;

function check(ten, ok, chiTiet) {
  if (ok) { dat += 1; console.log(`  OK   ${ten}`); return; }
  loi += 1;
  console.log(`  FAIL ${ten}` + (chiTiet === undefined ? '' : ` -> ${JSON.stringify(chiTiet)}`));
}

/** Dong bang dong ho o mot khoanh khac de kiem, roi tra lai nhu cu. */
function luc(isoUtc, viec) {
  const that = Date.now;
  Date.now = () => Date.parse(isoUtc);
  try { return viec(); } finally { Date.now = that; }
}

const VN = { TZ_OFFSET_MINUTES: '420' };

console.log('\n1. Ngay dia phuong');
check('mac dinh la UTC+7', LECH_MAC_DINH === 420, LECH_MAC_DINH);

// 18/09 luc 01:30 SANG gio Viet Nam = 17/09 luc 18:30 UTC.
// Day chinh la khoanh khac lam hong moi thu: cat theo UTC ra ngay 17,
// trong khi nguoi dung dang song o ngay 18.
const DEM_KHUYA = '2026-09-17T18:30:00.000Z';
check('1h30 sang gio VN duoc tinh la NGAY MOI, khong phai hom qua',
  luc(DEM_KHUYA, () => ngayDiaPhuong(VN)) === '2026-09-18',
  luc(DEM_KHUYA, () => ngayDiaPhuong(VN)));
check('cat theo UTC thi ra ngay hom truoc - dung thu da tung sai',
  new Date(Date.parse(DEM_KHUYA)).toISOString().slice(0, 10) === '2026-09-17');

// 23:30 gio VN van phai la ngay hom do, chua sang ngay moi.
const TOI_MUON = '2026-09-18T16:30:00.000Z';
check('23h30 gio VN van la ngay hom do',
  luc(TOI_MUON, () => ngayDiaPhuong(VN)) === '2026-09-18',
  luc(TOI_MUON, () => ngayDiaPhuong(VN)));

check('lui mot ngay ra dung hom qua',
  luc(DEM_KHUYA, () => ngayDiaPhuong(VN, -1)) === '2026-09-17');
check('tien mot ngay ra dung ngay mai',
  luc(DEM_KHUYA, () => ngayDiaPhuong(VN, 1)) === '2026-09-19');

check('thieu bien moi truong thi van chay theo UTC+7',
  luc(DEM_KHUYA, () => ngayDiaPhuong(undefined)) === '2026-09-18');
check('mui gio khac cung dung - UTC+0 thi van la ngay 17',
  luc(DEM_KHUYA, () => ngayDiaPhuong({ TZ_OFFSET_MINUTES: '0' })) === '2026-09-17');

console.log('\n2. Khoang mot ngay');
const [tu, den] = luc(DEM_KHUYA, () => khoangNgayDiaPhuong(VN));
// 00:00 ngay 18/09 gio VN = 17:00 ngay 17/09 UTC.
check('bat dau dung 00:00 gio VN (= 17:00 UTC hom truoc)', tu === '2026-09-17T17:00:00.000Z', tu);
check('ket thuc dung 24 tieng sau', den === '2026-09-18T17:00:00.000Z', den);
check('moDauNgayDiaPhuong tra ve dung dau khoang',
  luc(DEM_KHUYA, () => moDauNgayDiaPhuong(VN)) === tu);

// Day la phep thu that su quan trong: mot ban ghi tao luc 01:30 sang gio VN
// PHAI nam trong khoang cua ngay hom do. Ban cu dem bang substr(...,1,10) nen
// no roi vao ngay hom truoc, va tran/ngay reset som 7 tieng.
check('ban ghi luc 1h30 sang gio VN nam TRONG ngay hom do',
  DEM_KHUYA >= tu && DEM_KHUYA < den, { DEM_KHUYA, tu, den });
check('ban ghi luc 23h30 hom truoc gio VN nam NGOAI ngay hom do',
  !('2026-09-17T16:30:00.000Z' >= tu && '2026-09-17T16:30:00.000Z' < den));

console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
process.exit(loi ? 1 : 0);
