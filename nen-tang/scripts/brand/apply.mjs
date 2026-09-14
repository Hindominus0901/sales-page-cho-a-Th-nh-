/**
 * brand/brand.json  ->  cac file cau hinh that.
 *
 *   node scripts/brand/apply.mjs            (hoac: npm run brand:apply)
 *   node scripts/brand/apply.mjs --check    chi so sanh, khong ghi (dung cho CI)
 *
 * Sinh ra:
 *   wrangler.jsonc   ba vung BRAND:NAME, BRAND:ROUTES, BRAND:VARS
 *   package.json     "name" va "description"
 *
 * KHONG dung toi: ma tai nguyen D1/KV (setup-cloudflare.mjs lo phan do), va moi
 * thu nam ngoai dau vung - chu thich tieng Viet trong wrangler.jsonc la tai lieu
 * that, giu nguyen.
 *
 * Vi sao thay bang DAU VUNG chu khong bang bieu thuc chinh quy: setup-cloudflare
 * dang vá hai ma tai nguyen bang regex, chap nhan duoc voi hai dong. Sinh ca khoi
 * "vars" 22 khoa bang regex thi mot ngay nao do se an nham dau ngoac va khong ai
 * hieu tai sao. Dau vung thi ranh gioi la ranh gioi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHI_KIEM = process.argv.includes('--check');

/** Thay phan giua hai dau vung. Nem loi neu thieu dau - im lang la hong ngam. */
function thayVung(text, ten, noiDungMoi) {
  const mo = `// <<< BRAND:${ten}`;
  const dong = `// >>> BRAND:${ten}`;
  const i = text.indexOf(mo);
  const j = text.indexOf(dong);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`Thieu dau vung BRAND:${ten} trong wrangler.jsonc.`
      + ` Can hai dong "${mo}" va "${dong}" boc lay phan duoc sinh ra.`);
  }
  const dauDong = text.lastIndexOf('\n', i) + 1;
  const cuoiDong = text.indexOf('\n', j);
  return text.slice(0, dauDong)
    + `  ${mo} (sinh boi scripts/brand/apply.mjs - dung sua tay)\n`
    + noiDungMoi
    + `  ${dong}`
    + text.slice(cuoiDong);
}

const q = (v) => JSON.stringify(String(v));

function dungVars(brand) {
  const { domains, product, payment, contact, media, mail, identity } = brand;
  const hero = media.heroVideo;
  const xacNhan = media.confirmVideo;

  // Thu tu va chu thich o day la BAN GOC - wrangler.jsonc chi la ban in ra.
  return `  // CAN THAN: nhung gia tri nay duoc deploy len that va GHI DE gia tri dat trong
  // bang dieu khien Cloudflare. Truoc day o day ghi PUBLIC_URL=localhost, khien
  // moi link gioi thieu affiliate tren ban that tro ve localhost - tuc la ca
  // chuong trinh affiliate ship link chet. Khi chay o may, .env ghi de muc nay.
  //
  // PUBLIC_URL de trong = tu lay ten mien cua chinh request.
  "vars": {
    "PUBLIC_URL": ${q(domains.publicUrl || '')},
    "ENVIRONMENT": ${q(brand.environment)},

    // Cron khong co request nao de suy ra ten mien, nen phai khai thang o day -
    // neu khong, link trong email nhac se tro ve dau.
    "APP_ORIGIN": ${q(`https://${domains.funnelHost}`)},
    // Ten mien cua KHU VUC THANH VIEN. worker/src/index.js doc bien nay de tach
    // webapp khoi trang ban hang; de trong thi ca hai ten mien tra ve mot thu.
    "APP_HOST": ${q(domains.appHost)},

    // VSL o trang chu. De trong = dung video co san trong ban thiet ke.
    "HERO_VIDEO_PROVIDER": ${q(hero.provider)},
    "HERO_VIDEO_ID": ${q(hero.id || '')},
    "HERO_VIDEO_THUMB": ${q(hero.thumb || '')},
    "HERO_VIDEO_AUTOPLAY": ${q(hero.autoplay ? 'true' : 'false')},
    // Video huong dan o trang cam on. Khong tu phat: nguoi vua dien form xong,
    // mot doan video tu keu len la giat minh.
    "CONFIRM_VIDEO_PROVIDER": ${q(xacNhan.provider)},
    "CONFIRM_VIDEO_ID": ${q(xacNhan.id || '')},
    "CONFIRM_VIDEO_AUTOPLAY": ${q(xacNhan.autoplay ? 'true' : 'false')},

    "FB_PIXEL_ID": ${q(media.fbPixelId || '')},

    "PRODUCT_NAME": ${q(product.name)},
    "PRODUCT_SKU": ${q(product.sku)},
    "PRICE_VIP": ${q(product.price)},
    "PRICE_VIP_LIST": ${q(product.listPrice)},
    "AFFILIATE_RATE": ${q(product.affiliateRate)},

    // Bon dong nay di thang vao ma VietQR khach quet de tra tien. Truoc day
    // chung khong duoc khai o day ma nam lam GIA TRI MAC DINH trong
    // worker/src/config.js - ai quen dat la in ra ma QR tra tien cho nguoi khac.
    "BANK_BIN": ${q(payment.bankBin)},
    "BANK_NAME": ${q(payment.bankName)},
    "BANK_ACCOUNT": ${q(payment.account)},
    "BANK_ACCOUNT_NAME": ${q(payment.accountName)},
    "BANK_MEMO_PREFIX": ${q(payment.memoPrefix || '')},

    "ZALO_PHONE": ${q(contact.zaloPhone)},
    "ZALO_URL": ${q(contact.zaloUrl)},
    "ZALO_GROUP_URL": ${q(contact.zaloGroupUrl || '')},

    // Ten mien gui thu phai duoc xac minh ben Resend (ban ghi DKIM va send.),
    // khong thi Resend tu choi va khong ai nhan duoc ma xac thuc.
    "MAIL_FROM": ${q(mail.from)},

    // Ten thuong hieu cho phan hien thi (email, trang ban hang, webapp).
    "BRAND_NAME": ${q(identity.name)},
    "BRAND_LEGAL_NAME": ${q(identity.legalName)},
    "BRAND_PRODUCT_LINE": ${q(identity.productLine)},
    "BRAND_HOST_NAME": ${q(identity.hostName)},
    "BRAND_LOGO_TEXT": ${q(identity.logoText)},
    "BRAND_COLOR": ${q(brand.theme.primaryHex)},
    "BRAND_COLOR_DARK": ${q(brand.theme.primaryDarkHex)},
    "ORDER_PREFIX": ${q(product.orderPrefix)},
    "FORM_BO_CAU_HOI": ${q(brand.funnel?.boCauHoi === false ? "0" : "1")},
    "TZ_OFFSET_MINUTES": ${q(brand.meta.timezoneOffsetMinutes)},
    "LOCALE": ${q(brand.meta.locale)},
    "CURRENCY_SUFFIX": ${q(brand.meta.currencySuffix)}
  },
`;
}

function dungRoutes(brand) {
  const { domains } = brand;
  if (!domains.useCustomDomains) {
    return `  // Chua gan ten mien rieng: khai "routes" se khien Cloudflare TAT dia chi
  // .workers.dev, ma do dang la duong duy nhat vao duoc site. Them ten mien vao
  // tai khoan Cloudflare roi dat domains.useCustomDomains = true va chay lai
  // \`npm run brand:apply\`.
`;
  }
  return `  // Ten mien that. custom_domain=true -> Cloudflare tu tao ban ghi DNS va tu cap
  // chung chi HTTPS. Ten mien PHAI da la mot zone trong chinh tai khoan nay,
  // neu khong buoc deploy se hong voi mot thong bao rat kho hieu.
  "routes": [
    { "pattern": ${q(domains.funnelHost)}, "custom_domain": true },
    { "pattern": ${q(domains.appHost)}, "custom_domain": true }
  ],
`;
}

/**
 * #rrggbb -> "H S% L%" - dung dang ma apps/web/src/index.css dang dung: bien
 * CSS chi chua ba con so, ham hsl() nam trong cau hinh Tailwind.
 */
function hexSangHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const phanTram = (x) => Math.round(x * 100);
  return `${Math.round(h)} ${phanTram(sat)}% ${phanTram(l)}%`;
}

const BANNER_CSS = '/* SINH TU brand/brand.json BOI scripts/brand/apply.mjs - DUNG SUA TAY.';

/** Bien mau cho khu vuc thanh vien. index.css giu ban trung tinh; file nay de len. */
function dungCssThuongHieu(brand) {
  const chinh = hexSangHsl(brand.theme.primaryHex);
  const dam = hexSangHsl(brand.theme.primaryDarkHex);
  return `${BANNER_CSS}
   Nap sau index.css nen de len cac bien mau o do. Doi mau thuong hieu = sua
   theme.primaryHex trong brand/brand.json roi chay: npm run brand:apply */
:root {
  --primary: ${chinh};
  --ring: ${chinh};
  --chart-1: ${chinh};
  --secondary-foreground: ${dam};
  --accent-foreground: ${dam};
  --brand-hex: ${brand.theme.primaryHex};
  --brand-hex-dark: ${brand.theme.primaryDarkHex};
}
`;
}

/**
 * Danh tinh thuong hieu cho ma React dung.
 *
 * Sinh ra file thay vi goi /api/config: mau logo va ten thuong hieu phai co
 * NGAY khi trang ve lan dau, khong the doi mot vong goi API roi moi hien -
 * nguoi dung se thay logo nhay chu.
 */
function dungJsThuongHieu(brand) {
  const data = {
    name: brand.identity.name,
    legalName: brand.identity.legalName,
    productLine: brand.identity.productLine,
    hostName: brand.identity.hostName,
    logoText: brand.identity.logoText,
    colorHex: brand.theme.primaryHex,
    channelLabel: brand.contact.channelLabel || 'Zalo',
    supportUrl: brand.contact.zaloUrl,
    groupUrl: brand.contact.zaloGroupUrl || brand.contact.zaloUrl,
    // Do lech mui gio cua THUONG HIEU, khong phai cua may nguoi dung. Trang
    // quan tri nhap gio buoi hoc bang o datetime-local, ma o do tra ve gio
    // theo may - laptop dat mui gio khac la moi buoi hoc lech gio, im lang.
    tzOffsetMinutes: brand.meta.timezoneOffsetMinutes,
    // Ma san pham chinh va dia chi trang ban hang.
    //
    // Webapp chay o appHost con trang ban hang o funnelHost - hai ten mien khac nhau, nen
    // moi link sang do PHAI tuyet doi - link tuong doi se o lai app host va roi
    // vao trang 404 cua SPA.
    //
    // Va dung viet cung ma san pham trong React: kiem tra "da mua VIP chua" doc ma
    // nay, ma no la gia tri cua khach - noi duy nhat no duoc phep song la
    // brand.json.
    productSku: brand.product.sku,
    salesOrigin: `https://${brand.domains.funnelHost}`,
    // Khong phai thuong hieu nao cung co trang nang cap (OTO). Thieu thi tro
    // ve trang chu chu KHONG nem loi: mot funnel hai trang van la funnel hop le,
    // va truoc day thieu khoa "oto" la `npm run brand:apply` chet giua chung voi
    // mot loi "Cannot read properties of undefined" chang chi ve dau ca.
    vipUrl: `https://${brand.domains.funnelHost}${brand.funnel.pages.oto?.route || '/'}`,
  };
  return `// SINH TU brand/brand.json BOI scripts/brand/apply.mjs - DUNG SUA TAY.
// Sua gia tri o brand/brand.json roi chay: npm run brand:apply
export const BRAND = ${JSON.stringify(data, null, 2)};
export default BRAND;
`;
}

// --- chay ---------------------------------------------------------------------
let brand;
try {
  brand = loadBrand();
} catch (err) {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exit(1);
}

const doiFile = [];

// 1. wrangler.jsonc
const WRANGLER = path.join(ROOT, 'wrangler.jsonc');
const truoc = fs.readFileSync(WRANGLER, 'utf8');
let sau = truoc;
sau = thayVung(sau, 'NAME', `  "name": ${q(brand.domains.workerName)},\n`);
sau = thayVung(sau, 'ROUTES', dungRoutes(brand));
sau = thayVung(sau, 'VARS', dungVars(brand));
// Ten thung R2 phai theo ten Worker. De trong thi wrangler tu choi chay han
// ("bucket_name should have a string field"), nen day khong the la o trong.
sau = thayVung(sau, 'R2', `  "r2_buckets": [
    { "binding": "UPLOADS", "bucket_name": ${q(`${brand.domains.workerName}-uploads`)} }
  ],
`);
if (sau !== truoc) doiFile.push(['wrangler.jsonc', WRANGLER, sau]);

// 2. package.json - ten goi va mo ta
const PKG = path.join(ROOT, 'package.json');
const pkgTruoc = fs.readFileSync(PKG, 'utf8');
const pkg = JSON.parse(pkgTruoc);
pkg.name = brand.domains.workerName;
pkg.description = `Nen tang cong dong + funnel ban hang cua ${brand.identity.legalName},`
  + ' chay tren Cloudflare Workers + D1';
const pkgSau = `${JSON.stringify(pkg, null, 2)}\n`;
if (pkgSau !== pkgTruoc) doiFile.push(['package.json', PKG, pkgSau]);

// 3. Bang duong dan trang ban hang cho Worker
//
// Truoc day bang nay viet cung trong worker/src/index.js, con build.mjs lai co
// bang cua rieng no - hai bang cung mo ta MOT thu. Doi mot duong dan o mot ben
// la trang do 404 ma khong ai hieu vi sao. Gio ca hai deu doc tu brand.json.
const ROUTES_JS = path.join(ROOT, 'worker/src/routes.generated.js');
const dongTrang = Object.entries(brand.funnel.pages)
  .map(([khoa, t]) => `  [${q(t.route)}, ${q(khoa === 'landing' ? '/f/' : `/f${t.route}`)}],`)
  .join('\n');
const routesJs = `// SINH TU brand/brand.json BOI scripts/brand/apply.mjs - DUNG SUA TAY.
// Sua duong dan o brand/brand.json roi chay: npm run brand:apply

/**
 * Trang ban hang duoc dung san vao dist/public/f/ nhung phuc vu o goc ten mien.
 * Lop asset cua Cloudflare tu bo duoi ".html" nen dich la "/f/dang-ky".
 */
export const FUNNEL_PAGES = [
${dongTrang}
];

/**
 * Nhung trang KHONG doi theo thuong hieu:
 *   /quan-tri-funnel  trang quan tri cu cua funnel (de o /admin thi no che mat
 *                     cong quan tri moi nam trong SPA)
 *   /dai-ly           cong cua nguoi gioi thieu
 *   hai trang phap ly Google bat buoc phai co moi cho xuat ban ung dung OAuth
 */
export const FUNNEL_FIXED = [
  ['/quan-tri-funnel', '/f/admin'],
  ['/dai-ly', '/f/dai-ly'],
  ['/chinh-sach-bao-mat', '/f/chinh-sach-bao-mat'],
  ['/dieu-khoan', '/f/dieu-khoan'],
  ['/robots.txt', '/f/robots.txt'],
];
`;
{
  const cu = fs.existsSync(ROUTES_JS) ? fs.readFileSync(ROUTES_JS, 'utf8') : null;
  if (cu !== routesJs) doiFile.push(['worker/src/routes.generated.js', ROUTES_JS, routesJs]);
}

// 4. Bien mau + danh tinh cho khu vuc thanh vien (React)
for (const [ten, tuongDoi, noiDung] of [
  ['css', 'apps/web/src/brand.generated.css', dungCssThuongHieu(brand)],
  ['js', 'apps/web/src/brand.generated.js', dungJsThuongHieu(brand)],
]) {
  const duong = path.join(ROOT, tuongDoi);
  const cu = fs.existsSync(duong) ? fs.readFileSync(duong, 'utf8') : null;
  if (cu !== noiDung) doiFile.push([tuongDoi, duong, noiDung]);
}

// 5. .env - vung gia tri thuong hieu
//
// build.mjs uu tien process.env HON wrangler.jsonc (de con ghi de tam khi thu o
// may). Nghia la .env am tham de len brand.json: doi gia trong brand.json ma
// .env con dong PRICE_VIP cu thi trang ban hang van in gia cu, va khong co dau
// hieu gi ca. Nen .env cung phai duoc SINH ra - nhung chi phan gia tri thuong
// hieu; bi mat va cau hinh rieng cua tung may nam ngoai vung, khong dung toi.
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  const MO = '# <<< BRAND (sinh boi scripts/brand/apply.mjs - dung sua tay)';
  const DONG = '# >>> BRAND';
  const bienThuongHieu = {
    PRODUCT_NAME: brand.product.name,
    PRODUCT_SKU: brand.product.sku,
    ORDER_PREFIX: brand.product.orderPrefix,
    FORM_BO_CAU_HOI: brand.funnel?.boCauHoi === false ? '0' : '1',
    PRICE_VIP: brand.product.price,
    PRICE_VIP_LIST: brand.product.listPrice,
    AFFILIATE_RATE: brand.product.affiliateRate,
    BANK_BIN: brand.payment.bankBin,
    BANK_NAME: brand.payment.bankName,
    BANK_ACCOUNT: brand.payment.account,
    BANK_ACCOUNT_NAME: brand.payment.accountName,
    BANK_MEMO_PREFIX: brand.payment.memoPrefix || '',
    ZALO_PHONE: brand.contact.zaloPhone,
    ZALO_URL: brand.contact.zaloUrl,
    ZALO_GROUP_URL: brand.contact.zaloGroupUrl || '',
    MAIL_FROM: brand.mail.from,
    APP_HOST: brand.domains.appHost,
    APP_ORIGIN: `https://${brand.domains.funnelHost}`,
    HERO_VIDEO_PROVIDER: brand.media.heroVideo.provider,
    HERO_VIDEO_ID: brand.media.heroVideo.id || '',
    HERO_VIDEO_THUMB: brand.media.heroVideo.thumb || '',
    HERO_VIDEO_AUTOPLAY: brand.media.heroVideo.autoplay ? 'true' : 'false',
    CONFIRM_VIDEO_PROVIDER: brand.media.confirmVideo.provider,
    CONFIRM_VIDEO_ID: brand.media.confirmVideo.id || '',
    CONFIRM_VIDEO_AUTOPLAY: brand.media.confirmVideo.autoplay ? 'true' : 'false',
    FB_PIXEL_ID: brand.media.fbPixelId || '',
    LOCALE: brand.meta.locale,
    CURRENCY_SUFFIX: brand.meta.currencySuffix,
    TZ_OFFSET_MINUTES: brand.meta.timezoneOffsetMinutes,
    BRAND_NAME: brand.identity.name,
    BRAND_LEGAL_NAME: brand.identity.legalName,
    BRAND_PRODUCT_LINE: brand.identity.productLine,
    BRAND_HOST_NAME: brand.identity.hostName,
    BRAND_LOGO_TEXT: brand.identity.logoText,
    BRAND_COLOR: brand.theme.primaryHex,
    BRAND_COLOR_DARK: brand.theme.primaryDarkHex,
  };
  const khoi = [MO, ...Object.entries(bienThuongHieu).map(([k, v]) => `${k}=${v}`), DONG].join('\n');

  const envTruoc = fs.readFileSync(ENV_FILE, 'utf8');
  let envSau;
  const i = envTruoc.indexOf(MO);
  const j = envTruoc.indexOf(DONG);
  if (i !== -1 && j > i) {
    envSau = envTruoc.slice(0, i) + khoi + envTruoc.slice(j + DONG.length);
  } else {
    // Lan dau: don nhung dong trung khoa nam ngoai vung, roi them vung vao cuoi.
    const conLai = envTruoc.split(/\r?\n/)
      .filter((d) => !Object.keys(bienThuongHieu).some((k) => d.startsWith(`${k}=`)))
      .join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    envSau = `${conLai}\n\n${khoi}\n`;
  }
  if (envSau !== envTruoc) doiFile.push(['.env', ENV_FILE, envSau]);
}

// 6. index.html: tieu de tab va mau thanh dia chi tren dien thoai
const HTML = path.join(ROOT, 'apps/web/index.html');
const htmlTruoc = fs.readFileSync(HTML, 'utf8');
const htmlSau = htmlTruoc
  .replace(/<meta name="theme-color" content="[^"]*" \/>/,
    `<meta name="theme-color" content="${brand.theme.primaryHex}" />`)
  .replace(/<title>[^<]*<\/title>/,
    `<title>Cộng đồng ${brand.identity.name}</title>`)
  // The chia se (Open Graph). Anh dung chung voi trang ban hang: mot anh cho ca
  // he thong de sau nay doi thuong hieu chi phai thay dung mot file.
  .replace(/<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="Khu vực học tập và cộng đồng ${brand.identity.name}." />`)
  .replace(/<meta property="og:site_name" content="[^"]*" \/>/,
    `<meta property="og:site_name" content="${brand.identity.name}" />`)
  .replace(/<meta property="og:locale" content="[^"]*" \/>/,
    `<meta property="og:locale" content="${(brand.meta.locale || 'vi-VN').replace('-', '_')}" />`)
  .replace(/<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="Cộng đồng ${brand.identity.name}" />`)
  .replace(/<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="Khu vực học tập và cộng đồng ${brand.identity.name}." />`)
  .replace(/<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="https://${brand.domains.appHost}" />`)
  .replace(/<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="https://${brand.domains.funnelHost}`
    + `/f/assets/${brand.funnel.share?.image || 'og.jpg'}" />`);
if (htmlSau !== htmlTruoc) doiFile.push(['apps/web/index.html', HTML, htmlSau]);

if (CHI_KIEM) {
  if (!doiFile.length) {
    console.log('  ✓ file sinh ra khop voi brand.json');
    process.exit(0);
  }
  console.error('\n  ✗ File sinh ra da LECH khoi brand.json:');
  for (const [ten] of doiFile) console.error(`      ${ten}`);
  console.error('\n  Ai do sua tay vao vung duoc sinh ra. Chay `npm run brand:apply` de sinh lai,');
  console.error('  hoac sua brand/brand.json neu gia tri moi moi la dung.\n');
  process.exit(1);
}

if (!doiFile.length) {
  console.log('  Khong co gi doi - file sinh ra da khop brand.json.');
} else {
  for (const [ten, duong, noiDung] of doiFile) {
    fs.writeFileSync(duong, noiDung, 'utf8');
    console.log(`  ✓ ${ten}`);
  }
}
console.log(`\n  Thuong hieu: ${brand.identity.name} · ${brand.domains.funnelHost}`
  + ` · ${new Intl.NumberFormat(brand.meta.locale).format(brand.product.price)}${brand.meta.currencySuffix}`);
