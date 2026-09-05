/**
 * Soát cấu hình trước khi deploy.
 *
 *   node scripts/preflight.mjs --env preview
 *   node scripts/preflight.mjs --env production
 *
 * Phân biệt rạch ròi hai mức:
 *
 *   CHẶN   — thiếu thì hệ deploy xong vẫn chạy, nhưng KHÔNG NHẬN ĐƯỢC TIỀN.
 *            Đây là loại lỗi tệ nhất: trang trông vẫn bình thường, khách vẫn
 *            bấm mua, và chỉ phát hiện khi có người chuyển khoản thật rồi
 *            không thấy gì xảy ra.
 *
 *   CẢNH BÁO — thiếu thì phễu yếu đi hoặc chưa chạy quảng cáo được, nhưng
 *            trang không vỡ và tiền vẫn về đúng chỗ. Preview thì kệ, production
 *            thì nên xử trước khi đổ tiền quảng cáo.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const ENV = arg('env', 'preview');
const SKIP_SECRETS = argv.includes('--no-secrets');

if (!['preview', 'production'].includes(ENV)) {
  console.error(`Môi trường không hợp lệ: ${ENV}. Chỉ nhận "preview" hoặc "production".`);
  process.exit(2);
}

const blockers = [];
const warnings = [];
const block = (what, why) => blockers.push({ what, why });
const warn = (what, why) => warnings.push({ what, why });

// ------------------------------------------------------------- wrangler.jsonc

const raw = readFileSync('wrangler.jsonc', 'utf8');
// Bỏ chú thích để đọc được bằng JSON.parse. Chỉ dùng cho việc ĐỌC — lúc ghi id
// vào file thì phải thay chuỗi tại chỗ, nếu không chú thích tiếng Việt bay sạch.
const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
const envCfg = cfg.env?.[ENV];

if (!envCfg) {
  console.error(`wrangler.jsonc chưa có khối env.${ENV}.`);
  process.exit(2);
}

const PLACEHOLDER = /^0+$|^0{8}-0{4}-0{4}-0{4}-0{12}$/;

const dbId = envCfg.d1_databases?.[0]?.database_id ?? '';
if (!dbId || PLACEHOLDER.test(dbId)) {
  block('database_id của D1 chưa điền',
    'Deploy sẽ thất bại hoặc trỏ vào một database không tồn tại. Chạy `npm run cf:' +
    (ENV === 'preview' ? 'preview' : 'prod') + '` để script tự tạo và tự điền.');
}

const kvId = envCfg.kv_namespaces?.[0]?.id ?? '';
if (!kvId || PLACEHOLDER.test(kvId)) {
  block('id của KV namespace chưa điền',
    'Không có KV thì rate limit và khoá đăng nhập sai không hoạt động.');
}

// ------------------------------------------------------------ thông tin nhận tiền

const vars = envCfg.vars ?? {};

if (!String(vars.SEPAY_ACCOUNT_NO ?? '').trim()) {
  block('SEPAY_ACCOUNT_NO trống',
    'Trang thanh toán không sinh được mã QR và không in được số tài khoản. ' +
    'Khách bấm mua xong sẽ nhìn thấy một trang trống rỗng.');
}

if (!String(vars.SEPAY_ACCOUNT_NAME ?? '').trim()) {
  block('SEPAY_ACCOUNT_NAME trống',
    'Khách chuyển khoản không thấy tên chủ tài khoản để đối chiếu — nhiều người ' +
    'sẽ dừng lại ở đúng bước đó.');
}

const expectedHost = ENV === 'production' ? 'goc-creator' : 'goc-creator-preview';
const baseUrl = String(vars.PUBLIC_BASE_URL ?? '');
if (!baseUrl.startsWith('https://')) {
  block('PUBLIC_BASE_URL không phải https',
    `Đang là "${baseUrl}". Cookie phiên đăng nhập dùng tiền tố __Host- nên bắt buộc https.`);
} else if (!baseUrl.includes(expectedHost) && baseUrl.includes('workers.dev')) {
  warn('PUBLIC_BASE_URL có thể sai môi trường',
    `Đang deploy env.${ENV} nhưng PUBLIC_BASE_URL là "${baseUrl}". ` +
    'Nếu đã trỏ tên miền riêng thì bỏ qua cảnh báo này.');
}

// ------------------------------------------------------------------ khoá bí mật

if (!SKIP_SECRETS) {
  let names = null;
  try {
    const out = execFileSync('npx', ['wrangler', 'secret', 'list', '--env', ENV],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // Output có thể lẫn banner của wrangler — bắt lấy đoạn JSON đầu tiên.
    const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
    names = new Set(JSON.parse(json).map((s) => s.name));
  } catch {
    // Chưa deploy lần nào thì Worker chưa tồn tại và lệnh này lỗi — đó là
    // chuyện bình thường ở lần chạy đầu, không phải lý do để chặn.
    warn('Chưa đọc được danh sách khoá bí mật',
      'Thường là do Worker chưa từng được deploy. Script deploy sẽ tự đặt khoá.');
  }

  if (names) {
    for (const [name, why] of [
      ['SESSION_SECRET', 'Không có thì không ai đăng nhập được vào /admin hay /aff.'],
      ['IP_HASH_SALT', 'Không có thì không băm được IP để thống kê và chống spam.'],
      ['SEPAY_WEBHOOK_API_KEY',
        'Tiền về mà hệ không biết: SePay gọi webhook, hệ từ chối vì không có khoá ' +
        'để đối chiếu, đơn treo mãi ở trạng thái chờ thanh toán.'],
    ]) {
      if (!names.has(name)) block(`Khoá bí mật ${name} chưa đặt`, why);
    }

    if (!names.has('TURNSTILE_SECRET_KEY')) {
      warn('TURNSTILE_SECRET_KEY chưa đặt',
        'Form công khai chỉ còn honeypot và rate limit chặn bot. Chấp nhận được ' +
        'lúc đầu, nhưng nên bật khi bắt đầu chạy quảng cáo.');
    }
  }
}

// ------------------------------------------------------- nội dung trang (cảnh báo)

const site = JSON.parse(readFileSync('site.config.json', 'utf8'));
const empty = (v) => !String(v ?? '').trim();

const legal = site.legal ?? {};
if (empty(legal.company) || empty(legal.taxId) || empty(legal.address)) {
  warn('Khối pháp nhân ở chân trang còn trống',
    'BẮT BUỘC theo luật thương mại điện tử trước khi chạy quảng cáo: tên công ty, ' +
    'mã số thuế, địa chỉ, hotline, email. Chưa có thì khối tự ẩn, trang vẫn chạy.');
}

const pol = site.policies ?? {};
if (empty(pol.privacy) || empty(pol.terms) || empty(pol.refund)) {
  warn('Thiếu trang chính sách',
    'Trang đang in cam kết hoàn tiền — đó là điều khoản ràng buộc, phải có ' +
    'trang chính sách thật đứng sau.');
} else if (pol.confirmed !== true) {
  // Ba trang đã tồn tại và đã dựng ra được — nhưng nội dung do máy soạn.
  // "Có trang" và "đã đọc và đồng ý với từng câu" là hai chuyện khác nhau, và
  // chỉ chuyện thứ hai mới ràng buộc được anh Thành trước khách hàng.
  warn('Anh Thành chưa xác nhận nội dung ba trang chính sách',
    'Nội dung do máy soạn theo điều kiện đã chốt (14 ngày, đã nộp 3 bài). ' +
    'Đọc lại /chinh-sach-bao-mat, /dieu-khoan, /chinh-sach-hoan-tien rồi đổi ' +
    '"policies.confirmed" thành true trong site.config.json.');
}

if (empty(site.startDateText)) {
  warn('Chưa có ngày khai giảng', 'Khối đếm ngược và dòng "khai giảng ngày…" đang bị ẩn.');
}

const ytFilled = Object.values(site.youtube ?? {}).filter((v) => !empty(v)).length;
if (ytFilled === 0) {
  warn('Chưa có link YouTube cho 12 video feedback',
    'Trang đang hiện ảnh poster tĩnh, bấm vào không phát được video.');
}

// ------------------------------------------------------------------------ in ra

const line = (s) => console.log(s);
line('');
line(`SOÁT CẤU HÌNH — môi trường ${ENV}`);
line('─'.repeat(72));

if (warnings.length) {
  line('');
  line(`⚠  ${warnings.length} CẢNH BÁO — deploy vẫn chạy, nhưng nên xử trước khi chạy quảng cáo:`);
  warnings.forEach((w, i) => {
    line('');
    line(`   ${i + 1}. ${w.what}`);
    line(`      ${w.why.replace(/\n/g, '\n      ')}`);
  });
}

if (blockers.length) {
  line('');
  line(`✗  ${blockers.length} LỖI CHẶN — deploy xong sẽ KHÔNG NHẬN ĐƯỢC TIỀN:`);
  blockers.forEach((b, i) => {
    line('');
    line(`   ${i + 1}. ${b.what}`);
    line(`      ${b.why.replace(/\n/g, '\n      ')}`);
  });
  line('');
  line('─'.repeat(72));
  line('Dừng lại. Sửa những mục trên rồi chạy lại.');
  line('');
  process.exit(1);
}

line('');
line('✓  Không có lỗi chặn. Đủ điều kiện deploy và nhận tiền.');
line('');
process.exit(0);
