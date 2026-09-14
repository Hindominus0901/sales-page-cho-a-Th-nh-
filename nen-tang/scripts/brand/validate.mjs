/**
 * Kiem brand/brand.json truoc khi bat cu buoc nao dung toi no.
 *
 *   node scripts/brand/validate.mjs      (hoac: npm run brand:validate)
 *
 * Vi sao khong dung JSON Schema: schema la mot dinh nghia THU HAI ve cung mot
 * thu. Hai dinh nghia thi se lech nhau - dung cai benh ma ca du an nay dang di
 * chua. Bang khai bao ben duoi la nguon duy nhat, va no kiem duoc nhung thu
 * schema khong kiem noi (so tai khoan toan chu so, ten mien khong kem https://).
 *
 * Loi phai doc duoc boi nguoi CHUA tung mo repo nay: noi ro truong nao, sai
 * cai gi, va dat gi vao thay the.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BRAND_FILE = path.join(ROOT, 'brand/brand.json');

/** Doc va kiem. Tra ve doi tuong brand; nem loi neu khong dung. */
export function loadBrand(file = BRAND_FILE) {
  if (!fs.existsSync(file)) {
    throw new Error(`Khong thay ${path.relative(ROOT, file)}. Chep tu brand/brand.example.json roi dien.`);
  }
  let brand;
  try {
    brand = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`brand.json khong phai JSON hop le: ${err.message}`);
  }
  const loi = kiem(brand);
  if (loi.length) {
    throw new Error(`brand.json chua dung:\n${loi.map((l) => `  - ${l}`).join('\n')}`);
  }
  return brand;
}

const at = (obj, duong) => duong.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/** Kieu kiem: [duong dan, bat buoc?, ham kiem, mo ta khi sai] */
const LUAT = [
  ['meta.slug', true, (v) => /^[a-z0-9-]{2,32}$/.test(v), 'chi chu thuong, so va dau gach ngang'],
  ['meta.locale', true, (v) => /^[a-z]{2}-[A-Z]{2}$/.test(v), 'dang "vi-VN"'],
  ['meta.currencySuffix', true, (v) => typeof v === 'string' && v.length <= 4, 'ky hieu tien, vi du "đ"'],
  ['meta.timezoneOffsetMinutes', true, (v) => Number.isInteger(v) && Math.abs(v) <= 840, 'so phut lech UTC, Viet Nam = 420'],

  ['identity.name', true, (v) => typeof v === 'string' && v.trim(), 'ten thuong hieu ngan, hien tren logo'],
  ['identity.legalName', true, (v) => typeof v === 'string' && v.trim(), 'ten phap nhan, hien o chan trang va trang phap ly'],
  ['identity.productLine', true, (v) => typeof v === 'string' && v.trim(), 'ten chuong trinh, hien o webapp'],
  ['identity.hostName', true, (v) => typeof v === 'string' && v.trim(), 'ten nguoi huong dan, thay cho ten khach cu trong noi dung'],
  ['identity.logoText', true, (v) => typeof v === 'string' && v.trim(), 'chu thay logo khi anh chua tai kip'],

  ['theme.primaryHex', true, (v) => /^#[0-9a-fA-F]{6}$/.test(v), 'ma mau 6 chu so, vi du "#3b5bdb"'],
  ['theme.primaryDarkHex', true, (v) => /^#[0-9a-fA-F]{6}$/.test(v), 'ma mau 6 chu so, dam hon mau chinh'],

  ['domains.workerName', true, (v) => /^[a-z0-9][a-z0-9-]{1,53}$/.test(v), 'ten Worker tren Cloudflare: chu thuong, so, gach ngang'],
  ['domains.funnelHost', true, laTenMien, 'ten mien trang ban hang, KHONG kem https:// va KHONG co dau /'],
  ['domains.appHost', true, laTenMien, 'ten mien khu vuc thanh vien, KHONG kem https://'],
  // "app" = chi gan ten mien cho khu vuc thanh vien; trang ban hang van o
  // .workers.dev. Xem dungRoutes() trong apply.mjs.
  ['domains.useCustomDomains', true,
    (v) => typeof v === 'boolean' || v === 'app', 'true, false, hoac "app"'],

  ['product.sku', true, (v) => /^[A-Z0-9]{2,16}$/.test(v), 'ma san pham VIET HOA, vi du "VIP5N"'],
  ['product.orderPrefix', true, (v) => /^[A-Z]{2,8}$/.test(v), 'tien to ma don VIET HOA, vi du "VIP"'],
  ['product.name', true, (v) => typeof v === 'string' && v.trim(), 'ten san pham hien cho khach'],
  ['product.price', true, laTienDuong, 'so nguyen duong, don vi dong, khong dau cham'],
  ['product.listPrice', true, laTienDuong, 'gia niem yet gach ngang, so nguyen duong'],
  ['product.affiliateRate', true, (v) => Number.isFinite(v) && v >= 0 && v <= 100, 'ti le hoa hong 0-100'],

  // Bon truong nay di thang vao ma QR khach quet de tra tien.
  ['payment.bankBin', true, (v) => /^\d{6}$/.test(v), 'ma BIN ngan hang, dung 6 chu so'],
  ['payment.bankName', true, (v) => typeof v === 'string' && v.trim(), 'ten ngan hang'],
  ['payment.account', true, (v) => /^\d{6,20}$/.test(v), 'so tai khoan, chi chu so'],
  ['payment.accountName', true, (v) => /^[A-Z0-9 &.,-]{3,}$/.test(v), 'ten chu tai khoan VIET HOA KHONG DAU, dung nhu ngan hang ghi'],
  ['payment.memoPrefix', false, (v) => v === '' || /^[A-Z0-9]{0,12}$/.test(String(v)),
    'tien to o dau noi dung chuyen khoan (VietinBank + SePay doi hoi SEVQR); de trong neu khong can'],

  ['contact.zaloPhone', true, (v) => /^0\d{8,10}$/.test(v), 'so dien thoai bat dau bang 0'],
  ['contact.zaloUrl', true, laUrl, 'dia chi day du bat dau bang https://'],
  ['contact.zaloGroupUrl', false, laUrl, 'dia chi nhom, de trong thi trang cam on se tro ve Zalo ca nhan'],

  ['media.heroVideo.provider', true, (v) => ['wistia', 'youtube', 'vimeo', 'stream'].includes(v), 'wistia | youtube | vimeo | stream'],
  ['media.heroVideo.id', false, (v) => typeof v === 'string', 'ma video, de trong = dung video nhung san trong thiet ke'],
  ['media.confirmVideo.provider', true, (v) => ['wistia', 'youtube', 'vimeo', 'stream'].includes(v), 'wistia | youtube | vimeo | stream'],

  ['mail.from', true, (v) => /^[^<]*<[^@\s]+@[^>\s]+>$/.test(v), 'dang: Ten Hien Thi <no-reply@ten-mien>'],

  ['environment', true, (v) => ['production', 'development'].includes(v), 'production hoac development'],
  ['cron', true, (v) => typeof v === 'string' && v.split(/\s+/).length === 5, 'bieu thuc cron 5 phan, vi du "0 18 * * *"'],
];

function laTenMien(v) {
  return typeof v === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)
    && !v.includes('/') && !v.includes(':');
}
function laUrl(v) {
  if (typeof v !== 'string' || !v) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}
function laTienDuong(v) {
  return Number.isInteger(v) && v > 0;
}

function kiem(brand) {
  const loi = [];
  for (const [duong, batBuoc, hop, moTa] of LUAT) {
    const v = at(brand, duong);
    const trong = v === undefined || v === null || v === '';
    if (trong) {
      if (batBuoc) loi.push(`${duong} con trong - can ${moTa}`);
      continue;
    }
    if (!hop(v)) loi.push(`${duong} = ${JSON.stringify(v)} khong hop le - can ${moTa}`);
  }

  // Kiem lien truong: nhung cho hai gia tri phai khop nhau moi co nghia.
  const giaBan = at(brand, 'product.price');
  const giaNiemYet = at(brand, 'product.listPrice');
  if (laTienDuong(giaBan) && laTienDuong(giaNiemYet) && giaNiemYet < giaBan) {
    loi.push('product.listPrice thap hon product.price - gia gach ngang phai CAO hon gia ban');
  }

  const mailFrom = at(brand, 'mail.from') || '';
  const funnelHost = at(brand, 'domains.funnelHost') || '';
  const mailDomain = /<[^@]+@([^>]+)>/.exec(mailFrom)?.[1];
  if (mailDomain && funnelHost && !funnelHost.endsWith(mailDomain) && !mailDomain.endsWith(funnelHost.split('.').slice(-2).join('.'))) {
    // Canh bao chu khong chan: co the ho gui thu tu ten mien khac that.
    console.warn(`  ⚠ mail.from gui tu "${mailDomain}" trong khi site chay o "${funnelHost}".`);
    console.warn('    Ten mien gui thu phai duoc xac minh ben Resend (ban ghi DKIM), khong thi thu khong den noi.');
  }

  // Khoa hoc mien phi (tuy chon). Sai o day thi seed nap vao mot bai giang co
  // video khong phat duoc - khong bao loi, chi la mot o den trong tab Khoa hoc.
  const khoa = at(brand, 'khoaMienPhi');
  if (khoa) {
    if (!String(khoa.name || '').trim()) loi.push('khoaMienPhi.name con trong - can ten khoa hien cho nguoi xem');
    const bai = khoa.lessons;
    if (bai !== undefined && !Array.isArray(bai)) {
      loi.push('khoaMienPhi.lessons phai la mang - de [] neu chua co ban ghi nao');
    } else {
      const daGap = new Set();
      (bai || []).forEach((l, i) => {
        const o = `khoaMienPhi.lessons[${i}]`;
        if (!String(l?.title || '').trim()) loi.push(`${o}.title con trong - can ten bai giang`);
        if (l?.provider && !['wistia', 'youtube', 'vimeo', 'stream'].includes(l.provider)) {
          loi.push(`${o}.provider = ${JSON.stringify(l.provider)} khong hop le - can wistia | youtube | vimeo | stream`);
        }
        // MA video, khong phai duong dan: dan ca link vao day la trinh phat
        // nhan mot ma rac roi hien o den.
        if (!/^[A-Za-z0-9_-]{4,40}$/.test(String(l?.id || ''))) {
          loi.push(`${o}.id = ${JSON.stringify(l?.id)} khong phai ma video - dan MA (vd "dutdkxfks4"), khong dan duong dan`);
        } else if (daGap.has(l.id)) {
          loi.push(`${o}.id = ${JSON.stringify(l.id)} bi lap - hai bai giang cung mot video`);
        } else daGap.add(l.id);
      });
    }
  }

  const app = at(brand, 'domains.appHost');
  const funnel = at(brand, 'domains.funnelHost');
  if (app && funnel && app === funnel) {
    loi.push('domains.appHost trung domains.funnelHost - hai mat cua he thong phai o hai ten mien khac nhau');
  }
  return loi;
}

// Chay truc tiep thi in ket qua; duoc `import` tu apply.mjs thi im lang.
// Dung pathToFileURL chu khong tu ghep chuoi "file:///": tren Windows duong dan
// co khoang trang ("C:\website cho chi Thanh") bi ma hoa thanh %20 trong
// import.meta.url, nen phep so sanh chuoi luon sai va script chay ma khong in gi.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const brand = loadBrand();
    console.log(`  ✓ brand.json hop le - thuong hieu "${brand.identity.name}" (${brand.domains.funnelHost})`);
  } catch (err) {
    console.error(`\n  ✗ ${err.message}\n`);
    process.exit(1);
  }
}
