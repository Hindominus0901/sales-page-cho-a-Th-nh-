/**
 * Kiem tra nhanh toan bo luong backend tren mot server dang chay.
 *   node server/smoke-test.js [baseUrl]
 * Bien moi truong: ADMIN_TOKEN, BANK_WEBHOOK_SECRET (phai trung voi server).
 */
import fs from 'node:fs';
// Gia san pham lay tu chinh server dang chay, khong doc lai file cau hinh -
// nho vay bo test chay duoc ca voi ban da deploy tren Cloudflare.
let PRODUCT_PRICE = 399000;
// So tai khoan nhan tien, DOC TU BIEN MOI TRUONG.
//
// Truoc day o day la mot so bia ('999999999999'), va truoc do nua la so tai
// khoan THAT cua mot khach - bo test la thu duoc chep di chep lai nhieu nhat,
// nen mot so that nam trong do se theo ma nguon di khap noi. Y do giau so that
// van giu nguyen: doc tu bien moi truong thi khong co con so nao nam trong
// repo.
//
// Nhung so BIA thi khong dung duoc nua: webhook gio kiem tien co vao dung tai
// khoan da cau hinh khong (khopTaiKhoan trong worker/src/routes/webhook.js), va
// mot so bia se bi tu choi - dung nhu no phai lam voi tien vao mot tai khoan
// la. Duong tu choi do duoc kiem rieng trong tests/platform.mjs.
//
// Khong dat bien -> chuoi rong -> phep kiem tu bo qua, bo test van chay duoc.
const SO_TK_NHAN = process.env.BANK_ACCOUNT || '';
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
// Mat khau goc CHI dung cho bo test - Worker khong bao gio doc bien nay.
const SMOKE_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || '';
// Tien to ma don va tien to noi dung ngan hang nam trong wrangler.jsonc (sinh tu
// brand/brand.json), KHONG nam trong .env - nen doc thang tu brand.json. Truoc
// day doc process.env: bo test khong thay gi, roi ve mac dinh 'DH', va bai
// "tao don" DO voi moi thuong hieu co tien to khac. Nguy hiem hon: bai kiem
// tien to SEVQR bi bo qua IM LANG vi BANK_MEMO_PREFIX cung rong.
const BRAND_TEST = JSON.parse(
  fs.readFileSync(new URL('../brand/brand.json', import.meta.url), 'utf8'));
const TIEN_TO_DON = String(
  process.env.ORDER_PREFIX || BRAND_TEST.product?.orderPrefix || 'DH').toUpperCase();
const TIEN_TO_NGAN_HANG = String(
  process.env.BANK_MEMO_PREFIX || BRAND_TEST.payment?.memoPrefix || '').toUpperCase();
const ADMIN = process.env.ADMIN_SERVICE_TOKEN || process.env.ADMIN_TOKEN || 'test123';
const HOOK = process.env.BANK_WEBHOOK_SECRET || 'hook123';

let cookie = '';
let cookieJar = {};
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) { passed += 1; console.log(`  OK   ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}${detail ? ' -> ' + JSON.stringify(detail) : ''}`); }
}

function cookieHeader() {
  const parts = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`);
  return parts.join('; ');
}

async function call(method, path, body, headers = {}) {
  const jar = cookieHeader();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jar ? { Cookie: jar } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookieJar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  cookie = cookieHeader();
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const uniquePhone = () => '09' + String(Date.now()).slice(-8);

const ANSWERS = {
  q1: 'Rồi, tôi đã từng thử mô hình kinh doanh online trước đây',
  q2: 'Xây một hệ thống thu nhập lớn, quy mô dài hạn',
  q3: 'Trên 15 giờ/tuần',
  q4: ['Thiếu thời gian vì công việc/gia đình hiện tại'],
  q5: 'Đã dùng để làm việc/kinh doanh nhưng chưa có hệ thống',
  q7: 'Kinh doanh tự do / chủ shop, chủ dịch vụ nhỏ',   // cau 6 hien thi
  q8: 'Trên 70 triệu/tháng',                            // cau 7 hien thi
  q6: ['Có người đồng hành, cố vấn trực tiếp thay vì tự mày mò'], // cau 8 hien thi
};

(async () => {
  console.log(`Kiem tra ${BASE}\n`);

  console.log('1. Trang & health');
  const health = await call('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.data.ok);

  // Lay gia that tu chinh server dang chay, de bo test khong phu thuoc file .env
  const cfg = await call('GET', '/api/config');
  check('GET /api/config', cfg.status === 200 && cfg.data.ok && cfg.data.product?.price > 0);
  if (cfg.data?.product?.price) PRODUCT_PRICE = cfg.data.product.price;

  // KHONG duoc phat mot so Zalo giu cho ra ngoai. brand.json bat buoc
  // contact.zaloPhone khop /^0\d{8,10}$/, nen cho giu cho "0000000000" la mot
  // chuoi HOP LE VE DINH DANG - no di lot qua validate, ra toi /api/config, roi
  // len giao dien duoi dang mot nut bam dan toi zalo.me/0000000000. Nut do nam
  // ngay cho khach VUA CHUYEN TIEN gui bill. config.js quy doi cho giu cho
  // thanh chuoi rong de cac man hinh tu an nut di; bai nay giu cho no khong
  // quay lai.
  const sdtZalo = String(cfg.data?.zalo?.phone || '').replace(/\D/g, '');
  check('/api/config khong phat so Zalo giu cho',
    !sdtZalo || !(/^0+$/.test(sdtZalo) || /^0(\d)\1+$/.test(sdtZalo)), cfg.data?.zalo);
  check('link Zalo rong hoac tro toi dung so do',
    !cfg.data?.zalo?.url || cfg.data.zalo.url.includes(sdtZalo), cfg.data?.zalo?.url);
  check('link nhom Zalo khong con la cho giu cho',
    !/\/g\/chua-co\/?$/.test(cfg.data?.zalo?.group_url || ''), cfg.data?.zalo?.group_url);

  // Danh sach trang lay tu brand.json chu khong viet cung: thuong hieu bo trang
  // /vip hay doi duong dan la bo test cu do ma khong lien quan gi den san pham.
  const TRANG = Object.values(BRAND_TEST.funnel?.pages || {}).map((t) => t.route);
  // Thuong hieu mang trang ban hang cua rieng minh thi khong co funnel.js cua
  // template - va do la dung, khong phai loi. Bai kiem chung (200 + la HTML +
  // co header bao mat) van chay cho ca hai.
  const TRANG_RIENG = BRAND_TEST.funnel?.trangRieng === true;
  for (const path of TRANG) {
    const res = await fetch(BASE + path);
    const html = await res.text();
    const laHtml = res.status === 200
      && (res.headers.get('content-type') || '').includes('text/html')
      && /<\/html>/i.test(html);
    if (TRANG_RIENG) {
      check(`GET ${path} tra ve trang HTML`, laHtml, res.status);
    } else {
      check(`GET ${path} tra ve HTML + funnel.js`,
        laHtml && html.includes('/funnel.js') && html.includes('__FUNNEL__'));
    }
  }

  // VSL o trang chu phai doi duoc bang cau hinh. Ban cu doi bang cach tim
  // 'iframe[src*="youtube.com/embed/"]' roi sua src - cach do chet am tham tu
  // luc iframe duoc go khoi DOM cho den khi bam phat.
  const landing = await fetch(`${BASE}/`).then((r) => r.text());
  if (!TRANG_RIENG) {
  check('trang chu mang cau hinh VSL',
    /"hero_video_provider":/.test(landing) && /"hero_video_id":/.test(landing));
  const funnelJs = await fetch(`${BASE}/f/funnel.js`).then((r) => (r.ok ? r.text() : ''));
  // Tim CHINH LOI GOI, khong phai chuoi ky tu: doan giai thich ben tren ham do
  // co trich lai cach cu de nguoi doc hieu tai sao no chet.
  check('khong con dung cach tim iframe da chet',
    funnelJs.length > 0 && !/querySelector\(\s*'iframe\[src/.test(funnelJs), funnelJs.length);
  check('doi duoc VSL sang Wistia', funnelJs.includes('fast.wistia.net/embed/iframe'));
  // Tu phat: phai la silentAutoPlay=allow. Neu dat muted=true thi Wistia GIAU
  // luon nut bat tieng - video chay cam nin va nguoi xem khong biet duong bat.
  check('tu phat dung cach (co duong lui khi trinh duyet chan tieng)',
    funnelJs.includes("'&autoPlay=true&silentAutoPlay=allow'")
    && !funnelJs.includes('&muted='));
  check('tu phat tat duoc bang cau hinh', /"hero_video_autoplay":/.test(landing));
  }

  // Header bao mat. Truoc day run_worker_first chi liet ke vai duong nen
  // /dashboard, /community... duoc bien Cloudflare tra thang, khong qua Worker
  // -> khong he co header nao.
  const head = async (p) => (await fetch(`${BASE}${p}`)).headers;
  const hLanding = await head('/');
  check('trang ban hang co CSP', /default-src/.test(hLanding.get('content-security-policy') || ''));
  check('CSP trang ban hang cho phep dc-runtime chay (new Function)',
    /unsafe-eval/.test(hLanding.get('content-security-policy') || ''));
  check('trang ban hang VAN cho Google lap chi muc', !hLanding.get('x-robots-tag'));

  const hApp = await head('/dashboard');
  const cspApp = hApp.get('content-security-policy') || '';
  check('khu vuc thanh vien co CSP', /default-src/.test(cspApp));
  check('khu vuc thanh vien SIET script-src (khong unsafe-eval/inline)',
    /script-src 'self'/.test(cspApp) && !/script-src[^;]*unsafe/.test(cspApp), cspApp.slice(0, 90));
  check('khu vuc thanh vien KHONG cho lap chi muc',
    /noindex/.test(hApp.get('x-robots-tag') || ''));
  check('cong quan tri KHONG cho lap chi muc',
    /noindex/.test((await head('/admin')).get('x-robots-tag') || ''));
  check('CSP chan nhung ma khong chan video hoc',
    /object-src 'none'/.test(cspApp) && /wistia/.test(cspApp) && /youtube/.test(cspApp));

  const hAsset = await head('/robots.txt');
  check('robots.txt chan ca trang quan tri funnel cu',
    (await (await fetch(`${BASE}/robots.txt`)).text()).includes('/quan-tri-funnel'));

  console.log('\n2. Lead');
  const phone = uniquePhone();
  const lead = await call('POST', '/api/leads', {
    full_name: 'Nguyễn Thị Thử Nghiệm',
    email: `test${Date.now()}@smoketest.local`,
    phone,
    country_code: '+84',
    answers: ANSWERS,
    answers_schema: 'html',
    attribution: { utm_source: 'facebook', utm_campaign: 'smoke-test' },
  });
  check('POST /api/leads tao lead moi', lead.status === 201 && lead.data.ok, lead.data);
  check('cham diem lead (hot)', lead.data?.lead?.segment === 'hot' && lead.data.lead.score >= 90, lead.data?.lead);

  const dup = await call('POST', '/api/leads', {
    full_name: 'Nguyễn Thị Thử Nghiệm 2',
    email: `test2${Date.now()}@smoketest.local`,
    phone,
    answers: ANSWERS,
    answers_schema: 'html',
  });
  check('gui lai cung so dien thoai -> cap nhat, khong tao trung',
    dup.status === 200 && dup.data.created === false && dup.data.lead.id === lead.data.lead.id, dup.data);

  const bad = await call('POST', '/api/leads', { full_name: 'A', email: 'sai', phone: '123', answers: {} });
  check('validate du lieu sai -> 422', bad.status === 422 && bad.data.error.fields.email, bad.data);

  // Bao mat: mot NGUOI/PHIEN KHAC (khong phai chu that) gui trung so dien thoai voi lead da co ->
  // khong duoc phep chiem quyen (khong nhan lai token affiliate that, khong ghi de ten/email that).
  const ownerJar = cookieJar;
  cookieJar = {}; // phien hoan toan moi, gia lap ke gia mao
  const claim = await call('POST', '/api/leads', {
    full_name: 'Ke Gia Mao', email: `imposter${Date.now()}@smoketest.local`, phone,
    answers: ANSWERS, answers_schema: 'html',
  });
  check('phien khac claim trung SDT -> KHONG nhan duoc affiliate that',
    claim.status === 200 && claim.data.created === false && claim.data.affiliate === null, claim.data);
  check('phien khac claim trung SDT -> lead tra ve la du lieu tu goi, khong phai ten that cua chu so',
    claim.data?.lead?.full_name === 'Ke Gia Mao', claim.data?.lead);
  cookieJar = ownerJar; // quay lai phien chu that

  const stillOwns = await call('GET', '/api/affiliate/me');
  check('chu that (phien goc) van truy cap duoc portal cua minh sau khi bi claim trung SDT',
    stillOwns.status === 200 && stillOwns.data.ok === true, stillOwns.data);

  console.log('\n3. Tracking');
  const track = await call('POST', '/api/track', { type: 'page_view', page: 'landing' });
  check('POST /api/track', track.status === 202);
  const badTrack = await call('POST', '/api/track', { type: 'hack_me' });
  check('chan event la', badTrack.status === 400);

  console.log('\n4. Don hang VIP');
  const order = await call('POST', '/api/orders', {});
  // Tien to ma don theo thuong hieu (ORDER_PREFIX), khong con viet cung "VIP":
  // bo test cung khong duoc gia dinh ten cua mot thuong hieu cu the nao.
  check('POST /api/orders tao don',
    order.status === 201 && order.data.order.code.startsWith(TIEN_TO_DON), order.data);
  const code = order.data?.order?.code;
  check('co link VietQR + noi dung chuyen khoan',
    !!order.data?.order?.transfer?.qr_url?.includes('img.vietqr.io')
    && order.data.order.transfer.content.includes(code), order.data?.order?.transfer);

  // Tien to bat buoc cua nha cung cap. VietinBank CHI bao giao dich sang SePay
  // khi noi dung bat dau bang SEVQR - thieu no thi tien ve tai khoan that ma
  // don khong bao gio tu xac nhan, va khong mot dong log nao noi vi sao. Dung
  // 36 don dau tien da chet dung kieu do.
  const tienToNH = TIEN_TO_NGAN_HANG;
  if (tienToNH) {
    const nd = order.data?.order?.transfer?.content || '';
    check('noi dung chuyen khoan bat dau bang tien to cua ngan hang',
      nd.startsWith(`${tienToNH} `), nd);
    check('tien to nam trong ca ma QR', 
      (order.data?.order?.transfer?.qr_url || '').includes(tienToNH), order.data?.order?.transfer?.qr_url);
    check('co tien to van doc ra dung ma don', nd.includes(code), nd);
  }

  const again = await call('POST', '/api/orders', {});
  check('goi lai -> dung lai don dang cho, khong tao trung',
    again.data?.reused === true && again.data.order.code === code, again.data);

  const fetched = await call('GET', `/api/orders/${code}`);
  check('GET /api/orders/:code', fetched.status === 200 && fetched.data.order.status === 'pending');

  console.log('\n5. Webhook ngan hang');
  const noAuth = await call('POST', '/api/webhooks/bank', { amount: PRODUCT_PRICE, content: `${TIEN_TO_DON} ${code}` });
  check('thieu secret -> 401', noAuth.status === 401);

  const paid = await call('POST', '/api/webhooks/bank', {
    id: 'tx-' + Date.now(),
    gateway: 'NganHangGiaLap',
    transactionDate: new Date().toISOString(),
    accountNumber: SO_TK_NHAN,
    content: `CT DEN:${code.replace(TIEN_TO_DON, TIEN_TO_DON + ' ')} NGUYEN THI THU NGHIEM`,
    transferType: 'in',
    transferAmount: PRODUCT_PRICE,
    referenceCode: 'FT123456',
  }, { Authorization: `Apikey ${HOOK}` });
  check('SePay payload -> tu dong xac nhan don',
    paid.status === 200 && paid.data.results[0].status === 'paid', paid.data);

  const after = await call('GET', `/api/orders/${code}`);
  check('don chuyen sang paid', after.data?.order?.status === 'paid', after.data?.order);

  const replay = await call('POST', '/api/webhooks/bank', {
    id: 'tx-unmatched-' + Date.now(), transferAmount: 500000, transferType: 'in',
    content: 'CHUYEN TIEN LINH TINH', accountNumber: SO_TK_NHAN,
  }, { 'X-Webhook-Secret': HOOK });
  check('giao dich khong khop -> unmatched', replay.data?.results?.[0]?.status === 'unmatched', replay.data);

  console.log('\n6. Affiliate');
  const leadPortal = await call('GET', '/api/affiliate/me');
  check('nguoi dang ky duoc cap link gioi thieu',
    leadPortal.status === 200 && !!leadPortal.data.links?.share_url, leadPortal.data?.error);
  const refCode = leadPortal.data?.affiliate?.code;
  check('ma gioi thieu sinh tu ten', !!refCode && /^[A-Z0-9]{4,}$/.test(refCode || ''), refCode);
  check('hoa hong mac dinh 20%', leadPortal.data?.affiliate?.commission_rate_text === '20%',
    leadPortal.data?.affiliate);

  // Khach thu 2 vao bang link gioi thieu -> dang ky -> mua VIP
  const buyerJar = cookieJar;
  cookieJar = {}; // phien trinh duyet moi
  const refHit = await call('POST', '/api/ref', { code: refCode, landing_url: `${BASE}/?ref=${refCode}` });
  check('POST /api/ref ghi nhan luot bam',
    refHit.status === 200 && refHit.data.valid === true && refHit.data.counted === true, refHit.data);
  const refHit2 = await call('POST', '/api/ref', { code: refCode });
  check('cung phien bam lai -> khong dem trung', refHit2.data?.counted === false, refHit2.data);
  const badRef = await call('POST', '/api/ref', { code: 'KHONGCOTHAT9' });
  check('ma gioi thieu khong ton tai -> valid=false', badRef.data?.valid === false);

  // Link gioi thieu go sai duong dan. Mot link kieu /join?ref=MA (duong dan cua
  // ban ung dung cu) truoc day roi vao SPA va hien trang 404 cua khu vuc thanh
  // vien: nguoi duoc moi bo di, nguoi gioi thieu mat luot, khong ai bao loi.
  const diThang = (path) => fetch(BASE + path, { redirect: 'manual' });

  const laiVe = await diThang(`/join?ref=${refCode}`);
  check('/join?ref= -> keo ve trang ban hang',
    laiVe.status === 302 && laiVe.headers.get('location') === `${BASE}/?ref=${refCode}`,
    laiVe.headers.get('location'));

  const giuUtm = await diThang(`/join?ref=${refCode}&utm_source=zalo&fbclid=abc`);
  const dich = new URL(giuUtm.headers.get('location') || BASE);
  check('keo ve nhung khong lam rung utm/fbclid',
    dich.searchParams.get('utm_source') === 'zalo' && dich.searchParams.get('fbclid') === 'abc',
    giuUtm.headers.get('location'));

  const trangThat = await diThang(`/?ref=${refCode}`);
  check('trang ban hang that -> khong chuyen huong', trangThat.status === 200, trangThat.status);

  const khongCoRef = await diThang('/join');
  check('duong dan la nhung khong co ?ref= -> de nguyen cho SPA',
    khongCoRef.status !== 302, khongCoRef.status);

  const maRac = await diThang('/join?ref=%3Cscript%3E');
  check('ma gioi thieu rac -> khong chuyen huong', maRac.status !== 302, maRac.status);

  const refLead = await call('POST', '/api/leads', {
    full_name: 'Người Được Giới Thiệu',
    email: `ref${Date.now()}@smoketest.local`,
    phone: uniquePhone(),
    answers: ANSWERS,
    answers_schema: 'html',
  });
  check('lead qua link duoc ghi nhan nguoi gioi thieu', refLead.status === 201 && refLead.data.ok, refLead.data);

  const refOrder = await call('POST', '/api/orders', {});
  const refCodeOrder = refOrder.data?.order?.code;
  check('lead duoc gioi thieu tao duoc don', refOrder.status === 201 && !!refCodeOrder, refOrder.data);

  const refPaid = await call('POST', '/api/webhooks/bank', {
    id: 'tx-ref-' + Date.now(), transferType: 'in', transferAmount: PRODUCT_PRICE,
    accountNumber: SO_TK_NHAN,
    // Gui DUNG hinh dang ngan hang that gui ve: co tien to cua nha cung cap o
    // dau. Neu extractCode chi tim ma don o dau chuoi thi dong nay bat duoc.
    content: `CT DEN:384T269099R1S6VK ${(process.env.BANK_MEMO_PREFIX || '').toUpperCase()} ${refCodeOrder} NGUOI DUOC GIOI THIEU`,
  }, { Authorization: `Apikey ${HOOK}` });
  check('don cua nguoi duoc gioi thieu -> paid', refPaid.data?.results?.[0]?.status === 'paid', refPaid.data);

  cookieJar = buyerJar; // quay lai phien cua affiliate
  const afterSale = await call('GET', '/api/affiliate/me');
  check('affiliate thay 1 luot bam + 1 nguoi dang ky',
    afterSale.data?.stats?.clicks >= 1 && afterSale.data?.stats?.referrals >= 1, afterSale.data?.stats);
  check('hoa hong 20% cua gia ve VIP hien tai',
    afterSale.data?.stats?.commission_total === Math.round(PRODUCT_PRICE * 0.2), afterSale.data?.stats);
  check('hoa hong dang o trang thai cho tra',
    afterSale.data?.stats?.commission_pending === Math.round(PRODUCT_PRICE * 0.2), afterSale.data?.stats);

  const portalByToken = await call('GET', `/api/affiliate/${leadPortal.data.links.portal_url.split('token=')[1]}`);
  check('mo trang thong ke bang token', portalByToken.status === 200 && portalByToken.data.ok);

  console.log('\n6b. Moc mo khoa & bang xep hang');
  const affToken = leadPortal.data.links.portal_url.split('token=')[1];

  check('1 luot -> tien do 1/2, chua mo khoa',
    afterSale.data?.progress?.valid_referrals === 1
    && afterSale.data?.progress?.next_target === 2
    && afterSale.data?.affiliate?.level === 1, afterSale.data?.progress);
  check('co cau chu chia se soan san',
    !!afterSale.data?.share?.messages?.zalo?.includes(refCode), Object.keys(afterSale.data?.share?.messages || {}));

  // Nguoi thu 2 dang ky qua link -> cham moc 2 nguoi
  cookieJar = {};
  await call('POST', '/api/ref', { code: refCode });
  const refLead2 = await call('POST', '/api/leads', {
    full_name: 'Người Thứ Hai',
    email: `ref2${Date.now()}@smoketest.local`,
    phone: uniquePhone(),
    answers: ANSWERS,
    answers_schema: 'html',
  });
  check('nguoi thu 2 dang ky qua link', refLead2.status === 201, refLead2.data);

  // Lead cu dang ky lai qua link nguoi khac -> khong cong them luot
  const dupViaRef = await call('POST', '/api/leads', {
    full_name: 'Người Thứ Hai',
    email: `ref2b${Date.now()}@smoketest.local`,
    phone: refLead2.data.lead.phone,
    answers: ANSWERS,
    answers_schema: 'html',
  });
  check('dang ky lai qua link -> khong cong luot moi', dupViaRef.data?.created === false, dupViaRef.data);

  cookieJar = buyerJar;
  const unlocked = await call('GET', '/api/affiliate/me');
  check('du 2 nguoi -> mo khoa bac 2',
    unlocked.data?.affiliate?.level === 2 && !!unlocked.data?.affiliate?.unlocked_at,
    unlocked.data?.affiliate);
  check('moc 2 nguoi hien la da mo',
    unlocked.data?.tiers?.[0]?.unlocked === true && unlocked.data.tiers[0].target === 2,
    unlocked.data?.tiers?.[0]);
  check('moc ke tiep la 5 nguoi',
    unlocked.data?.next_tier?.target === 5, unlocked.data?.next_tier);

  const board = await call('GET', '/api/leaderboard');
  check('GET /api/leaderboard co nguoi dan dau',
    board.status === 200 && board.data.items.length >= 1 && board.data.items[0].position === 1,
    board.data?.items);
  check('bang xep hang xep giam dan',
    board.data.items.every((row, i, arr) => i === 0 || arr[i - 1].referrals >= row.referrals));
  check('nguoi xem thay vi tri cua chinh minh', board.data?.me?.position >= 1, board.data?.me);

  // An khoi bang xep hang: phai an CA TEN LAN MA GIOI THIEU.
  //
  // Ban cu chi che ten (maskName -> "Nguyen V. A.") nhung van tra `code`. Ma
  // ma gioi thieu sinh TU CHINH TEN (newCode: 6 chu cuoi cua ten + 3 ky tu),
  // vi du "THANHK7D" - nen che ten xong van doc nguoc ra duoc nguoi do, va
  // viec "an" tro thanh mot loi hua khong giu.
  const hide = await call('POST', `/api/affiliate/${affToken}/settings`, { hide_from_leaderboard: true });
  check('bat che ten tren bang xep hang', hide.data?.hide_from_leaderboard === true, hide.data);

  const boardHidden = await call('GET', '/api/leaderboard');
  check('an roi thi bang xep hang KHONG con tra ma gioi thieu',
    !boardHidden.data.items.some((r) => r.code === refCode),
    boardHidden.data?.items?.map((r) => r.code));

  const dongAn = boardHidden.data.items.find((r) => r.code === null);
  check('ten bi che tren bang xep hang', !!dongAn && dongAn.name.includes('.'), dongAn);

  // Nguoi an VAN phai biet vi tri cua chinh minh - an la an voi nguoi khac,
  // khong phai tu mu.
  const rankKhiAn = await call('GET', '/api/affiliate/me');
  check('nguoi an van thay dung hang cua minh',
    Number(rankKhiAn.data?.rank?.position) >= 1, rankKhiAn.data?.rank);

  await call('POST', `/api/affiliate/${affToken}/settings`, { hide_from_leaderboard: false });

  console.log('\n7. Admin');
  const noToken = await call('GET', '/api/admin/stats');
  check('khong co token -> 401', noToken.status === 401);

  const badLogin = await call('POST', '/api/admin/login', { username: 'admin', password: 'sai-be-bet' });
  check('dang nhap sai mat khau -> 401', badLogin.status === 401, badLogin.data);

  if (SMOKE_PASSWORD) {
    const okLogin = await call('POST', '/api/admin/login',
      { username: process.env.ADMIN_USER || 'admin', password: SMOKE_PASSWORD });
    check('dang nhap dung tai khoan', okLogin.status === 200 && okLogin.data.ok, okLogin.data);
    const viaSession = await call('GET', '/api/admin/stats');
    check('goi API bang cookie phien', viaSession.status === 200 && viaSession.data.ok);
    await call('POST', '/api/admin/logout');
    const afterLogout = await call('GET', '/api/admin/stats');
    check('dang xuat -> khong vao duoc nua', afterLogout.status === 401);
    // Dang nhap lai: cac buoc kiem tra ben duoi dung phien nay
    await call('POST', '/api/admin/login',
      { username: process.env.ADMIN_USER || 'admin', password: SMOKE_PASSWORD });
  }
  const stats = await call('GET', '/api/admin/stats', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/stats', stats.status === 200 && stats.data.funnel.leads >= 1, stats.data?.funnel);
  const leads = await call('GET', '/api/admin/leads?limit=5', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/leads', leads.status === 200 && Array.isArray(leads.data.items));
  const orders = await call('GET', '/api/admin/orders?status=paid', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/orders?status=paid', orders.data?.items?.some((o) => o.code === code), orders.data?.total);

  const affList = await call('GET', '/api/admin/affiliates', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/affiliates', affList.status === 200 && affList.data.items.length >= 1, affList.data?.total);
  const comms = await call('GET', '/api/admin/commissions', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/commissions', comms.status === 200 && comms.data.items.length >= 1);

  const commId = comms.data?.items?.[0]?.id;
  const payComm = await call('POST', `/api/admin/commissions/${commId}/paid`, {},
    { 'X-Admin-Token': ADMIN });
  check('danh dau da tra hoa hong', payComm.data?.commission?.status === 'paid', payComm.data);

  const rateChange = await call('POST', `/api/admin/affiliates/${refCode}`, { rate: 30 },
    { 'X-Admin-Token': ADMIN });
  check('doi ti le hoa hong -> 30%', rateChange.data?.affiliate?.rate_text === '30%', rateChange.data);

  const pending = await call('GET', '/api/admin/referrals/pending', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/referrals/pending', pending.status === 200 && Array.isArray(pending.data.items));

  const voided = await call('POST', `/api/admin/referrals/${refLead2.data.lead.id}/void`,
    { reason: 'kiem tra' }, { 'X-Admin-Token': ADMIN });
  check('admin huy 1 luot gioi thieu', voided.status === 200 && voided.data.ok, voided.data);
  check('huy luot -> tut ve bac 1', voided.data?.level?.level === 1, voided.data?.level);

  const restored = await call('POST', `/api/admin/referrals/${refLead2.data.lead.id}/valid`, {},
    { 'X-Admin-Token': ADMIN });
  check('khoi phuc luot -> mo khoa lai bac 2', restored.data?.level?.level === 2, restored.data?.level);

  const adminBoard = await call('GET', '/api/admin/leaderboard', undefined, { 'X-Admin-Token': ADMIN });
  check('GET /api/admin/leaderboard', adminBoard.status === 200 && adminBoard.data.items.length >= 1);

  const csv = await fetch(`${BASE}/api/admin/export/leads.csv`, {
    headers: { Cookie: cookieHeader(), 'X-Admin-Token': ADMIN },
  });
  const csvText = await csv.text();
  check('xuat leads.csv', csv.status === 200 && csvText.includes('full_name'), csv.status);

  const csvNoAuth = await fetch(`${BASE}/api/admin/export/leads.csv?token=${encodeURIComponent(ADMIN)}`);
  check('khong the xuat CSV bang ?token= tren URL', csvNoAuth.status === 401, csvNoAuth.status);


  // Bam link nhung POST /api/ref KHONG kip chay xong (nguoi ta bam tiep sang
  // trang dang ky ngay) -> khong co cookie ref. Truoc day la mat luot trong im
  // lang, du ma hoan toan hop le: chi co cookie moi noi click voi luc dang ky.
  // Bay gio con doc lai duoc ma tu dia chi trang ma phien nay dap vao.
  const jarQuaLink = cookieJar;

  cookieJar = buyerJar;
  const truocKhiMat = (await call('GET', '/api/affiliate/me')).data?.stats?.referrals ?? 0;

  cookieJar = {}; // phien moi tinh, KHONG goi /api/ref -> khong co cookie ref
  await call('POST', '/api/track', {
    type: 'page_view',
    page: 'landing',
    attribution: { landing_url: `${BASE}/?ref=${refCode}&utm_source=zalo` },
  });
  const leadKhongCookie = await call('POST', '/api/leads', {
    full_name: 'Khong Co Cookie',
    email: `nocookie${Date.now()}@smoketest.local`,
    phone: uniquePhone(),
    answers: ANSWERS,
    answers_schema: 'html',
  });
  check('van dang ky duoc khi khong co cookie ref',
    leadKhongCookie.status === 201 && !!leadKhongCookie.data?.ok, leadKhongCookie.data);

  cookieJar = buyerJar;
  const sauKhiMat = (await call('GET', '/api/affiliate/me')).data?.stats?.referrals ?? 0;
  check('mat cookie ref -> van doc duoc ma tu dia chi trang dap vao',
    sauKhiMat === truocKhiMat + 1, { truoc: truocKhiMat, sau: sauKhiMat });

  cookieJar = jarQuaLink;

  // ---------------------------------------------------------------------------
  // 7b. DUNG CON DUONG MA TRANG THAT DI: POST /api/register
  //
  // VI SAO PHAI CO KHOI NAY RIENG, DU O TREN DA TEST HOA HONG XANH:
  //
  // Moi bai o tren goi THANG /api/leads. Nhung form tren trang ban hang that
  // khong goi duong do - no goi /api/register (apps/funnel-gc/partials/
  // dang-ky.js:104), roi dangKyTuongThich moi goi createLead ben trong.
  //
  // Va da co luc bo dung apps/funnel-gc KHONG he goi /api/ref lan /api/track.
  // Nen ca day chuyen dut ngay mat dau tien: khong cookie gioi thieu, khong
  // landing_url trong sessions, refCodeFromRequest va refCodeFromSession deu
  // tra chuoi rong, creditReferral khong bao gio chay, bang commissions khong
  // bao gio co dong nao. Dai ly chia se link, ban ho mua that, cong dai ly
  // hien 0 luot / 0 nguoi / 0d - khong mot loi nao.
  //
  // Toan bo 91 bai smoke van XANH suot thoi gian do, vi chung di mot con duong
  // khong trang nao di. Khoi nay dong cai khe hop giua test va trang that.
  // ---------------------------------------------------------------------------
  // DAT O CUOI, SAU MOI BAI PHU THUOC SO DEM.
  // Khoi nay them mot luot gioi thieu that cho cung mot dai ly, nen dat no
  // o giua muc 6 la lam lech con so ma hai bai sau do trong vao
  // ("huy luot -> tut ve bac 1", "mat cookie ref"). Hai bai do do chinh
  // toi lam do o lan chay dau - khong phai san pham hong.
  const jarTruocRegister = cookieJar;

  // Do TUONG DOI, khong do con so tuyet doi: den luc nay cac bai truoc da huy
  // roi khoi phuc luot gioi thieu, nen so goc khong doan truoc duoc. Thu can
  // chung minh la "mot don di qua /api/register co sinh them hoa hong khong",
  // chu khong phai tong bang bao nhieu.
  const truocKhiDangKy = (await call('GET', '/api/affiliate/me')).data?.stats?.commission_total || 0;

  cookieJar = {};                       // mot "trinh duyet" hoan toan moi

  const bamLink = await call('POST', '/api/ref', {
    code: refCode,
    landing_url: `${BASE}/?ref=${refCode}`,
    referrer: 'https://www.facebook.com/',
    attribution: { landing_url: `${BASE}/?ref=${refCode}`, utm_source: 'facebook' },
  });
  check('bam link gioi thieu -> ma hop le', bamLink.status === 200 && bamLink.data?.valid === true, bamLink.data);

  const dkPhone = uniquePhone();
  const dangKy = await call('POST', '/api/register', {
    name: 'Khach Qua Trang That',
    email: `reg${Date.now()}@smoketest.local`,
    phone: dkPhone,
    field: 'Thiet ke noi that',
    note: 'vao tu link gioi thieu',
  });
  check('form tren trang that (POST /api/register) tao duoc don',
    dangKy.status === 200 && !!dangKy.data?.order?.code, dangKy.data);

  const maDonRegister = dangKy.data?.order?.code;
  if (maDonRegister) {
    const traTien = await call('POST', '/api/webhooks/bank', {
      id: 'tx-reg-' + Date.now(), transferType: 'in', transferAmount: PRODUCT_PRICE,
      accountNumber: SO_TK_NHAN,
      content: `${(process.env.BANK_MEMO_PREFIX || '').toUpperCase()} ${maDonRegister} KHACH QUA TRANG THAT`,
    }, { Authorization: `Apikey ${HOOK}` });
    check('don do -> paid', traTien.data?.results?.[0]?.status === 'paid', traTien.data);

    // DAY LA BAI QUAN TRONG NHAT CUA CA KHOI: hoa hong phai TANG THEM.
    cookieJar = jarTruocRegister;
    const sauCung = await call('GET', '/api/affiliate/me');
    const tang = (sauCung.data?.stats?.commission_total || 0) - truocKhiDangKy;

    // DO CAI GI, VA VI SAO KHONG DO HOA HONG TRUC TIEP
    //
    // Thu tung DUT la buoc GAN NGUOI GIOI THIEU. Con tu mot luot da gan hop le
    // ra dong hoa hong 20% thi muc 6 o tren da do roi.
    //
    // Khong the doi hoa hong tang o day, va do la he thong lam DUNG: luat
    // chong gian lan `maxPerIp` (mac dinh 3, worker/src/config.js:114) danh dau
    // luot thu tu tu CUNG mot IP la cho duyet tay. Ca bo test di ra tu 127.0.0.1
    // nen no cham tran - o ngoai doi thi ba nguoi khac nhau khong dung chung IP.
    //
    // Nen do bang hang cho duyet: luot nam trong do la BANG CHUNG da gan dung
    // nguoi gioi thieu. Va neu chua cham tran thi hoa hong phai tang - bat ca
    // hai nhanh, khong nhanh nao duoc im lang truot qua.
    const choDuyet = await call('GET', '/api/admin/referrals/pending', undefined,
      { 'X-Admin-Token': ADMIN });
    const cuaToi = (choDuyet.data?.items || []).some((r) => r.affiliate_code === refCode);

    check('don qua /api/register duoc GAN cho dung nguoi gioi thieu',
      tang === Math.round(PRODUCT_PRICE * 0.2) || cuaToi,
      { tang, trong_hang_cho_duyet: cuaToi, so_luot_cho: (choDuyet.data?.items || []).length });
  }

  cookieJar = jarTruocRegister;

  // ---------------------------------------------- hoa hong da huy thi bien mat
  //
  // `voidCommission` sinh ra de dap mot khoan nghi gian lan. Nhung o "Dang cho
  // chi tra" cua dai ly (Affiliate.jsx:95) doc tu mot cau SUM(status <> 'paid')
  // - va `void` khong phai `paid`, nen khoan vua bi huy van nam nguyen trong
  // do. Nguoi bi huy doc con so ay la tien sap nhan ve.
  //
  // Bai nay do THEO HIEU SO chu khong theo con so tuyet doi: cac bai truoc da
  // huy/khoi phuc luot va da danh dau mot khoan la da tra, nen so goc khong
  // doan truoc duoc.
  {
    // Can mot khoan DANG CHO. Don o khoi 7b co the da bi maxPerIp danh dau cho
    // duyet tay (xem chu thich dai o tren) - neu the thi cong nhan no, va chinh
    // buoc cong nhan ay se sinh hoa hong qua buHoaHong.
    const dsCho = await call('GET', '/api/admin/referrals/pending', undefined,
      { 'X-Admin-Token': ADMIN });
    const cuaMinh = (dsCho.data?.items || []).find((r) => r.affiliate_code === refCode);
    if (cuaMinh) {
      await call('POST', `/api/admin/referrals/${cuaMinh.id}/valid`, {},
        { 'X-Admin-Token': ADMIN });
    }

    const dsHoaHong = await call('GET', '/api/admin/commissions?status=pending', undefined,
      { 'X-Admin-Token': ADMIN });
    const khoan = (dsHoaHong.data?.items || []).find((c) => c.affiliate_code === refCode);
    check('co mot khoan hoa hong dang cho de thu huy', !!khoan,
      { so_khoan_cho: (dsHoaHong.data?.items || []).length });

    if (khoan) {
      cookieJar = jarTruocRegister;
      const truoc = (await call('GET', '/api/affiliate/me')).data?.stats || {};

      const huy = await call('POST', `/api/admin/commissions/${khoan.id}/void`,
        { reason: 'thu bai test' }, { 'X-Admin-Token': ADMIN });
      check('admin huy duoc khoan hoa hong dang cho',
        huy.status === 200 && huy.data?.commission?.status === 'void', huy.data);

      const sau = (await call('GET', '/api/affiliate/me')).data?.stats || {};
      check('huy hoa hong -> tut khoi o "dang cho chi tra"',
        (truoc.commission_pending || 0) - (sau.commission_pending || 0) === khoan.amount,
        { truoc: truoc.commission_pending, sau: sau.commission_pending, khoan: khoan.amount });
      check('huy hoa hong -> tut khoi ca tong da kiem duoc',
        (truoc.commission_total || 0) - (sau.commission_total || 0) === khoan.amount,
        { truoc: truoc.commission_total, sau: sau.commission_total, khoan: khoan.amount });
      check('khoan da huy van tra duoc rieng ra de doi soat',
        sau.commission_void >= khoan.amount, sau.commission_void);
    }
  }

  cookieJar = jarTruocRegister;

  const orderPublic = await call('GET', `/api/orders/${code}`);
  check('API cong khai khong lo ten/sdt/email khach',
    orderPublic.status === 200 && !JSON.stringify(orderPublic.data).match(/customer_phone|"phone"|"email"/),
    Object.keys(orderPublic.data.order || {}));

  // Don sach ban ghi do bo test tao ra (email @smoketest.local) - dat CLEANUP=0 de giu lai
  if (process.env.CLEANUP !== '0') {
    const purge = await call('POST', '/api/admin/purge-test-data', {}, { 'X-Admin-Token': ADMIN });
    check('don sach du lieu test khoi database', purge.status === 200 && purge.data.ok, purge.data);
  }

  console.log(`\nKet qua: ${passed} dat, ${failed} loi`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Loi khi chay test:', err);
  process.exit(1);
});
