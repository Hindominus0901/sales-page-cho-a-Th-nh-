/**
 * Bo test THUAN TUY cho hai ham QUYET DINH cua duong tien.
 *
 * Ca hai deu la ham thuan: khong cham database, khong cham HTTP. Va ca hai deu
 * dung o cho khong duoc phep sai:
 *
 *   khopTaiKhoan  - quyet dinh co xac nhan mot don hay khong khi tien vao mot
 *                   tai khoan khac voi tai khoan da cau hinh.
 *   extractCode   - doc ma don tu noi dung chuyen khoan. Doc sai la tien ve ma
 *                   don nam mai o "cho thanh toan".
 *
 * Vi sao phai la bo rieng, khong nhet vao bo goi qua HTTP: nhung bo kia chi di
 * duoc mot duong moi lan chay, con o day co the ne het moi dang du lieu la ma
 * ngan hang gui ve - so bi che, so co gach ngang, so qua ngan, hai tai khoan
 * trung 4 so cuoi.
 *
 * Chay rieng: node tests/tien.mjs
 */
import { khopTaiKhoan, extractCode } from '../worker/src/routes/webhook.js';

let dat = 0;
let loi = 0;

function check(ten, ok, chiTiet) {
  if (ok) { dat += 1; console.log(`  OK   ${ten}`); return; }
  loi += 1;
  console.log(`  FAIL ${ten}` + (chiTiet === undefined ? '' : ` -> ${JSON.stringify(chiTiet)}`));
}

console.log('\n1. Khop so tai khoan nhan tien');
// `null` = KHONG DU CO SO DE PHAN XU. Phan biet ro voi `false` (lech that):
// chi `false` moi chan mot khoan tien, con `null` thi cho di tiep.
check('khop chinh xac', khopTaiKhoan('0123456789', '0123456789') === true);
check('lech han -> false', khopTaiKhoan('0123456789', '9876543210') === false);
check('so bi che dau (xxxx6789) van khop theo duoi',
  khopTaiKhoan('xxxx6789', '0123456789') === true, khopTaiKhoan('xxxx6789', '0123456789'));
check('co dau cach va gach ngang van khop',
  khopTaiKhoan('0123 456 789', '0123-456-789') === true);
check('chua cau hinh tai khoan -> null, KHONG chan',
  khopTaiKhoan('0123456789', '') === null);
check('so nhan duoc rong -> null, KHONG chan',
  khopTaiKhoan('', '0123456789') === null);
check('so qua ngan (duoi 4 chu so) -> null, KHONG chan',
  khopTaiKhoan('789', '0123456789') === null);
// Bay that: hai tai khoan khac nhau cung 4 so cuoi. Voi so day du thi phai
// phat hien ra lech - n lay theo ben NGAN HON, nen day so sanh ca 10 chu so.
check('cung 4 so cuoi nhung so day du khac nhau -> van bat duoc lech',
  khopTaiKhoan('1111116789', '2222226789') === false);

console.log('\n2. Doc ma don tu noi dung chuyen khoan');
check('ma don nam giua noi dung', extractCode('SEVQR VIP7KD2QA NGUYEN VAN A', 'VIP') === 'VIP7KD2QA');
check('co dau cach giua tien to va ma', extractCode('CT DEN VIP 7KD2QA', 'VIP') === 'VIP7KD2QA');
check('khong co ma -> null', extractCode('CHUYEN TIEN AN SANG', 'VIP') === null);
check('tien to khac thi khong doc nham', extractCode('DH7KD2QA', 'VIP') === null);

console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
process.exit(loi ? 1 : 0);
