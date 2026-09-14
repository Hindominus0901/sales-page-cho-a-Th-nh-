/**
 * Di tron mot vong soan noi dung VIP tren D1 O MAY - dung nhung loi goi API ma
 * trang /admin/vip goi, khong phai mot duong tat rieng cua bai kiem thu.
 *
 *   node --env-file=.env scripts/thu-khu-vuc-vip.mjs
 *
 * CAU HOI CAN TRA LOI DUT KHOAT: sau khi chi Thanh tao mot khoa VIP va them bai
 * giang ngay trong tab VIP, thi
 *   - nguoi DA mua VIP co xem duoc ma video khong
 *   - nguoi CHUA mua co bi che ma video khong
 *   - xoa mot khoa VIP xong, goi VIP co con tro toi khoa da bi xoa khong
 *
 * Ve thu ba la cho hong ngam nhat: no khong bao loi gi ca, chi lang le thieu
 * mot khoa trong danh sach cua nguoi da tra tien.
 *
 * CHI CHAY O MAY. Tu don du lieu sau khi chay, ke ca khi giua chung co bai do.
 */
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8787';
const MK = 'matkhau-rat-manh-123';
const DAU = `vip-${Date.now()}`;
const SKU = DAU.toUpperCase();

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

/** Doc lai grants_json cua goi, giong het cach trang admin doc. */
const idKhoaTrongGoi = (spg) => {
  let v = spg;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return (Array.isArray(v) ? v : []).filter((g) => g?.kind === 'course' && g?.ref).map((g) => g.ref);
};

// May chu tra ve mot MANG bai giang khi moi thu binh thuong. Neu no tra ve mot
// object thi do la loi (401, 429...) - noi thang ra thay vi de `.find` no vo,
// vi luc do thong bao loi chang lien quan gi toi cai dang hong.
const dsBai = (kq) => {
  if (Array.isArray(kq.data)) return kq.data;
  throw new Error(`may chu khong tra ve danh sach bai giang (HTTP ${kq.status}): ${JSON.stringify(kq.data).slice(0, 200)}`);
};

const locBai = (cid) => `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: cid }))}`;

function donDep(idKhoa) {
  const ids = `(SELECT id FROM users WHERE email LIKE '${DAU}-%')`;
  for (const t of ['entitlements', 'lesson_progress', 'auth_sessions', 'credentials',
    'oauth_accounts', 'password_resets', 'notifications']) {
    try { sql(`DELETE FROM ${t} WHERE user_id IN ${ids}`); } catch { /* bo qua */ }
  }
  for (const c of [
    `DELETE FROM users WHERE email LIKE '${DAU}-%'`,
    `DELETE FROM leads WHERE email LIKE '${DAU}-%'`,
    idKhoa ? `DELETE FROM lessons WHERE course_id = '${idKhoa}'` : null,
    idKhoa ? `DELETE FROM courses WHERE id = '${idKhoa}'` : null,
    `DELETE FROM products WHERE sku = '${SKU}'`,
  ].filter(Boolean)) { try { sql(c); } catch { /* bo qua */ } }
}

let idKhoa = null;
(async () => {
  console.log(`\nThu soan noi dung khu vuc VIP tren ${BASE}\n`);
  try {
    const admin = await taoNguoi('admin', 'admin');
    const daMua = await taoNguoi('damua');
    const chuaMua = await taoNguoi('chuamua');

    // Goi VIP rong - dung tinh trang chi Thanh dang co truoc khi soan noi dung.
    sql(`INSERT INTO products (id,sku,name,kind,price,currency,grants_json,is_active,description,sort_order,created_date,updated_date)
         VALUES ('${DAU}-sp','${SKU}','Goi VIP kiem thu','package',399000,'VND','[]',1,'',99,datetime('now'),datetime('now'))`);

    // ------------------------------------------- 1. tao khoa VIP ngay tai tab VIP
    // Dung API ma trang goi: Course.create voi requires_unlock = true.
    const taoKhoa = await admin.goi('POST', '/api/entities/Course', {
      name: 'Khoa VIP soan tai tab VIP', description: '', thumbnail_url: '',
      min_level: 0, sort_order: 0, requires_unlock: true, is_active: true,
    });
    idKhoa = taoKhoa.data?.id;
    check('tao duoc khoa hoc tu tab VIP', taoKhoa.status < 300 && !!idKhoa, taoKhoa.data);
    check('khoa moi tu dong bi khoa lai (requires_unlock)',
      !!taoKhoa.data?.requires_unlock, taoKhoa.data?.requires_unlock);

    // Buoc thu hai cua cung mot thao tac: gan vao grants_json cua goi VIP.
    const gan = await admin.goi('PUT', `/api/entities/Product/${DAU}-sp`, {
      grants_json: [{ kind: 'course', ref: idKhoa }],
    });
    check('khoa moi duoc gan vao goi VIP', gan.status < 300
      && idKhoaTrongGoi(gan.data?.grants_json).includes(idKhoa), gan.data?.grants_json);

    // ------------------------------------------------------- 2. them bai giang
    const bai = await admin.goi('POST', '/api/entities/Lesson', {
      course_id: idKhoa, title: 'Bai VIP 1', guide: 'Huong dan',
      video_provider: 'youtube', video_id: 'MAVIDEOBIMAT', duration: '10:00',
      assignment_url: '', doc_url: '', xp: 10, coin: 5, sort_order: 1,
    });
    check('them duoc bai giang ngay trong tab VIP', bai.status < 300 && !!bai.data?.id, bai.data);

    const cuaThanhVien = await chuaMua.goi('POST', '/api/entities/Lesson', {
      course_id: idKhoa, title: 'Bai chen lau',
    });
    check('thanh vien thuong KHONG them duoc bai giang', cuaThanhVien.status >= 400, cuaThanhVien.status);

    // --------------------------------------------- 3. hai phia cua cai cong
    // Cap quyen GOI thoi, KHONG cap quyen khoa - dung tinh trang cua 44 nguoi
    // da mua ve VIP khi `grants_json` con rong. Neu cong chi nhin quyen `course`
    // thi bai duoi se do, va do chinh la loi that ho gap.
    sql(`INSERT INTO entitlements (id,user_id,kind,ref,source,product_sku,granted_at,created_date,updated_date)
         VALUES ('${DAU}-ent','${daMua.id}','package','${SKU}','test','${SKU}',datetime('now'),datetime('now'),datetime('now'))`);

    const xemDuoc = await daMua.goi('GET', locBai(idKhoa));
    const baiCuaNguoiMua = dsBai(xemDuoc).find((l) => l.title === 'Bai VIP 1');
    check('NGUOI CHI CO QUYEN GOI: van xem duoc ma video',
      baiCuaNguoiMua?.video_id === 'MAVIDEOBIMAT', baiCuaNguoiMua?.video_id);

    const biChe = await chuaMua.goi('GET', locBai(idKhoa));
    const baiCuaNguoiChua = dsBai(biChe).find((l) => l.title === 'Bai VIP 1');
    check('NGUOI CHUA MUA: van thay ten bai (lam muc luc)', !!baiCuaNguoiChua, biChe.data);
    check('NGUOI CHUA MUA: KHONG lay duoc ma video',
      !baiCuaNguoiChua?.video_id, baiCuaNguoiChua?.video_id);

    // ------------------------------------------------- 4. xoa khoa khoi VIP
    // Trang admin go khoi grants_json TRUOC roi moi xoa khoa. Neu lam nguoc lai
    // thi buoc go se di sua mot khoa vua bi xoa.
    const go = await admin.goi('PUT', `/api/entities/Product/${DAU}-sp`, { grants_json: [] });
    check('go duoc khoa khoi goi VIP', go.status < 300
      && idKhoaTrongGoi(go.data?.grants_json).length === 0, go.data?.grants_json);

    const xoa = await admin.goi('DELETE', `/api/entities/Course/${idKhoa}`);
    check('xoa duoc khoa VIP', xoa.status < 300, xoa.status);

    const conLai = sql(`SELECT grants_json FROM products WHERE sku='${SKU}'`);
    check('KHONG con tro toi khoa da bi xoa',
      idKhoaTrongGoi(conLai[0]?.grants_json).length === 0, conLai[0]?.grants_json);
  } finally {
    donDep(idKhoa);
    console.log('\n  (da don du lieu thu)');
  }

  console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
  process.exit(loi ? 1 : 0);
})();
