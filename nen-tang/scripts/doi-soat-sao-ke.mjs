/**
 * Doi soat sao ke ngan hang: nap lai nhung khoan da vao tai khoan ma he thong
 * chua biet.
 *
 *   node --env-file=.env scripts/doi-soat-sao-ke.mjs <file.xlsx> [--that]
 *                                                    [--map 7=VIPT2F3PH]
 *                                                    [--url https://...]
 *
 * VI SAO CAN: SePay dung ra phai bao moi giao dich ve cho /api/webhooks/bank.
 * No khong bao lan nao, nen 36 khoan 399.000d da nam trong tai khoan mà don
 * hang van "cho thanh toan": khach mat tien, khong duoc mo quyen truy cap,
 * khong ai sinh hoa hong. Script nay lam thay dung mot viec do.
 *
 * VI SAO DI QUA WEBHOOK CHU KHONG UPDATE THANG DATABASE: mot khoan tien duoc
 * xac nhan keo theo bon viec - chuyen don sang 'paid', mo quyen truy cap
 * (fulfilOrder), sinh hoa hong, gan tag Kit. Sua tay bang `orders` chi lam viec
 * dau tien va bo im lang ba viec sau. Duong webhook la duong da co test.
 *
 * CHAY LAI NHIEU LAN KHONG NHAN DOI TIEN. Ba lop chan:
 *   1. UNIQUE(provider, external_id) tren bank_txns - external_id o day sinh tu
 *      ngay + so thu tu dong trong sao ke nen lan hai la trung khoa
 *   2. cau UPDATE co "AND status <> 'paid'"
 *   3. commissions.order_id UNIQUE
 *
 * KHONG CO --that thi KHONG GUI GI CA, chi in ra se lam nhung gi.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

// --------------------------------------------------------------- doc file xlsx
/**
 * Giai nen mot file .xlsx ma khong keo them thu vien nao.
 *
 * .xlsx la mot file ZIP. Doc muc luc trung tam (End of Central Directory) roi
 * xa tung muc bang zlib - zlib nam san trong Node. Them mot goi npm chi de doc
 * mot file sao ke la them mot thu phai bao tri mai ve sau.
 */
function docZip(duongDan) {
  const buf = fs.readFileSync(duongDan);
  const EOCD = 0x06054b50;
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== EOCD) i -= 1;
  if (i < 0) throw new Error('Khong phai file .xlsx hop le (thieu muc luc ZIP)');

  const soMuc = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  const ra = new Map();

  for (let n = 0; n < soMuc; n += 1) {
    const nen = buf.readUInt16LE(p + 10);
    const cvNen = buf.readUInt32LE(p + 20);
    const daiTen = buf.readUInt16LE(p + 28);
    const daiPhu = buf.readUInt16LE(p + 30);
    const daiChuThich = buf.readUInt16LE(p + 32);
    const viTri = buf.readUInt32LE(p + 42);
    const ten = buf.toString('utf8', p + 46, p + 46 + daiTen);

    // Nhay qua phan dau cuc bo de toi du lieu that.
    const daiTenCB = buf.readUInt16LE(viTri + 26);
    const daiPhuCB = buf.readUInt16LE(viTri + 28);
    const dau = viTri + 30 + daiTenCB + daiPhuCB;
    const than = buf.subarray(dau, dau + cvNen);
    ra.set(ten, nen === 0 ? than : zlib.inflateRawSync(than));

    p += 46 + daiTen + daiPhu + daiChuThich;
  }
  return ra;
}

const boThe = (s) => String(s)
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Sao ke -> mang dong { stt, ngay, noiDung, soTien }. */
function docSaoKe(duongDan) {
  const zip = docZip(duongDan);
  const chuoi = [];
  const ssXml = zip.get('xl/sharedStrings.xml');
  if (ssXml) {
    for (const si of ssXml.toString('utf8').split('<si>').slice(1)) {
      chuoi.push(boThe(si.split('</si>')[0]));
    }
  }

  const sheet = zip.get('xl/worksheets/sheet1.xml').toString('utf8');
  const dong = [];
  for (const r of sheet.split('<row').slice(1)) {
    const o = [];
    for (const c of r.split('<c').slice(1)) {
      const laChuoi = /\st="s"/.test(c.split('>')[0]);
      const v = /<v>([^<]*)<\/v>/.exec(c);
      let txt = v ? v[1] : '';
      if (laChuoi && txt !== '') txt = chuoi[Number(txt)] ?? '';
      o.push(txt);
    }
    dong.push(o);
  }

  // Bo phan tieu de cua ngan hang: dong du lieu bat dau bang so thu tu.
  return dong
    .filter((r) => r.length >= 4 && /^\d+$/.test(String(r[0]).trim()))
    .map((r) => ({
      stt: Number(r[0]),
      ngay: String(r[1] || '').trim(),
      noiDung: String(r[2] || '').trim(),
      soTien: Number(String(r[3] || '').replace(/[^\d-]/g, '')) * (String(r[3]).includes('-') ? -1 : 1),
    }));
}

// ------------------------------------------------------------ tim ma don hang
/**
 * Giong het extractCode trong worker/src/routes/webhook.js - CO Y chep lai chu
 * khong import: script nay chay o may, khong nam trong ban bundle cua Worker.
 * Bang chu cai bo 0/O/1/I nen "VIP" theo sau 6 ky tu la ma don, khong nham.
 */
const BANG_CHU = '[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}';
function timMaDon(noiDung, tienTo) {
  const tt = String(tienTo).toUpperCase().replace(/[^A-Z]/g, '');
  const re = new RegExp(`${tt}\\s*(${BANG_CHU})`, 'i');
  const m = re.exec(String(noiDung || '').replace(/[^0-9A-Za-z ]/g, ' '));
  return m ? `${tt}${m[1].toUpperCase()}` : null;
}

// ------------------------------------------------------------------ chay
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const that = args.includes('--that');
const tienTo = (process.env.ORDER_PREFIX || 'VIP').toUpperCase();

const layCo = (ten) => {
  const i = args.indexOf(`--${ten}`);
  return i >= 0 ? args[i + 1] : null;
};
const goc = (layCo('url') || process.env.APP_ORIGIN || 'http://127.0.0.1:8787').replace(/\/$/, '');
const secret = process.env.BANK_WEBHOOK_SECRET || '';

// --map 7=VIPT2F3PH  (lap lai duoc): va ma don cho dong khach chuyen thieu ma.
const va = new Map();
args.forEach((a, i) => {
  if (a !== '--map') return;
  const [stt, ma] = String(args[i + 1] || '').split('=');
  if (stt && ma) va.set(Number(stt), ma.toUpperCase());
});

if (!file) {
  console.error('Thieu duong dan file sao ke.\n'
    + '  node --env-file=.env scripts/doi-soat-sao-ke.mjs sao-ke.xlsx [--that]');
  process.exit(1);
}
if (that && !secret) {
  console.error('Thieu BANK_WEBHOOK_SECRET trong .env - khong gui duoc.');
  process.exit(1);
}

const dong = docSaoKe(file);
const ngayGon = (s) => (s.split(' ')[0] || '').replace(/\//g, '');

// Chi lay TIEN VAO co ma don. Nhung khoan khac trong sao ke (chuyen tien ca
// nhan, lai ngan hang) khong lien quan toi don hang nao - nap chung vao chi lam
// ban bang giao dich chu khong doi soat duoc gi.
const canNap = [];
const boQua = [];
for (const d of dong) {
  const ma = va.get(d.stt) || timMaDon(d.noiDung, tienTo);
  if (d.soTien > 0 && ma) canNap.push({ ...d, ma });
  else boQua.push(d);
}

console.log(`\nSao ke: ${file}`);
console.log(`  ${dong.length} dong · ${canNap.length} khoan co ma don · ${boQua.length} dong bo qua`);
console.log(`  Gui toi: ${goc}/api/webhooks/bank`);
console.log(that ? '  CHE DO THAT - se gui\n' : '  Chay thu (them --that de gui that)\n');

const dem = { paid: 0, duplicate: 0, unmatched: 0, khac: 0, loi: 0 };

for (const d of canNap) {
  const externalId = `saoke-${ngayGon(d.ngay)}-${d.stt}`;
  // Ep ma don vao noi dung cho nhung dong duoc va bang --map, de webhook nhin
  // thay dung thu no van nhin: ma nam trong noi dung chuyen khoan.
  const noiDung = va.has(d.stt) ? `${d.ma} ${d.noiDung}` : d.noiDung;

  if (!that) {
    console.log(`  ${String(d.stt).padStart(3)} ${d.ngay.padEnd(20)} ${d.ma}  ${String(d.soTien).padStart(9)}`);
    continue;
  }

  try {
    const res = await fetch(`${goc}/api/webhooks/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${secret}`,
        // Danh dau day la cong cu doi soat chu khong phai SePay, de trang
        // Doanh thu khong tuong nham la webhook da thong.
        'X-Doi-Soat': '1',
      },
      body: JSON.stringify({
        id: externalId,
        transferType: 'in',
        transferAmount: d.soTien,
        accountNumber: process.env.BANK_ACCOUNT || '',
        content: noiDung,
        gateway: process.env.BANK_NAME || 'bank',
        transactionDate: d.ngay,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const kq = data?.results?.[0]?.status || `HTTP ${res.status}`;
    dem[kq] = (dem[kq] ?? 0) + 1;
    if (!(kq in dem)) dem.khac += 1;
    console.log(`  ${String(d.stt).padStart(3)} ${d.ma}  ${kq}`);
  } catch (err) {
    dem.loi += 1;
    console.log(`  ${String(d.stt).padStart(3)} ${d.ma}  LOI ${err.message}`);
  }
}

if (boQua.length) {
  console.log('\nBo qua (khong co ma don trong noi dung):');
  for (const d of boQua) {
    console.log(`  ${String(d.stt).padStart(3)} ${d.ngay.padEnd(20)} ${String(d.soTien).padStart(11)}  ${d.noiDung.slice(0, 60)}`);
  }
  console.log('  -> khoan nao la tien ve hoc vien thi chay lai voi --map <STT>=<MA DON>');
}

if (that) {
  console.log(`\nKet qua: ${dem.paid || 0} don chuyen sang da thanh toan`
    + ` · ${dem.duplicate || 0} da nap tu truoc`
    + ` · ${dem.unmatched || 0} khong khop don`
    + `${dem.loi ? ` · ${dem.loi} loi` : ''}`);
}
