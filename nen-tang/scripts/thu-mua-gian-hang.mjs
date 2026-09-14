/**
 * Di tron mot don mua trong gian hang, tren D1 O MAY - de tra loi dut khoat:
 * tra tien xong thi san pham co tu mo khong, va hoa hong co duoc tinh khong.
 *
 *   node --env-file=.env scripts/thu-mua-gian-hang.mjs
 *
 * CHI CHAY O MAY. No tao khoa hoc, san pham, nguoi mua, va ban mot goi tin
 * webhook gia - tro vao ban that la de rac trong don hang cua khach.
 *
 * Tu don dep sau khi chay xong, ke ca khi giua chung co bai do.
 */
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8787';
const MK = 'matkhau-rat-manh-123';
const HOOK = process.env.BANK_WEBHOOK_SECRET || '';
const DAU = `gh-${Date.now()}`;

let dat = 0; let loi = 0;
const check = (ten, ok, ct) => {
  if (ok) { dat += 1; console.log(`  OK   ${ten}`); } else {
    loi += 1;
    console.log(`  LOI  ${ten}${ct !== undefined ? ` -> ${JSON.stringify(ct).slice(0, 260)}` : ''}`);
  }
};

function sql(cau) {
  const mot = String(cau).replace(/\s+/g, ' ').trim();
  let ra = '';
  try {
    ra = execFileSync(process.execPath,
      ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'platform', '--local',
        '--json', '--command', mot],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) { ra = String(err.stdout || ''); }
  const i = ra.indexOf('[');
  if (i < 0) throw new Error(`D1 khong tra ve gi: ${ra.slice(0, 200)}`);
  return JSON.parse(ra.slice(i))[0]?.results || [];
}

function trinhDuyet() {
  const jar = {};
  return {
    jar,
    async goi(method, duong, body) {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (!'GET HEAD'.includes(method) && jar.pf_csrf) headers['X-CSRF-Token'] = jar.pf_csrf;
      const res = await fetch(BASE + duong, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const v = pair.slice(i + 1);
        if (v === '') delete jar[pair.slice(0, i)]; else jar[pair.slice(0, i)] = v;
      }
      const chu = await res.text();
      let data; try { data = JSON.parse(chu); } catch { data = chu; }
      return { status: res.status, data };
    },
  };
}

async function taoNguoi(tag, role = 'member') {
  const email = `${DAU}-${tag}@smoketest.local`;
  const b = trinhDuyet();
  await b.goi('GET', '/api/apps/public/prod/public-settings/by-id/x');
  await b.goi('POST', '/api/auth/register', { email, password: MK });
  sql(`UPDATE users SET email_verified=1, full_name='${tag}', role='${role}' WHERE email='${email}'`);
  await b.goi('POST', '/api/auth/login', { email, password: MK });
  const me = await b.goi('GET', '/api/auth/me');
  b.id = me.data.id; b.email = email;
  return b;
}

function donDep() {
  const ids = `(SELECT id FROM users WHERE email LIKE '${DAU}-%')`;
  for (const t of ['entitlements', 'lesson_progress', 'auth_sessions', 'credentials',
    'oauth_accounts', 'password_resets', 'notifications', 'point_awards',
    'xp_transactions', 'coin_transactions']) {
    try { sql(`DELETE FROM ${t} WHERE user_id IN ${ids}`); } catch { /* bo qua */ }
  }
  try { sql(`DELETE FROM commissions WHERE order_id IN (SELECT id FROM orders WHERE code LIKE '%')
    AND lead_id IN (SELECT id FROM leads WHERE email LIKE '${DAU}-%')`); } catch { /* bo qua */ }
  for (const c of [
    `DELETE FROM bank_txns WHERE external_id LIKE '${DAU}%'`,
    `DELETE FROM orders WHERE customer_email LIKE '${DAU}-%'`,
    `DELETE FROM affiliates WHERE email LIKE '${DAU}-%'`,
    `DELETE FROM events WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '${DAU}-%')`,
    `DELETE FROM users WHERE email LIKE '${DAU}-%'`,
    `DELETE FROM leads WHERE email LIKE '${DAU}-%'`,
    `DELETE FROM lessons WHERE course_id = '${DAU}-khoa'`,
    `DELETE FROM courses WHERE id = '${DAU}-khoa'`,
    `DELETE FROM products WHERE sku = '${DAU.toUpperCase()}'`,
  ]) { try { sql(c); } catch { /* bo qua */ } }
}

(async () => {
  console.log(`\nThu mua trong gian hang tren ${BASE}\n`);
  if (!HOOK) { console.error('Thieu BANK_WEBHOOK_SECRET trong .env'); process.exit(1); }

  try {
    // ---------------------------------------------------------- dung san pham
    const sku = DAU.toUpperCase();
    sql(`INSERT INTO courses (id,name,description,is_active,requires_unlock,min_level,sort_order,created_date,updated_date)
         VALUES ('${DAU}-khoa','Khoa VIP kiem thu','',1,1,0,99,datetime('now'),datetime('now'))`);
    sql(`INSERT INTO lessons (id,course_id,title,video_provider,video_id,xp,coin,sort_order,created_date,updated_date)
         VALUES ('${DAU}-bai','${DAU}-khoa','Bai 1','youtube','abc123',15,5,1,datetime('now'),datetime('now'))`);
    sql(`INSERT INTO products (id,sku,name,kind,price,currency,grants_json,is_active,description,sort_order,created_date,updated_date)
         VALUES ('${DAU}-sp','${sku}','San pham kiem thu','course',199000,'VND','[{"kind":"course","ref":"${DAU}-khoa"}]',1,'',99,datetime('now'),datetime('now'))`);
    check('dung duoc khoa hoc + san pham', sql(`SELECT sku FROM products WHERE sku='${sku}'`).length === 1);

    // ------------------------------------------------------ nguoi mua + gioi thieu
    const mua = await taoNguoi('mua');
    const soGT = `+849${String(Date.now()).slice(-8)}`;
    sql(`INSERT INTO affiliates (code,token,full_name,email,phone,status,commission_rate,unlocked_level,created_at,updated_at)
         VALUES ('GHTEST1','${DAU}-tok','Nguoi Gioi Thieu','${DAU}-gt@smoketest.local','${soGT}','active',0.2,1,datetime('now'),datetime('now'))`);

    // Nguoi mua nay CHUA co lead (dang ky thang trong app) - dung truong hop kho
    // nhat: 55/480 hoc vien that dang o tinh trang nay.
    const truoc = sql(`SELECT legacy_lead_id FROM users WHERE id='${mua.id}'`);
    check('nguoi mua bat dau KHONG co lead', !truoc[0]?.legacy_lead_id, truoc);

    // ------------------------------------------------------------- buoc 1: chuan bi
    const soMua = `09${String(Date.now()).slice(-8)}`;
    const cb = await mua.goi('POST', '/api/functions/chuanBiDatHang', {
      phone: soMua, ref_code: 'GHTEST1',
    });
    check('tao duoc lead cho nguoi chua co', !!cb.data?.lead_id, cb.data);
    check('ghi nhan nguoi gioi thieu', cb.data?.gioi_thieu?.ok === true, cb.data?.gioi_thieu);

    const sau = sql(`SELECT legacy_lead_id FROM users WHERE id='${mua.id}'`);
    check('tai khoan da duoc noi voi lead', Number(sau[0]?.legacy_lead_id) === Number(cb.data.lead_id), sau);

    // ------------------------------------------------------------- buoc 2: tao don
    const don = await mua.goi('POST', '/api/orders', {
      lead_id: cb.data.lead_id, product_sku: sku,
    });
    const ma = don.data?.order?.code;
    check('tao duoc don cho san pham cua gian hang', don.status < 300 && !!ma, don.data);
    check('don lay DUNG gia cua san pham, khong phai gia ve chinh',
      don.data?.order?.amount === 199000, don.data?.order?.amount);
    check('noi dung chuyen khoan co tien to ngan hang',
      /SEVQR/.test(don.data?.order?.transfer?.content || ''), don.data?.order?.transfer?.content);

    // ------------------------------------------------- buoc 3: ngan hang bao tien ve
    const hook = await fetch(`${BASE}/api/webhooks/bank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${HOOK}` },
      body: JSON.stringify({
        id: `${DAU}-tx`, transferType: 'in', transferAmount: 199000,
        accountNumber: process.env.BANK_ACCOUNT || '',
        content: don.data.order.transfer.content,
        gateway: 'NganHangGiaLap', transactionDate: new Date().toISOString(),
      }),
    });
    const kq = await hook.json();
    check('webhook nhan tien -> don paid',
      hook.status === 200 && kq?.results?.[0]?.status === 'paid', kq);

    // rc.waitUntil chay sau khi phan hoi tra ve.
    await new Promise((r) => { setTimeout(r, 1500); });

    // -------------------------------------------------------------- ket qua
    const q = sql(`SELECT kind, ref FROM entitlements WHERE user_id='${mua.id}' ORDER BY kind`);
    check('MO SAN PHAM: co quyen goi theo sku',
      q.some((x) => x.kind === 'package' && x.ref === sku), q);
    check('MO SAN PHAM: co quyen khoa hoc tu grants_json',
      q.some((x) => x.kind === 'course' && x.ref === `${DAU}-khoa`), q);

    const hh = sql(`SELECT c.amount, a.code FROM commissions c JOIN affiliates a ON a.id=c.affiliate_id
                    JOIN orders o ON o.id=c.order_id WHERE o.code='${ma}'`);
    check('TINH HOA HONG: sinh dung mot dong cho nguoi gioi thieu',
      hh.length === 1 && hh[0].code === 'GHTEST1', hh);
    check('TINH HOA HONG: 20% cua 199.000d = 39.800d',
      Number(hh[0]?.amount) === 39800, hh[0]?.amount);

    const thu = sql(`SELECT template,status FROM emails_sent WHERE to_addr='${mua.email}'`);
    check('gui thu bao da nhan tien', thu.some((t) => t.template === 'order_paid'), thu);
  } finally {
    donDep();
    console.log('\n  (da don du lieu thu)');
  }

  console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
  process.exit(loi ? 1 : 0);
})();
