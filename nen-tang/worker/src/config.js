/**
 * Cau hinh doc tu bien moi truong cua Cloudflare.
 *
 * Khac ban cu tren Node: khong co process.env, moi thu den tu `env` cua tung
 * request - nen day la HAM, khong phai doi tuong dung san.
 *
 * Bien thuong dat trong wrangler.jsonc ("vars"), bi mat dat bang:
 *   wrangler secret put TEN_BIEN
 */

const str = (env, key, fallback = '') => {
  const value = env[key];
  return value === undefined || value === null || value === '' ? fallback : String(value);
};
/**
 * So dien thoai nay co phai cho giu cho khong?
 *
 * Chi bat nhung chuoi KHONG THE la so that: toan so 0, hoac "0" roi mot chu so
 * lap lai (0111111111). KHONG bat theo do dai hay dau so - lam the la co ngay
 * mot khach that co so dep bi he thong am tham giau nut lien he di.
 */
const laZaloGiuCho = (sdt) => {
  const s = String(sdt || '').replace(/\D/g, '');
  return !s || /^0+$/.test(s) || /^0(\d)\1+$/.test(s);
};

const num = (env, key, fallback) => {
  const value = Number(str(env, key, fallback));
  return Number.isFinite(value) ? value : fallback;
};
const bool = (env, key, fallback) => {
  const value = str(env, key, null);
  if (value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

/**
 * Dinh dang gia. Locale va ky hieu tien den tu brand/brand.json (qua bien
 * LOCALE / CURRENCY_SUFFIX) chu khong con han cung "vi-VN" + "đ".
 */
export const formatPriceWith = (locale, suffix) => (amount) =>
  `${new Intl.NumberFormat(locale).format(amount)}${suffix}`;

/** Ban mac dinh cho nhung noi goi truc tiep (test, script) chua co env. */
export const formatPrice = formatPriceWith('vi-VN', 'đ');

export function readConfig(env) {
  const locale = str(env, 'LOCALE', 'vi-VN');
  const currencySuffix = str(env, 'CURRENCY_SUFFIX', 'đ');
  const dinhDangGia = formatPriceWith(locale, currencySuffix);

  return {
    publicUrl: str(env, 'PUBLIC_URL').replace(/\/$/, ''),
    appHost: str(env, 'APP_HOST'),
    // Ten mien TRANG BAN HANG. Link gioi thieu phai tro ve day chu khong phai
    // ve ten mien dang mo: hoc vien xem trang Affiliate trong khu vuc thanh
    // vien thi origin cua request la APP_HOST, va link chia se sinh ra tu do se
    // do nguoi duoc moi thang vao man hinh dang nhap.
    salesOrigin: str(env, 'APP_ORIGIN').replace(/\/$/, ''),
    environment: str(env, 'ENVIRONMENT', 'production'),
    locale,

    // Ten thuong hieu cho phan hien thi (email, thong bao, trang ban hang).
    // Sinh tu brand/brand.json - xem scripts/brand/apply.mjs.
    brand: {
      name: str(env, 'BRAND_NAME'),
      legalName: str(env, 'BRAND_LEGAL_NAME'),
      productLine: str(env, 'BRAND_PRODUCT_LINE'),
      hostName: str(env, 'BRAND_HOST_NAME'),
      logoText: str(env, 'BRAND_LOGO_TEXT'),
      color: str(env, 'BRAND_COLOR', '#111111'),
      colorDark: str(env, 'BRAND_COLOR_DARK', '#000000'),
    },

    product: {
      // KHONG con gia tri mac dinh cua khach cu o day. Xem ghi chu o khoi bank.
      name: str(env, 'PRODUCT_NAME', 'Sản phẩm (chưa cấu hình)'),
      sku: str(env, 'PRODUCT_SKU', 'SKU'),
      // Tien to ma don. Truoc day viet cung "VIP" o hai noi (orders.js va
      // webhook.js) - doi SKU ma quen doi regex la webhook khong nhan ra ma don
      // nua, tien ve ma don khong tu xac nhan.
      orderPrefix: str(env, 'ORDER_PREFIX', 'DH').toUpperCase(),
      // Form dang ky co dung bo 8 cau hoi khong. Mac dinh CO: thuong hieu nao
      // khong khai gi thi van cham diem lead nhu cu. Chi khi brand.json noi ro
      // funnel.boCauHoi = false (form chi hoi ten/sdt/email) thi /api/leads moi
      // thoi doi `answers` - khong de mot request thieu answers tu nhien duoc
      // bo qua kiem tra.
      boCauHoi: str(env, 'FORM_BO_CAU_HOI', '1') !== '0',
      // Gia 0 = chua cau hinh -> trang thanh toan tu choi tao don (xem
      // thieuCauHinhTien ben duoi) thay vi ban voi mot cai gia bia dat.
      price: num(env, 'PRICE_VIP', 0),
      listPrice: num(env, 'PRICE_VIP_LIST', 0),
      currency: 'VND',
    },

    // KHONG CO `video` O DAY NUA - no la code chet.
    //
    // Truoc day cho nay dung mot object { heroProvider, heroId } doc tu
    // HERO_VIDEO_*. Khong mot dong nao trong worker/src doc toi no, va khong
    // endpoint nao phat no ra. Trang ban hang lay video luc BUILD: ban template
    // (apps/funnel) doc .env, ban dang dung (apps/funnel-gc) doc
    // site.config.json. Ca hai deu khong di qua day.
    //
    // De lai mot object trong nay la moi nguoi sua HERO_VIDEO_ID roi deploy va
    // ngoi doi mot thu khong bao gio doi. Neu ve sau can phat cau hinh video
    // cho SPA thi them lai kem MOT endpoint doc that su.

    affiliate: {
      // Ty le hoa hong mac dinh tren moi don ban duoc qua link gioi thieu
      rate: Math.max(0, Math.min(100, num(env, 'AFFILIATE_RATE', 20))) / 100,
      cookieDays: num(env, 'AFFILIATE_COOKIE_DAYS', 60),
      autoEnroll: bool(env, 'AFFILIATE_AUTO_ENROLL', true),
      // Qua bao nhieu luot tu cung mot IP thi chuyen sang cho admin duyet (0 = tat)
      maxPerIp: num(env, 'AFFILIATE_MAX_PER_IP', 3),
      // Moi du bao nhieu nguoi thi duoc TANG ve VIP (0 = tat han tuyen nay).
      vipAtReferrals: num(env, 'AFFILIATE_VIP_AT_REFERRALS', 10),
    },

    /**
     * BON DONG NAY DI THANG VAO MA QR KHACH QUET DE TRA TIEN.
     *
     * Truoc day chung co gia tri mac dinh la tai khoan that cua mot khach cu.
     * Nghia la: ai cam ban ma nay ve, quen dat BANK_ACCOUNT, roi mo ban hang -
     * he thong van in ra ma QR dep de, khach van quet, va tien chay thang vao
     * tui nguoi khac. Khong mot dong log nao, khong mot canh bao nao.
     *
     * Nen o day KHONG co gia tri mac dinh, va thieu thi trang thanh toan tu
     * choi tao don (thieuCauHinhTien). Gay to tieng con hon tra tien nham cho.
     */
    bank: {
      bin: str(env, 'BANK_BIN'),
      name: str(env, 'BANK_NAME'),
      account: str(env, 'BANK_ACCOUNT'),
      accountName: str(env, 'BANK_ACCOUNT_NAME'),
      // Tien to BAT BUOC o dau noi dung chuyen khoan.
      //
      // VietinBank chi bao giao dich sang SePay khi noi dung bat dau bang
      // SEVQR. Thieu no thi tien ve tai khoan that ma SePay khong thay gi,
      // webhook khong bao gio chay, don nam mai o "cho thanh toan" - va khong
      // mot dong log nao o phia minh noi duoc vi sao. Dung 36 don dau tien da
      // chet dung kieu do.
      memoPrefix: str(env, 'BANK_MEMO_PREFIX').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    },

    // Zalo CHUA DIEN thi phai tra ve RONG, khong tra ve so gia.
    //
    // brand.json bat buoc contact.zaloPhone khop /^0\d{8,10}$/ nen cho tay vao
    // mot cho giu cho, va cho giu cho duoc chon la "0000000000" - mot chuoi HOP
    // LE VE MAT DINH DANG. Hau qua: moi cho trong giao dien deu thay mot so "co
    // that" va hien nut, trong khi zalo.me/0000000000 la link chet. Te nhat la
    // nut "Gui bill ve Zalo de minh xac nhan nhe" o trang Cua hang - dung cho
    // khach VUA CHUYEN TIEN xong bam vao.
    //
    // Cac man hinh deu da co san phep thu `{zaloChiThanh && ...}`; chung chi can
    // gia tri RONG la tu an. Nen quy doi o DAY, mot cho, thay vi rai phep thu
    // "co phai so gia khong" khap noi.
    zalo: laZaloGiuCho(str(env, 'ZALO_PHONE'))
      ? { supportPhone: '', supportUrl: '', groupUrl: '' }
      : {
        supportPhone: str(env, 'ZALO_PHONE'),
        supportUrl: str(env, 'ZALO_URL'),
        // Nhom Zalo co cho giu cho rieng, doc lap voi so dien thoai.
        groupUrl: /\/g\/chua-co\/?$/.test(str(env, 'ZALO_GROUP_URL'))
          ? '' : str(env, 'ZALO_GROUP_URL'),
      },

    webhook: {
      // Secret cho webhook ngan hang (SePay / Casso). De trong = tu choi tat ca.
      bankSecret: str(env, 'BANK_WEBHOOK_SECRET'),
      notifyUrl: str(env, 'NOTIFY_WEBHOOK_URL'),
    },

    limits: {
      leadPerHour: num(env, 'RATE_LEAD_PER_HOUR', 10),
      orderPerHour: num(env, 'RATE_ORDER_PER_HOUR', 20),
      trackPerMinute: num(env, 'RATE_TRACK_PER_MINUTE', 120),
      bodyBytes: num(env, 'MAX_BODY_BYTES', 64 * 1024),
      // Tran RIENG cho tep tai len. Khong noi bodyBytes chung len 5 MB: moi
      // duong API deu doc body theo con so do, noi no la mo mot cua tu choi
      // dich vu tren ca he thong chi de nhan mot tam anh dai dien.
      //
      // routes/files.js doc dung con so nay. Truoc day no giu mot hang 5 MB
      // rieng trong khi router chan o 64 KB - hai con so venh nhau 80 lan, va
      // ket qua la KHONG MOT ANH DIEN THOAI NAO tai len duoc, ke tu ngay dau.
      uploadBytes: num(env, 'MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
    },

    corsOrigins: str(env, 'CORS_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean),

    admin: {
      user: str(env, 'ADMIN_USER', 'admin'),
      // CHI nhan ban bam. Ban cu con nhan ca mat khau de nguyen va co san mot
      // ban bam khoi tao nam trong ma nguon cong khai - ai co repo la vao duoc
      // /admin. Bo han: chua dat ADMIN_PASSWORD_HASH thi trang quan tri dong.
      passwordHash: str(env, 'ADMIN_PASSWORD_HASH'),
      sessionHours: num(env, 'ADMIN_SESSION_HOURS', 12),
      // Token cho script/CI. KHONG co gia tri mac dinh - de trong nghia la tat.
      serviceToken: str(env, 'ADMIN_SERVICE_TOKEN'),
    },

    sessionSecret: str(env, 'SESSION_SECRET'),

    formatPrice: dinhDangGia,
  };
}

/**
 * Thieu gi de ban duoc hang? Tra ve danh sach ten bien con trong.
 *
 * Goi truoc khi tao don va truoc khi dung ma QR. Tra ve mang rong = du dieu
 * kien nhan tien.
 */
export function thieuCauHinhTien(cfg) {
  const thieu = [];
  if (!cfg.bank.bin) thieu.push('BANK_BIN');
  if (!cfg.bank.account) thieu.push('BANK_ACCOUNT');
  if (!cfg.bank.accountName) thieu.push('BANK_ACCOUNT_NAME');
  if (!cfg.product.price) thieu.push('PRICE_VIP');
  return thieu;
}
