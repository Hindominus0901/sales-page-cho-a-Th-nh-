/**
 * Tao brand/brand.json cho mot thuong hieu moi.
 *
 *   node scripts/brand/init.mjs                    hoi tung cau
 *   node scripts/brand/init.mjs --from ho-so.json  doc tu file co san
 *   node scripts/brand/init.mjs --force            ghi de brand.json dang co
 *
 * Coding agent thuong dung dang `--from`: agent phong van nguoi dung bang ngon
 * ngu cua no, gom cau tra loi vao mot file JSON, roi goi lenh nay.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DICH = path.join(ROOT, 'brand/brand.json');
const GHI_DE = process.argv.includes('--force');
const tuFile = (() => {
  const i = process.argv.indexOf('--from');
  return i === -1 ? null : process.argv[i + 1];
})();

if (fs.existsSync(DICH) && !GHI_DE) {
  console.error(`\n  ✗ ${path.relative(ROOT, DICH)} da ton tai.`);
  console.error('    Sua thang file do, hoac chay lai voi --force de ghi de.\n');
  process.exit(1);
}

/** [khoa, cau hoi, goi y, bat buoc] */
const CAU_HOI = [
  ['tenThuongHieu', 'Ten thuong hieu (ngan, hien tren logo)', 'Mau Business', true],
  ['tenPhapNhan', 'Ten phap nhan (hien o chan trang, trang phap ly)', 'CONG TY MAU', true],
  ['tenChuongTrinh', 'Ten chuong trinh (hien trong webapp)', 'Chuong Trinh Mau', true],
  ['tenNguoiHuongDan', 'Ten nguoi huong dan (thay cho ten rieng trong noi dung)', 'Nguoi Huong Dan', true],
  ['mauChinh', 'Mau thuong hieu (ma hex, vi du #3b5bdb)', '#3b5bdb', true],
  ['tenMienBanHang', 'Ten mien trang ban hang (khong kem https://)', 'mau.example.com', true],
  ['tenMienWebapp', 'Ten mien khu vuc thanh vien', 'app.mau.example.com', true],
  ['tenSanPham', 'Ten san pham dang ban', 'Ve VIP', true],
  ['gia', 'Gia ban (chi so, vi du 499000)', '499000', true],
  ['giaNiemYet', 'Gia niem yet gach ngang', '999000', true],
  ['maSanPham', 'Ma san pham VIET HOA (vi du VIP5N)', 'VIP5N', true],
  ['nganHang', 'Ten ngan hang nhan tien', 'Vietcombank', true],
  ['binNganHang', 'Ma BIN ngan hang (6 chu so)', '970436', true],
  ['soTaiKhoan', 'SO TAI KHOAN nhan tien (chi chu so)', '', true],
  ['tenChuTaiKhoan', 'Ten chu tai khoan VIET HOA KHONG DAU', '', true],
  ['soZalo', 'So Zalo ho tro', '', true],
  ['nhomZalo', 'Link nhom Zalo (bo trong neu chua co)', '', false],
];

function dungBrand(dl) {
  const slug = String(dl.tenThuongHieu).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'thuong-hieu';
  const soZalo = String(dl.soZalo || '').replace(/\D/g, '');
  const chu = String(dl.tenThuongHieu).trim().split(/\s+/);
  return {
    _doc: 'File DUY NHAT duoc phep go gia tri cua khach. Moi noi khac deu sinh tu day: npm run brand:apply',
    meta: { slug, locale: 'vi-VN', currencySuffix: 'đ', timezoneOffsetMinutes: 420 },
    identity: {
      _doc: 'nameLead + nameAccent = ten o tieu de lon trang chu; phan accent in nghieng mau thuong hieu.',
      name: dl.tenThuongHieu,
      legalName: dl.tenPhapNhan,
      productLine: dl.tenChuongTrinh,
      hostName: dl.tenNguoiHuongDan,
      logoText: String(dl.tenThuongHieu).toUpperCase(),
      nameLead: chu.length > 1 ? chu.slice(0, -1).join(' ') : dl.tenThuongHieu,
      nameAccent: chu.length > 1 ? chu[chu.length - 1] : '',
      supportEmail: '',
    },
    theme: { primaryHex: dl.mauChinh, primaryDarkHex: lamDam(dl.mauChinh) },
    domains: {
      workerName: `${slug}-platform`,
      funnelHost: dl.tenMienBanHang,
      appHost: dl.tenMienWebapp,
      useCustomDomains: true,
      publicUrl: '',
    },
    product: {
      sku: String(dl.maSanPham).toUpperCase(),
      orderPrefix: String(dl.maSanPham).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'DH',
      name: dl.tenSanPham,
      price: Number(dl.gia),
      listPrice: Number(dl.giaNiemYet),
      affiliateRate: 20,
    },
    payment: {
      _doc: 'So tai khoan nay di thang vao ma VietQR khach quet de tra tien. Sai mot chu so la tien chay sang tui nguoi khac.',
      bankBin: String(dl.binNganHang),
      bankName: dl.nganHang,
      account: String(dl.soTaiKhoan),
      accountName: String(dl.tenChuTaiKhoan).toUpperCase(),
    },
    contact: {
      channelLabel: 'Zalo',
      zaloPhone: soZalo,
      zaloUrl: soZalo ? `https://zalo.me/${soZalo}` : '',
      zaloGroupUrl: dl.nhomZalo || '',
    },
    media: {
      heroVideo: { _doc: 'provider: wistia | youtube | vimeo | stream', provider: 'youtube', id: '', thumb: '', autoplay: true },
      confirmVideo: { _doc: 'Video o trang cam on. KHONG tu phat.', provider: 'youtube', id: '', autoplay: false },
      fbPixelId: '',
    },
    mail: { from: `${dl.tenThuongHieu} <no-reply@${dl.tenMienBanHang}>` },
    funnel: {
      _doc: 'Duong dan va tieu de tung trang ban hang. Worker va build deu doc tu day nen khong the lech nhau.',
      pages: {
        landing: { route: '/', title: dl.tenChuongTrinh },
        form: { route: '/dang-ky', title: 'Đăng ký' },
        confirmation: { route: '/xac-nhan', title: 'Xác nhận đăng ký' },
        oto: { route: '/vip', title: 'Vé VIP' },
        checkout: { route: '/thanh-toan', title: 'Thanh toán' },
      },
      testimonials: {
        _doc: 'CHI dung ten va video cua nguoi that KHI DA XIN PHEP ho.',
        danhSach: [1, 2, 3, 4, 5].map((i) => ({ videoId: '', name: `Học viên mẫu ${i}` })),
      },
    },
    environment: 'production',
    cron: '0 18 * * *',
  };
}

/** Mau dam hon mot bac de dung cho chu nhan va trang thai hover. */
function lamDam(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const toi = (v) => Math.max(0, Math.round(v * 0.78));
  const r = toi((n >> 16) & 255);
  const g = toi((n >> 8) & 255);
  const b = toi(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const duLieu = {};

if (tuFile) {
  const duong = path.isAbsolute(tuFile) ? tuFile : path.join(ROOT, tuFile);
  Object.assign(duLieu, JSON.parse(fs.readFileSync(duong, 'utf8')));
  const thieu = CAU_HOI.filter(([k, , , batBuoc]) => batBuoc && !duLieu[k]).map(([k]) => k);
  if (thieu.length) {
    console.error(`\n  ✗ Ho so thieu: ${thieu.join(', ')}\n`);
    process.exit(1);
  }
} else {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log('\n  Dien thong tin thuong hieu. Enter de lay goi y trong ngoac.\n');
  for (const [khoa, hoi, goiY, batBuoc] of CAU_HOI) {
    /* eslint-disable no-await-in-loop */
    let tl = '';
    while (!tl) {
      tl = (await rl.question(`  ${hoi}${goiY ? ` [${goiY}]` : ''}: `)).trim() || goiY;
      if (!tl && !batBuoc) break;
      if (!tl) console.log('    (bat buoc)');
    }
    duLieu[khoa] = tl;
  }
  rl.close();
}

fs.mkdirSync(path.dirname(DICH), { recursive: true });
fs.writeFileSync(DICH, `${JSON.stringify(dungBrand(duLieu), null, 2)}\n`, 'utf8');
console.log(`\n  ✓ Da ghi ${path.relative(ROOT, DICH)}`);
console.log('\n  Tiep theo:');
console.log('    npm run brand:validate');
console.log('    npm run brand:apply\n');
