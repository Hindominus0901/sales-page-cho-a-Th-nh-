/**
 * Gui lai thu moi vao lop cho nhung nguoi CHUA BAO GIO nhan duoc.
 *
 *   node --env-file=.env scripts/gui-lai-thu-moi.mjs [--that] [--so 25]
 *
 * VI SAO CAN: mot loat thu dau tien that bai voi ly do "You have reached your
 * daily email sending quota" cua Resend, va khong co gi thu lai. Nhung nguoi do
 * co san tai khoan, co ca link dat mat khau nam trong database, ma khong he
 * biet - vi khong ai bao ho. Trong so ho co ca nguoi DA TRA 399k.
 *
 * DUNG CHUNG mau thu va co che token voi Worker (renderMail + randomToken +
 * sha256Hex) chu khong viet lai: mot ban sao lech nhau la mot ngay nao do thu
 * gui ra mang link chet ma khong ai biet.
 *
 * Dieu kien "chua vao duoc" gom ba ve, thieu ve nao cung sai:
 *   - chua co lan gui invite_app nao thanh cong
 *   - chua tung dat mat khau  (credentials)
 *   - chua tung dang nhap Google (oauth_accounts)
 * Hai ve sau quan trong: ai da vao lop bang duong khac ma nhan them mot link
 * dat mat khau se tuong co ke dang nghich tai khoan minh.
 *
 * KHONG CO --that thi KHONG GUI GI CA, chi in ra se gui cho ai.
 */
import { execFileSync } from 'node:child_process';
import { randomToken, sha256Hex } from '../worker/src/lib/crypto.js';
import { renderMail } from '../worker/src/mail/templates.js';

const NGAY = 7;                       // giong worker/src/auth/invite.js
const args = process.argv.slice(2);
const that = args.includes('--that');
const layCo = (t) => { const i = args.indexOf(`--${t}`); return i >= 0 ? args[i + 1] : null; };
const soLuong = Math.min(Math.max(Number(layCo('so')) || 25, 1), 200);

const goc = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
const key = process.env.RESEND_API_KEY || '';
const from = process.env.MAIL_FROM || '';

if (!goc || (that && (!key || !from))) {
  console.error('Thieu APP_ORIGIN / RESEND_API_KEY / MAIL_FROM trong .env');
  process.exit(1);
}

/**
 * Chay mot cau lenh SQL tren D1 that. Tra ve mang dong (hoac [] neu la ghi).
 *
 * Dung --command chu KHONG dung --file: voi --file wrangler tra ve BAN TOM TAT
 * ("Total queries executed", "Rows read") chu khong tra ve du lieu, nen doc
 * bang --file la doc duoc mot dong vo nghia.
 *
 * Va goi thang npx.cmd voi shell:false: qua shell cua Windows, cau SQL co dau
 * nhay don bi cat vun mot cach kho doan. Khong shell thi tham so di nguyen ven.
 *
 * Wrangler tren Windows hay thoat kem mot dong "Assertion failed" SAU KHI da in
 * ket qua - nen doc stdout truoc, chi coi la loi khi khong doc noi JSON.
 */
// Goi thang wrangler trong node_modules chu khong qua npx: tren Windows,
// execFileSync khong chay duoc file .cmd neu khong bat shell, ma bat shell thi
// cau SQL co dau nhay don lai bi cat vun.
const WRANGLER = process.platform === 'win32'
  ? 'node_modules/wrangler/bin/wrangler.js'
  : 'node_modules/wrangler/bin/wrangler.js';

function sql(cau) {
  const motDong = String(cau).replace(/\s+/g, ' ').trim();
  let ra = '';
  try {
    ra = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'platform', '--remote',
      '--json', '--command', motDong], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    ra = String(err.stdout || '');
  }
  const dau = ra.indexOf('[');
  if (dau < 0) throw new Error(`Khong doc duoc ket qua D1:
${ra.slice(0, 400)}`);
  const j = JSON.parse(ra.slice(dau));
  if (j[0]?.error) throw new Error(JSON.stringify(j[0].error).slice(0, 300));
  return j[0]?.results || [];
}

const nhay = (v) => `'${String(v).replace(/'/g, "''")}'`;

const brand = {
  name: process.env.BRAND_NAME || '',
  legalName: process.env.BRAND_LEGAL_NAME || '',
  productLine: process.env.BRAND_PRODUCT_LINE || '',
  hostName: process.env.BRAND_HOST_NAME || '',
  color: process.env.BRAND_COLOR || '#111111',
};
const tyLeHoaHong = Math.round((Number(process.env.AFFILIATE_RATE) || 20));

// -------------------------------------------------------------- ai con thieu
const canGui = sql(`
  SELECT u.id, u.email, u.full_name, u.legacy_lead_id
    FROM users u
   WHERE u.status = 'active' AND u.role = 'member' AND u.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM emails_sent e
                      WHERE e.to_addr = u.email AND e.template = 'invite_app'
                        AND e.status = 'sent')
     AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM oauth_accounts o WHERE o.user_id = u.id)
   ORDER BY u.created_date`);

console.log(`\n${canGui.length} nguoi chua bao gio nhan duoc thu moi.`);
console.log(that ? `Se gui ${Math.min(soLuong, canGui.length)} thu.\n`
  : `Chay thu - them --that de gui that (moi lan toi da ${soLuong}).\n`);

// Nap TRUOC toan bo ma gioi thieu trong mot cau lenh. Hoi tung nguoi mot la
// them mot lan goi mang cho moi la thu - 110 nguoi thanh 110 lan cho.
const maTheoLead = new Map();
if (that && canGui.length) {
  const ids = canGui.slice(0, soLuong).map((u) => Number(u.legacy_lead_id)).filter(Boolean);
  if (ids.length) {
    for (const a of sql(`SELECT lead_id, code FROM affiliates WHERE status = 'active' AND lead_id IN (${ids.join(',')})`)) {
      maTheoLead.set(Number(a.lead_id), a.code);
    }
  }
}

let daGui = 0;
let hong = 0;

for (const u of canGui.slice(0, soLuong)) {
  if (!that) {
    console.log(`  ${(u.full_name || '(chua co ten)').padEnd(28)} ${u.email}`);
    continue;
  }

  // Token MOI moi lan: ta chi luu ban bam, khong luu ban goc, nen khong the
  // dung lai token cu - va token cu co the da het han tu lau.
  const token = randomToken();
  const hetHan = new Date(Date.now() + NGAY * 86400000).toISOString();
  const luc = new Date().toISOString();
  const hash = await sha256Hex(token);

  // Link gioi thieu rieng cua ho, kem trong thu - giong het duong tu dong.
  const refCode = maTheoLead.get(Number(u.legacy_lead_id)) || '';
  const refUrl = refCode ? `${goc}/?ref=${refCode}` : '';

  const url = `${goc}/reset-password?token=${token}&moi=1`;
  const thu = renderMail('invite_app', {
    url, name: u.full_name || '', days: NGAY, refUrl, refCode, refRate: tyLeHoaHong, brand,
  });

  const khoa = crypto.randomUUID();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': khoa,
      },
      body: JSON.stringify({ from, to: [u.email], subject: thu.subject, html: thu.html, text: thu.text }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      hong += 1;
      const loi = String(data?.message || res.status).slice(0, 200);
      sql(`INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, error, created_at)
           VALUES (${nhay(crypto.randomUUID())}, ${nhay(u.email)}, 'invite_app', ${nhay(khoa)},
                   'failed', ${nhay(loi)}, ${nhay(luc)})`);
      console.log(`  HONG  ${u.email}  ${loi}`);
      // Het han muc thi DUNG NGAY - gui tiep chi to ban ghi that bai.
      if (/quota|rate|limit/i.test(loi)) { console.log('\n  -> het han muc gui, dung lai.'); break; }
      continue;
    }

    // Ghi token SAU khi thu di duoc: thu that bai ma van tao token la de lai
    // mot duong dat mat khau khong ai biet, mo bay cho ca bay ngay.
    sql(`INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
         VALUES (${nhay(crypto.randomUUID())}, ${nhay(u.id)}, ${nhay(hash)},
                 ${nhay(hetHan)}, '', ${nhay(luc)});
         INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, provider_id, created_at, sent_at)
         VALUES (${nhay(crypto.randomUUID())}, ${nhay(u.email)}, 'invite_app', ${nhay(khoa)},
                 'sent', ${nhay(data?.id || '')}, ${nhay(luc)}, ${nhay(luc)});`);
    daGui += 1;
    console.log(`  OK    ${(u.full_name || '').padEnd(28)} ${u.email}`);
  } catch (err) {
    hong += 1;
    console.log(`  HONG  ${u.email}  ${err.message}`);
  }
}

if (that) {
  console.log(`\nDa gui ${daGui} thu · ${hong} hong · con ${Math.max(0, canGui.length - daGui)} nguoi chua nhan.`);
}
