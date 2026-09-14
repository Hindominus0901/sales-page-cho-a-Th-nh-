/**
 * Ra soat an toan tren mot ban dang chay - CHI DOC, khong ghi gi.
 *
 *   node --env-file=.env scripts/ra-soat-an-toan.mjs [baseUrl] [appUrl]
 *
 * Khac voi tests/: bo nay chay duoc voi BAN THAT vi no khong tao, khong sua,
 * khong xoa mot dong du lieu nao. No chi go cua nhung noi dang le phai dong va
 * xem cua co dong that khong.
 *
 * Moi bai deu viet theo dang "mong doi bi tu choi". Mot bai XANH nghia la he
 * thong da tu choi dung; bai DO nghia la co mot cua dang mo.
 */
import fs from 'node:fs';

// Ten mien lay tu brand/brand.json - viet cung o day la mot ngay nao do ra soat
// nham sang site cua khach khac ma khong ai nhan ra.
const BRAND = JSON.parse(fs.readFileSync(new URL('../brand/brand.json', import.meta.url), 'utf8'));
const BASE = (process.argv[2] || `https://${BRAND.domains.funnelHost}`).replace(/\/$/, '');
const APP = (process.argv[3] || `https://${BRAND.domains.appHost}`).replace(/\/$/, '');

let dat = 0;
let loi = 0;
const check = (ten, ok, chiTiet) => {
  if (ok) { dat += 1; console.log(`  OK   ${ten}`); } else {
    loi += 1;
    console.log(`  LOI  ${ten}${chiTiet !== undefined ? ` -> ${JSON.stringify(chiTiet).slice(0, 220)}` : ''}`);
  }
};

async function goi(url, opts = {}) {
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const text = await res.text().catch(() => '');
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  return { status: res.status, headers: res.headers, data };
}

(async () => {
  console.log(`\nRa soat an toan\n  ban ban hang: ${BASE}\n  khu thanh vien: ${APP}\n`);

  // ------------------------------------------------------- 1. cua phai dong
  console.log('1. Cua phai dong voi nguoi la');
  for (const [ten, duong] of [
    ['ho so nguoi dung', '/api/auth/me'],
    ['danh sach hoc vien', '/api/entities/User?limit=5'],
    ['bai nop thu thach', '/api/entities/ChallengeSubmission?limit=5'],
    ['thong bao ca nhan', '/api/entities/Notification?limit=5'],
    ['nhat ky quan tri', '/api/entities/AdminLog?limit=5'],
  ]) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${APP}${duong}`);
    check(`${ten}: chua dang nhap -> 401/403`, r.status === 401 || r.status === 403, r.status);
    /* eslint-enable no-await-in-loop */
  }

  console.log('\n2. Cua quan tri');
  for (const [ten, duong] of [
    ['thong ke', '/api/admin/stats'],
    ['danh sach lead', '/api/admin/leads'],
    ['danh sach don', '/api/admin/orders'],
    ['xuat danh sach hoc vien', '/api/admin/export/members.csv'],
    ['gui lai thu moi', '/api/admin/resend-invites'],
  ]) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${APP}${duong}`, { method: duong.includes('resend') ? 'POST' : 'GET' });
    check(`${ten}: khong co quyen -> 401/403`, r.status === 401 || r.status === 403, r.status);
    /* eslint-enable no-await-in-loop */
  }

  console.log('\n3. Ham nghiep vu (tu cong diem, tu mo khoa)');
  for (const ham of ['joinChallenge', 'submitChallengeDay', 'redeemReward', 'diemDanh',
    'chiaNhomNgauNhien', 'sendNotification', 'guiLaiThuMoiHangLoat']) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${APP}/api/functions/${ham}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    check(`${ham}: chua dang nhap -> 401/403`, r.status === 401 || r.status === 403, r.status);
    /* eslint-enable no-await-in-loop */
  }

  // --------------------------------------------------- 4. webhook ngan hang
  console.log('\n4. Webhook ngan hang');
  const hookKhongKhoa = await goi(`${BASE}/api/webhooks/bank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Doi-Soat': '1' },
    body: JSON.stringify({ id: 'ra-soat', transferType: 'in', transferAmount: 399000, content: 'VIPZZZZZZ' }),
  });
  check('khong co khoa -> 401', hookKhongKhoa.status === 401, hookKhongKhoa.status);

  // X-Doi-Soat: bao cho webhook biet day la cong cu kiem tra, dung ghi dau chan.
  // Khong co header nay thi trang Doanh thu hien mot dai do "co cuoc goi bi tu
  // choi vi sai khoa" - va nguoi doc tuong SePay dang hong, trong khi that ra
  // do la chinh bai kiem tra nay vua chay.
  const hookSaiKhoa = await goi(`${BASE}/api/webhooks/bank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Apikey sai-hoan-toan',
      'X-Doi-Soat': '1',
    },
    body: JSON.stringify({ id: 'ra-soat', transferType: 'in', transferAmount: 399000, content: 'VIPZZZZZZ' }),
  });
  check('sai khoa -> 401', hookSaiKhoa.status === 401, hookSaiKhoa.status);

  // ------------------------------------------------------ 5. chuyen huong la
  console.log('\n5. Chuyen huong ra ngoai');
  for (const doc of ['https://vi-du-lua-dao.example', '//vi-du-lua-dao.example',
    'https:/\\vi-du-lua-dao.example', '/\\vi-du-lua-dao.example']) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${APP}/login?next=${encodeURIComponent(doc)}`);
    const toi = r.headers.get('location') || '';
    check(`next=${doc.slice(0, 28)} khong day ra ngoai`,
      !/vi-du-lua-dao/.test(toi), toi || r.status);
    /* eslint-enable no-await-in-loop */
  }

  // --------------------------------------------------------- 6. mu bao hiem
  console.log('\n6. Mu bao hiem HTTP');
  const trang = await goi(`${BASE}/`);
  const h = trang.headers;
  check('co Content-Security-Policy', !!h.get('content-security-policy'));
  check('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff', h.get('x-content-type-options'));
  check('co X-Frame-Options hoac frame-ancestors',
    !!h.get('x-frame-options') || /frame-ancestors/.test(h.get('content-security-policy') || ''),
    h.get('x-frame-options'));
  check('co Strict-Transport-Security', !!h.get('strict-transport-security'), h.get('strict-transport-security'));
  check('khong lo may chu qua header Server',
    !/express|nginx\/\d|apache/i.test(h.get('server') || ''), h.get('server'));

  // CORS: mot trang la KHONG duoc doc du lieu bang cookie cua nguoi dung.
  const cors = await goi(`${APP}/api/auth/me`, { headers: { Origin: 'https://vi-du-lua-dao.example' } });
  const acao = cors.headers.get('access-control-allow-origin') || '';
  check('CORS khong mo cho ten mien la', acao !== '*' && !/vi-du-lua-dao/.test(acao), acao || '(khong co)');

  // ------------------------------------------------------------ 7. chen SQL
  console.log('\n7. Chen cau lenh SQL');
  for (const doc of ["' OR '1'='1", "'; DROP TABLE users;--", "1' UNION SELECT null,null--"]) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${APP}/api/entities/User?limit=5&sort=${encodeURIComponent(doc)}`);
    check(`sort=${doc.slice(0, 18)} khong lam lo du lieu`,
      r.status === 401 || r.status === 403 || r.status === 400, r.status);
    /* eslint-enable no-await-in-loop */
  }
  const conSong = await goi(`${BASE}/api/health`);
  check('sau khi chen SQL he thong van song', conSong.status === 200, conSong.status);

  // ------------------------------------------------------- 8. tran du lieu
  console.log('\n8. Tran du lieu gui len');
  const to = await goi(`${BASE}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: 'x'.repeat(2_000_000), phone: '0900000000' }),
  });
  check('goi du lieu qua lon bi tu choi', to.status === 413 || to.status === 400 || to.status === 429, to.status);

  // --------------------------------------------------------- 9. duong doc hai
  console.log('\n9. Duong dan doc hai');
  for (const doc of ['/../../etc/passwd', '/f/../../wrangler.jsonc', '/.env', '/.git/config']) {
    /* eslint-disable no-await-in-loop */
    const r = await goi(`${BASE}${doc}`);
    const lo = typeof r.data === 'string'
      && /RESEND_API_KEY|SESSION_SECRET|database_name|BANK_ACCOUNT=/.test(r.data);
    check(`${doc} khong lo file cau hinh`, !lo, r.status);
    /* eslint-enable no-await-in-loop */
  }

  console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
  process.exit(loi ? 1 : 0);
})();
