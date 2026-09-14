/**
 * Dung 5 trang ban hang tinh tu cac file thiet ke .dc.html.
 *
 *   node apps/funnel/build.mjs      (hoac: npm run build:funnel)
 *
 * File thiet ke la ban xuat tu Claude Design - KHONG SUA TRUC TIEP. Buoc nay
 * doc file, thay placeholder bang cau hinh that, doi lien ket, roi ghi ra
 * dist/public/f/. Nho vay design co the xuat lai bat cu luc nao ma khong mat
 * phan backend.
 *
 * Ket qua nam duoi /f/ chu khong phai goc, de khong dam vao file cua SPA
 * (Vite ghi ra dist/public/assets/). Worker lo viec anh xa "/" -> "/f/index.html".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Thuong hieu mang trang ban hang cua rieng minh (brand.json -> funnel.trangRieng)
// thi bo dung nay khong con viec gi de lam. Truoc day no van chay va chet bang
// "khong co file thiet ke tuong ung" - mot loi noi ve .dc.html trong khi nguyen
// nhan that nam o mot khoa khac han trong brand.json. Va vi `npm run build` goi
// no, ca lenh `npm run deploy` chet theo.
{
  const bj = JSON.parse(
    fs.readFileSync(new URL('../../brand/brand.json', import.meta.url), 'utf8'));
  if (bj.funnel?.trangRieng === true) {
    console.log('  · Bo qua: thuong hieu dung trang ban hang rieng'
      + ' (brand.json -> funnel.trangRieng = true).');
    console.log('  · Trang ban hang do `npm run build:funnel` dung. Muon chay ban'
      + ' cua template thi: npm run build:funnel-template');
    process.exit(0);
  }
}


const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'dist/public/f');

// --- cau hinh tu .env (khong dung dependency) --------------------------------
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

/**
 * Doc khoi "vars" cua wrangler.jsonc.
 *
 * Cau hinh cua ban deploy nam o do. Neu file nay chi doc .env thi co HAI nguon
 * su that: dat HERO_VIDEO_ID trong wrangler.jsonc se doi cau tra loi cua
 * /api/config nhung KHONG doi trang ban hang da dung san - va khong ai biet
 * tai sao. Nen lay wrangler.jsonc lam nen, .env chi de de len khi thu o may.
 */
/**
 * JSONC -> JSON. Hai viec, va viec thu hai moi la cai da lam hong moi thu:
 *
 * 1. Bo dong chu thich. Chi bo dong NAO BAT DAU bang "//" - gia tri ben trong
 *    co chua "https://..." nen khong duoc cat "//" o giua dong.
 * 2. Bo dau phay thua truoc } hoac ]. Cuoi wrangler.jsonc, muc that cuoi cung
 *    ("triggers") co dau phay, roi phia sau chi con cac khoi DA BI CHU THICH
 *    (queues, ratelimits). Bo chu thich xong la con tro lai mot dau phay treo
 *    lo lung -> JSON.parse nem loi -> ca khoi "vars" bien mat.
 *
 * Hau qua that cua loi nay: FB_PIXEL_ID khai dung trong wrangler.jsonc nhung
 * KHONG BAO GIO toi duoc trang ban hang. Tien quang cao van chay, Facebook mu
 * hoan toan tren funnel - dung cai ma commit "mang Facebook Pixel theo" tuong
 * la da vá xong. Ca hai ham doc file nay deu hong theo cung mot kieu, mot ham
 * thi im lang nuot loi, nen khong ai thay gi.
 */
function readJsonc(file) {
  if (!fs.existsSync(file)) return {};
  const stripped = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(stripped);
  } catch (err) {
    // Khong nuot: cau hinh khong doc duoc thi trang xuat ra se thieu gia tri
    // mot cach im lang. Tha gay build con hon giao ban thieu pixel cho khach.
    console.error(`  ✗ khong doc duoc ${path.basename(file)}: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Cau hinh cua ban deploy nam trong khoi "vars" cua wrangler.jsonc. Neu file
 * nay chi doc .env thi co HAI nguon su that: dat HERO_VIDEO_ID trong
 * wrangler.jsonc se doi cau tra loi cua /api/config nhung KHONG doi trang ban
 * hang da dung san - va khong ai biet tai sao. Lay wrangler.jsonc lam nen,
 * .env chi de de len khi thu o may.
 */
const VARS_WRANGLER = readJsonc(path.join(ROOT, 'wrangler.jsonc')).vars || {};

/** brand/brand.json - nguon su that cho duong dan va tieu de tung trang. */
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/brand.json'), 'utf8'));

const env = (key, fallback) => {
  const v = process.env[key] ?? VARS_WRANGLER[key];
  return v === undefined || v === '' ? fallback : String(v);
};
const num = (key, fallback) => {
  const value = Number(env(key, fallback));
  return Number.isFinite(value) ? value : fallback;
};

const formatPrice = (amount) =>
  `${new Intl.NumberFormat(BRAND.meta.locale).format(amount)}${BRAND.meta.currencySuffix}`;

/**
 * Gia tri BAT BUOC. Truoc day moi dong o day co mot gia tri mac dinh la du lieu
 * that cua mot khach cu (ten san pham, gia, so dien thoai, ma video). Ai cam
 * repo ve ma quen dat mot bien se cho ra mot trang ban hang trong thi hoan
 * chinh nhung ban san pham cua nguoi khac, voi so dien thoai cua nguoi khac -
 * khong loi, khong canh bao. Gio thieu la gay build.
 */
const batBuoc = (key, giaTri) => {
  if (giaTri === undefined || giaTri === '' || giaTri === 0 || Number.isNaN(giaTri)) {
    console.error(`  ✗ thieu ${key}. Dien vao brand/brand.json roi chay: npm run brand:apply`);
    process.exit(1);
  }
  return giaTri;
};

const cfg = {
  productName: batBuoc('PRODUCT_NAME', env('PRODUCT_NAME', '')),
  price: batBuoc('PRICE_VIP', num('PRICE_VIP', 0)),
  listPrice: batBuoc('PRICE_VIP_LIST', num('PRICE_VIP_LIST', 0)),
  zaloUrl: batBuoc('ZALO_URL', env('ZALO_URL', '')),
  zaloPhone: env('ZALO_PHONE', ''),
  zaloGroupUrl: env('ZALO_GROUP_URL', ''),
  // VSL o trang chu. Doi video = doi hai bien nay roi `npm run deploy`.
  heroVideoProvider: env('HERO_VIDEO_PROVIDER', 'youtube'),
  heroVideoId: env('HERO_VIDEO_ID', ''),
  // Chi YouTube co anh dai dien doan duoc tu ma video; Wistia/Vimeo thi dat tay.
  heroVideoThumb: env('HERO_VIDEO_THUMB', ''),
  // Tu phat ngay khi mo trang. Trinh duyet chan tu phat CO TIENG, nen Wistia
  // se thu phat co tieng truoc, bi chan thi lui ve tat tieng kem nut bat tieng.
  heroVideoAutoplay: env('HERO_VIDEO_AUTOPLAY', 'true') !== 'false',
  // Video huong dan o trang cam on (/xac-nhan). Khai bao rieng chu khong dung
  // chung voi video hero: hai video nay noi hai chuyen khac han nhau - mot cai
  // de ban ve, mot cai de nguoi da dang ky biet lam gi tiep.
  confirmVideoProvider: env('CONFIRM_VIDEO_PROVIDER', 'youtube'),
  confirmVideoId: env('CONFIRM_VIDEO_ID', ''),
  // Trang cam on KHONG tu phat: nguoi vua dien form xong, mot doan video tu keu
  // len la giat minh. De ho chu dong bam.
  confirmVideoAutoplay: env('CONFIRM_VIDEO_AUTOPLAY', 'false') !== 'false',
  brandColor: env('BRAND_COLOR', BRAND.theme.primaryHex),
  brandColorDark: env('BRAND_COLOR_DARK', BRAND.theme.primaryDarkHex),
};

/**
 * .env va brand.json phai noi cung mot chuyen.
 *
 * .env KHONG nam trong git nen no dung chung cho moi nhanh, con brand.json thi
 * doi theo nhanh. Chuyen nhanh xong ma quen chay `npm run brand:apply` la .env
 * con mang gia tri cua thuong hieu cu - va vi build uu tien .env hon
 * wrangler.jsonc, ban se deploy mot trang mang ten thuong hieu khac len ten mien
 * cua minh ma khong co dau hieu gi. Nen o day dung lai va bao.
 */
(function kiemLech() {
  const canKhop = [
    ['PRODUCT_NAME', BRAND.product.name],
    ['PRICE_VIP', String(BRAND.product.price)],
    ['BANK_ACCOUNT', BRAND.payment.account],
    ['ZALO_URL', BRAND.contact.zaloUrl],
  ];
  const lech = canKhop.filter(([k, mong]) => process.env[k] && process.env[k] !== mong);
  if (!lech.length) return;
  console.error('\n  ✗ .env dang noi khac brand/brand.json:\n');
  for (const [k, mong] of lech) {
    console.error(`      ${k}\n        .env       : ${process.env[k]}\n        brand.json : ${mong}`);
  }
  console.error('\n  Chay `npm run brand:apply` de dong bo lai roi build lai.\n');
  process.exit(1);
})();

/** Anh duoc thiet ke nhac toi nhung khong co trong assets/ - bao o cuoi build. */
const anhThieu = new Set();

/** "#3b5bdb" -> "235 22 150" cho cu phap rgba(var(--brand-rgb) / .4). */

const hexSangRgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

// --- danh sach trang --------------------------------------------------------
// hrefAliases = ten file GOC con nam trong cac the <a> cua ban thiet ke; file da
// duoc doi ten khi don thu muc nen phai giu bang doi chieu nay.
/**
 * Kho trang: file thiet ke nao ra file HTML nao. Duong dan va tieu de KHONG nam
 * o day ma lay tu brand/brand.json - worker/src/routes.generated.js cung lay tu
 * do, nen hai ben khong the lech nhau nua.
 *
 * hrefAliases = ten file GOC con nam trong cac the <a> cua ban thiet ke; file da
 * duoc doi ten khi don thu muc nen phai giu bang doi chieu nay.
 */
const KHO_TRANG = {
  landing: { file: '1-landing.dc.html', out: 'index.html', key: 'landing', hrefAliases: ['AI Funnel - 1 Landing.dc.html'] },
  form: { file: '2-form.dc.html', out: 'dang-ky.html', key: 'form', hrefAliases: ['AI Funnel - 2 Form.dc.html'] },
  confirmation: { file: '3-confirmation.dc.html', out: 'xac-nhan.html', key: 'confirmation', hrefAliases: ['AI Funnel - 3 Confirmation.dc.html'] },
  oto: { file: '6-oto2.dc.html', out: 'vip.html', key: 'oto2', hrefAliases: ['AI Funnel - 6 OTO2.dc.html'] },
  checkout: { file: 'checkout.dc.html', out: 'thanh-toan.html', key: 'checkout', hrefAliases: ['Checkout.dc.html'] },
};

const PAGES = Object.entries(BRAND.funnel.pages).map(([ten, t]) => {
  const kho = KHO_TRANG[ten];
  if (!kho) {
    console.error(`  ✗ brand.json khai trang "${ten}" nhung khong co file thiet ke tuong ung.`);
    console.error(`    Trang dung duoc: ${Object.keys(KHO_TRANG).join(', ')}`);
    process.exit(1);
  }
  return { ...kho, route: t.route, title: t.title, description: t.description || '' };
});

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Token trong ban thiet ke:  [[brand.name]]  [[price]]  [[zaloUrl]] ...
 *
 * Vi sao dau ngoac vuong KEP chu khong phai {{ }}: buoc 2 ben duoi da dung
 * {{ ... }} cho bieu thuc sc-for cua runtime <x-dc>. Dung chung mot ky hieu cho
 * hai thu khac nhau la mot ngay nao do se thay mot bieu thuc bi thay nham thanh
 * ten thuong hieu, hoac nguoc lai.
 *
 * Bo token co Y giu NHO (9 cai). Moi token them vao la mot thu se bien mat khi
 * ai do xuat lai ban thiet ke tu Claude Design - it thi con nho ma dat lai.
 */
const BO_TOKEN = () => ({
  'brand.name': BRAND.identity.name,
  'brand.legalName': BRAND.identity.legalName,
  'brand.productLine': BRAND.identity.productLine,
  'brand.hostName': BRAND.identity.hostName,
  'brand.logoText': BRAND.identity.logoText,
  'brand.nameLead': BRAND.identity.nameLead || BRAND.identity.name,
  'brand.nameAccent': BRAND.identity.nameAccent || '',
  productName: cfg.productName,
  price: formatPrice(cfg.price),
  listPrice: formatPrice(cfg.listPrice),
  zaloUrl: cfg.zaloUrl,
  zaloGroupUrl: cfg.zaloGroupUrl || cfg.zaloUrl,
  zaloPhone: cfg.zaloPhone,
  supportEmail: BRAND.identity.supportEmail || '',
  // Loi chung thuc: chen thang JSON vao ma cua trang. Ten va video cua nguoi
  // that khong duoc nam trong file thiet ke - ban template di toi tay nguoi
  // khac, ho khong co quyen dung hinh anh cua hoc vien nha minh.
  testimonialIds: JSON.stringify((BRAND.funnel.testimonials?.danhSach || []).map((t) => t.videoId || '')),
  testimonialNames: JSON.stringify(Object.fromEntries(
    (BRAND.funnel.testimonials?.danhSach || []).map((t) => [t.videoId || '', t.name]),
  )),
});

function thayToken(html, page) {
  const bo = BO_TOKEN();
  const thieu = new Set();
  const ra = html.replace(/\[\[\s*([\w.]+)\s*\]\]/g, (khop, ten) => {
    if (!(ten in bo)) { thieu.add(ten); return khop; }
    return bo[ten];
  });
  if (thieu.size) {
    // Khong bo qua: mot token khong doc duoc se hien nguyen xi "[[brand.name]]"
    // tren trang ban hang that. Tha gay build.
    console.error(`  ✗ ${page.file}: token khong biet -> ${[...thieu].join(', ')}`);
    console.error(`    Token dung duoc: ${Object.keys(bo).join(', ')}`);
    process.exit(1);
  }
  return ra;
}

/** Ban sao cau hinh gui xuong trinh duyet cho funnel.js dung. */
const clientConfig = (page) => ({
  page: page.key,
  api: '/api',
  price: cfg.price,
  price_text: formatPrice(cfg.price),
  list_price_text: formatPrice(cfg.listPrice),
  product_name: cfg.productName,
  zalo_url: cfg.zaloUrl,
  zalo_phone: cfg.zaloPhone,
  zalo_group_url: cfg.zaloGroupUrl,
  routes: Object.fromEntries(
    Object.entries(BRAND.funnel.pages).map(([ten, t]) => [ten, t.route]),
  ),
  hero_video_provider: cfg.heroVideoProvider,
  hero_video_id: cfg.heroVideoId,
  hero_video_thumb: cfg.heroVideoThumb,
  hero_video_autoplay: cfg.heroVideoAutoplay,
  confirm_video_provider: cfg.confirmVideoProvider,
  confirm_video_id: cfg.confirmVideoId,
  confirm_video_autoplay: cfg.confirmVideoAutoplay,
  fb_pixel_id: env('FB_PIXEL_ID', ''),
  // Danh tinh thuong hieu cho funnel.js - file do duoc chep nguyen van nen
  // khong token hoa duoc, phai doc tu day luc chay.
  brand_name: BRAND.identity.name,
  brand_color: cfg.brandColor,
  host_name: BRAND.identity.hostName,
  logo_text: BRAND.identity.logoText,
  channel_label: BRAND.contact.channelLabel || 'Zalo',
  share_title: BRAND.identity.productLine || BRAND.identity.name,
});

/** Bam theo noi dung -> trinh duyet tai lai script khi file doi, khong dung cache cu. */
function assetVersion(files) {
  let sum = 0;
  for (const file of files) {
    try { sum += fs.statSync(file).mtimeMs; } catch { /* thieu file thi bo qua */ }
  }
  return String(Math.round(sum));
}

function render(page, version) {
  let html = fs.readFileSync(path.join(HERE, 'designs', page.file), 'utf8');

  // 1. Lien ket giua cac trang -> duong dan sach
  for (const other of PAGES) {
    for (const alias of [...other.hrefAliases, other.file]) {
      for (const variant of [alias, encodeURI(alias), alias.replace(/ /g, '%20')]) {
        html = html.split(`href="${variant}"`).join(`href="${other.route}"`);
      }
    }
  }

  // 2. src="{{ bieu.thuc }}" (anh/iframe sinh boi sc-for) -> data-dc-src, de trinh
  //    duyet KHONG tu fetch chuoi "{{ ... }}" tho luc doc HTML, truoc khi support.js
  //    kip thay bang URL that.
  html = html.replace(/\ssrc=(["'])(\{\{\s*[\w.]+\s*\}\})\1/g, ' data-dc-src=$1$2$1');

  // 3. Token trong ban thiet ke -> gia tri that
  const groupUrl = cfg.zaloGroupUrl || cfg.zaloUrl;
  html = html
    .split('href="[LINK NHÓM ZALO]"').join(`href="${escapeAttr(groupUrl)}" target="_blank" rel="noopener"`)
    .split('[LINK NHÓM ZALO]').join(groupUrl)
    .split('[GIÁ]').join(formatPrice(cfg.price))
    .split('[Giá early bird]').join(formatPrice(cfg.price))
    .split('[Giá gốc niêm yết]').join(formatPrice(cfg.listPrice));

  html = thayToken(html, page);

  // 3b. Mau thuong hieu. File thiet ke khai gia tri mac dinh de mo truc tiep van
  //     xem duoc; o day thay bang mau that. Ca trang chi doc ba bien nay.
  html = html.replace(/:root \{ --brand: [^}]*\}/,
    `:root { --brand: ${cfg.brandColor}; --brand-dark: ${cfg.brandColorDark};`
    + ` --brand-rgb: ${hexSangRgb(cfg.brandColor)}; }`);

  // 4. Duong dan tai nguyen -> /f/... (trang duoc phuc vu o goc ten mien)
  html = html
    .split('src="assets/').join('src="/f/assets/')
    .split("src='assets/").join("src='/f/assets/")
    .split('href="assets/').join('href="/f/assets/')
    .split('src="./support.js"').join(`src="/f/support.js?v=${version}"`);

  // 4a. Anh chua co -> anh giu cho, thay vi mot o vo hinh anh.
  //
  // Ban template khong di kem anh chan dung, anh workshop hay loi chung thuc
  // cua bat ky ai - do la anh nguoi that. Khach moi tha file cua ho vao
  // apps/funnel/assets/ dung ten cu la xong, khong phai sua thiet ke.
  html = html.replace(/(src=["'])\/f\/assets\/([^"']+)(["'])/g, (khop, a, ten, b) => {
    if (fs.existsSync(path.join(HERE, 'assets', decodeURIComponent(ten)))) return khop;
    anhThieu.add(ten);
    return `${a}/f/assets/placeholder.svg${b}`;
  });

  // 4b. Facebook Pixel. Dat trong <head> de bat duoc luot xem som nhat.
  //
  // Trang Base44 cu (ten-mien-cua-ban) co pixel nay; nen tang moi
  // thi khong. Doi ten mien sang nen tang ma quen mang pixel theo la mat sach
  // du lieu chuyen doi va tep retarget giua chien dich - tien quang cao van
  // chay nhung Facebook mu.
  const pixelId = env('FB_PIXEL_ID', '');
  if (pixelId) {
    const pixel = `<script>!function(f,b,e,v,n,t,s)`
      + `{if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};`
      + `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;`
      + `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}`
      + `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`
      + `fbq('init','${pixelId}');fbq('track','PageView');</script>`
      + `<noscript><img height="1" width="1" style="display:none" alt=""`
      + ` src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>`;
    html = html.includes('</head>') ? html.replace('</head>', `${pixel}
</head>`) : pixel + html;
  }

  // 5. Cau hinh + script noi backend
  const bootstrap =
    `<script>window.__FUNNEL__=${JSON.stringify(clientConfig(page)).replace(/</g, '\\u003c')};</script>`
    + `<script src="/f/funnel.js?v=${version}" defer></script>`;
  html = html.includes('</body>') ? html.replace('</body>', `${bootstrap}\n</body>`) : html + bootstrap;

  // 6. Tieu de (file thiet ke khong co <title>)
  if (!/<title>/i.test(html)) {
    html = html.replace('</head>', `<title>${page.title}</title>\n</head>`);
  }

  // 7. The chia se (Open Graph + Twitter).
  //
  // Truoc day KHONG trang nao co the nay: dan link len Zalo hay Facebook thi hien
  // ra mot o trong tron - khong anh, khong tieu de, khong mo ta. Ma ca co che
  // "moi 2 nguoi ban de len Ve Premium" song bang viec hoc vien chia se link,
  // va quang cao Facebook cung dan ve day.
  //
  // Duong dan anh phai TUYET DOI: Zalo va Facebook doc trang tu may chu cua
  // ho, duong dan tuong doi khong ai giai duoc.
  html = html.replace('</head>', `${theChiaSe(page)}\n</head>`);

  return html;
}

/** Khoi the Open Graph + Twitter cho mot trang. */
function theChiaSe(page) {
  const goc = `https://${BRAND.domains.funnelHost}`;
  const anh = BRAND.funnel.share?.image || 'og.jpg';
  // Facebook va Zalo CACHE anh chia se theo dung duong dan. Doi anh ma giu
  // nguyen duong dan thi ho van dan ra anh cu hang tuan - va khong ai hieu vi
  // sao. Gan dau thoi gian sua file vao duong dan de moi lan doi anh la mot
  // duong dan moi. (Van nen vao Sharing Debugger bam "Scrape Again" mot lan
  // cho nhung link da tung duoc chia se.)
  const vAnh = assetVersion([path.join(HERE, 'assets', anh)]);
  const moTa = page.description || BRAND.identity.productLine || BRAND.identity.name;
  const the = [
    ['og:type', 'website'],
    ['og:site_name', BRAND.identity.name],
    ['og:locale', (BRAND.meta.locale || 'vi-VN').replace('-', '_')],
    ['og:title', page.title],
    ['og:description', moTa],
    ['og:url', `${goc}${page.route}`],
    ['og:image', `${goc}/f/assets/${anh}?v=${vAnh}`],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
    ['og:image:alt', BRAND.funnel.share?.imageAlt || page.title],
  ];
  const twitter = [
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', page.title],
    ['twitter:description', moTa],
    ['twitter:image', `${goc}/f/assets/${anh}?v=${vAnh}`],
  ];
  return [
    `<meta name="description" content="${escapeAttr(moTa)}">`,
    ...the.map(([k, v]) => `<meta property="${k}" content="${escapeAttr(v)}">`),
    ...twitter.map(([k, v]) => `<meta name="${k}" content="${escapeAttr(v)}">`),
  ].join('\n');
}

/**
 * Chep thu muc. Rieng file .html thi di qua lop thay token truoc - trang dai ly,
 * trang quan tri va hai trang phap ly deu mang ten thuong hieu, khong the chep
 * nguyen van duoc.
 */
function copyDir(from, to, { thayTokenHtml = false } = {}) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    if (!fs.statSync(src).isFile()) continue;
    if (thayTokenHtml && name.endsWith('.html')) {
      let html = thayToken(fs.readFileSync(src, 'utf8'), { file: `static/${name}` });
      html = html.replace(/:root \{ --brand: [^}]*\}/,
        `:root { --brand: ${cfg.brandColor}; --brand-dark: ${cfg.brandColorDark};`
        + ` --brand-rgb: ${hexSangRgb(cfg.brandColor)}; }`);
      fs.writeFileSync(path.join(to, name), html, 'utf8');
    } else {
      fs.copyFileSync(src, path.join(to, name));
    }
    n += 1;
  }
  return n;
}

// --- chay --------------------------------------------------------------------
// Don thu muc dich truoc khi dung. Buoc build chi GHI DE file no tao ra, nen
// mot trang da bo di (hoac cua thuong hieu truoc) van nam lai trong dist va van
// duoc deploy len - dung kieu ro ri lam lo trang cu cua khach khac.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const staticDir = path.join(HERE, 'static');
const version = assetVersion([
  path.join(staticDir, 'funnel.js'),
  path.join(staticDir, 'support.js'),
]);

for (const page of PAGES) {
  const html = render(page, version);
  fs.writeFileSync(path.join(OUT, page.out), html, 'utf8');
  console.log(`  ${page.route.padEnd(14)} -> f/${page.out}  (${(html.length / 1024).toFixed(0)} KB)`);
}

const staticCount = copyDir(staticDir, OUT, { thayTokenHtml: true });
const assetCount = copyDir(path.join(HERE, 'assets'), path.join(OUT, 'assets'));

// Ban xem truoc cua thiet ke (/xem-truoc) da bi go khoi ban template: do la hai
// file mo phong 220 KB voi du lieu gia viet cung, khong noi voi backend, va da
// duoc dung lai that bang React trong apps/web. Giu lai chi ton cong bao tri.
if (anhThieu.size) {
  console.log(`
  ⚠ ${anhThieu.size} anh chua co, dang dung anh giu cho:`);
  for (const t of anhThieu) console.log(`      apps/funnel/assets/${t}`);
  console.log('    Tha anh cua ban vao dung ten do la xong, khong phai sua thiet ke.');
}
console.log(`  static/        -> f/  (${staticCount} file)`);
console.log(`  assets/        -> f/assets/  (${assetCount} file)`);

console.log(`\nDa build ${PAGES.length} trang. Gia ve VIP: ${formatPrice(cfg.price)}`);
if (!cfg.zaloGroupUrl) {
  console.log('CANH BAO: chua dat ZALO_GROUP_URL - trang xac nhan dang tro ve Zalo ca nhan.');
}
