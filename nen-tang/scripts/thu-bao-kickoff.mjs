/**
 * Thu bao chung (broadcast) cho toan bo danh sach: users + leads.
 *
 *   node --env-file=.env scripts/thu-bao-kickoff.mjs                  # chay thu, KHONG gui
 *   node --env-file=.env scripts/thu-bao-kickoff.mjs --test a@b.com   # gui thu 1 la cho minh
 *   node --env-file=.env scripts/thu-bao-kickoff.mjs --that --so 50   # gui that, toi da 50
 *
 * Co cac tham so:
 *   --ai users|leads|tatca   danh sach nhan (mac dinh tatca = hop hai ben)
 *   --ngay "9/9/2026"        ngay dien ra, in nguyen van vao thu
 *   --gio  "9:00"            gio bat dau
 *   --anh  <duong dan>       anh dinh kem (JPG/PNG)
 *   --kieu kickoff|sap-bat-dau   kickoff = nhac tu hom truoc;
 *                                sap-bat-dau = nhac SAT gio, kem phan qua bi mat
 *   --luc  "2026-09-09T01:45:00Z"  hen gio gui (gio UTC; +7 la gio VN)
 *   --ma   <ten>             ten mau ghi vao emails_sent, dung de KHONG gui trung
 *
 * VI SAO CO --ma: chay lai lan hai khong duoc gui lai cho nguoi da nhan. Moi la
 * thu di duoc deu ghi mot dong emails_sent voi ten mau nay; lan sau script loc
 * bo dung nhung dia chi do. Doi --ma la doi sang mot dot gui khac.
 *
 * DEDUP theo email chu thuong: mot nguoi vua la lead vua la user chi nhan mot la.
 *
 * KHONG CO --that thi KHONG GUI GI CA, chi in ra se gui cho ai.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const args = process.argv.slice(2);
const that = args.includes('--that');
const layCo = (t) => { const i = args.indexOf(`--${t}`); return i >= 0 ? args[i + 1] : null; };
const soLuong = Math.min(Math.max(Number(layCo('so')) || 400, 1), 1000);
const ai = (layCo('ai') || 'tatca').toLowerCase();
const ngay = layCo('ngay') || '';
const gio = layCo('gio') || '';
const duongAnh = layCo('anh') || '';
const chiGuiCho = layCo('test');

// kickoff    = nhac tu hom truoc ("ngay mai bat dau")
// sap-bat-dau = nhac SAT gio ("con it phut nua", kem phan qua bi mat)
const kieu = (layCo('kieu') || 'kickoff').toLowerCase();
if (!['kickoff', 'sap-bat-dau'].includes(kieu)) {
  console.error(`Khong co kieu thu "${kieu}". Chi co: kickoff | sap-bat-dau`);
  process.exit(1);
}

// Ma dot MAC DINH khac nhau theo kieu. Neu dung chung mot ma, la thu nhac sat
// gio se bi loc bo dung nhung nguoi da nhan thu hom truoc - tuc la khong ai
// nhan duoc no ca.
const maDot = layCo('ma') || (kieu === 'sap-bat-dau' ? 'broadcast_sap_bat_dau' : 'broadcast_kickoff');

// Hen gio gui cua Resend (ISO 8601, vd 2026-09-09T01:45:00Z = 8:45 gio VN).
// Khong co thi gui ngay.
const henLuc = layCo('luc') || '';

const goc = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
const key = process.env.RESEND_API_KEY || '';
const from = process.env.MAIL_FROM || '';

if (!ngay || !gio) {
  console.error('Thieu --ngay hoac --gio. Vi du: --ngay "9/9/2026" --gio "9:00"');
  process.exit(1);
}
if ((that || chiGuiCho) && (!key || !from)) {
  console.error('Thieu RESEND_API_KEY / MAIL_FROM trong .env');
  process.exit(1);
}

// Chay mot cau lenh SQL tren D1 that. Xem chu thich dai trong
// scripts/gui-lai-thu-moi.mjs ve vi sao dung --command va goi thang wrangler.js.
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
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
  if (dau < 0) throw new Error(`Khong doc duoc ket qua D1:\n${ra.slice(0, 400)}`);
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
const zalo = process.env.ZALO_GROUP_URL || process.env.ZALO_URL || '';

// ------------------------------------------------------------------ noi dung
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CID = 'poster-kickoff';

/**
 * Khung thu chung cho ca hai kieu. Chi doi phan ruot.
 *
 * Anh nhung bang cid: chu khong bang duong dan ngoai - anh di theo la thu, doc
 * duoc ca khi khong co mang, va khong bi cac app mail chan "anh tu ben ngoai".
 */
const khung = (tieuDe, ruot) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(tieuDe)}</title></head>
<body style="margin:0;padding:24px;background:#faf7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eee">
    <tr><td style="padding:24px 28px 8px">
      <div style="font-weight:800;font-size:18px;color:${brand.color}">${escapeHtml(brand.name)}</div>
    </td></tr>
    <tr><td style="padding:8px 28px 28px">${ruot}</td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8b8794;text-align:center">
    Email này gửi tự động từ hệ thống của ${escapeHtml(brand.legalName)}.
  </p>
</body></html>`;

const nut = (href, nhan) => (href ? `
    <div style="margin:24px 0;text-align:center">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;border-radius:999px;background:${brand.color};color:#fff;text-decoration:none;font-weight:700">${escapeHtml(nhan)}</a>
    </div>` : '');

const anhPoster = () => (duongAnh ? `
      <img src="cid:${CID}" alt="Thông báo Kick-off ${escapeHtml(ngay)}" width="464"
           style="display:block;width:100%;max-width:464px;height:auto;border-radius:12px;margin:16px 0">` : '');

function soanThu(ten) {
  const chao = ten ? `Chào ${escapeHtml(ten)},` : 'Chào bạn,';

  // ------------------------------------------------ kieu 2: sap bat dau roi
  // Gui SAT gio G. Cau chu o day noi "con it phut nua" nen la thu chi dung khi
  // that su con it phut - gui truoc mot tieng la noi doi voi 300 nguoi.
  if (kieu === 'sap-bat-dau') {
    const ruot = `
      <h1 style="font-size:20px;margin:0 0 12px">Chỉ còn ít phút nữa chúng ta bắt đầu</h1>
      <p style="margin:0 0 12px;color:#5a5661;font-size:15px">${chao}</p>
      <p style="margin:0 0 12px;color:#5a5661;font-size:15px">
        Buổi <strong>KICK-OFF</strong> của ${escapeHtml(brand.productLine)} bắt đầu lúc
        <strong>${escapeHtml(gio)}</strong> sáng nay. Chỉ còn ít phút nữa thôi.
      </p>
      <div style="margin:16px 0;padding:14px 16px;border-radius:12px;background:#fff0f8">
        <div style="font-size:15px;color:#121212;font-weight:700">Có một phần quà bí mật</div>
        <div style="font-size:14px;color:#5a5661;margin-top:6px">
          ${escapeHtml(brand.hostName)} dành riêng cho những người có mặt trong buổi hôm nay,
          và sẽ trao ngay trong lúc học. Bạn vào sớm để không lỡ nhé.
        </div>
      </div>
      <p style="margin:0 0 12px;color:#5a5661;font-size:15px">
        Link vào phòng đang ở trong <strong>nhóm Zalo</strong>. Bạn bấm nút bên dưới, lấy link và vào luôn.
      </p>
      ${anhPoster()}
      ${nut(zalo, 'Vào nhóm Zalo lấy link ngay')}
      <p style="margin:0;color:#8b8794;font-size:13px">Gặp bạn trong ít phút nữa.</p>`;

    const text = `${ten ? `Chao ${ten},` : 'Chao ban,'}\n\n`
      + `Chi con it phut nua buoi KICK-OFF bat dau - ${gio} sang nay.\n\n`
      + `CO MOT PHAN QUA BI MAT danh rieng cho nhung nguoi co mat trong buoi hom nay,\n`
      + `${brand.hostName} se trao ngay trong luc hoc. Ban vao som de khong lo nhe.\n\n`
      + (zalo ? `Link vao phong dang o trong nhom Zalo: ${zalo}\n` : '')
      + `\nGap ban trong it phut nua.`;

    return {
      subject: `Còn ít phút nữa — và một phần quà bí mật cho người có mặt`,
      html: khung('Chỉ còn ít phút nữa chúng ta bắt đầu', ruot),
      text,
    };
  }

  // -------------------------------------------------- kieu 1: nhac tu hom truoc
  const ruot = `
      <h1 style="font-size:20px;margin:0 0 12px">Ngày mai chương trình chính thức Kick-off</h1>
      <p style="margin:0 0 12px;color:#5a5661;font-size:15px">${chao}</p>
      <p style="margin:0 0 12px;color:#5a5661;font-size:15px">
        Chương trình <strong>${escapeHtml(brand.productLine)}</strong> cùng ${escapeHtml(brand.hostName)}
        sẽ bắt đầu vào <strong>${escapeHtml(gio)} ngày ${escapeHtml(ngay)}</strong>.
      </p>
      <div style="margin:16px 0;padding:14px 16px;border-radius:12px;background:#fff0f8">
        <div style="font-size:15px;color:#121212"><strong>Thời gian:</strong> ${escapeHtml(gio)} — ${escapeHtml(ngay)}</div>
        <div style="font-size:14px;color:#5a5661;margin-top:6px">Vào sớm 10 phút để không lỡ phần đầu.</div>
      </div>
      ${anhPoster()}
      ${nut(zalo, 'Vào nhóm Zalo nhận link')}
      <p style="margin:0;color:#8b8794;font-size:13px">
        Link vào phòng sẽ được gửi trong nhóm Zalo trước giờ bắt đầu. Hẹn gặp bạn ngày mai.
      </p>`;

  const text = `${ten ? `Chao ${ten},` : 'Chao ban,'}\n\n`
    + `Ngay mai chuong trinh chinh thuc Kick-off.\n`
    + `Thoi gian: ${gio} ngay ${ngay}. Vao som 10 phut de khong lo phan dau.\n`
    + (zalo ? `\nNhom Zalo (link vao phong se gui o day): ${zalo}\n` : '')
    + (goc ? `\nKhu vuc hoc vien: ${goc}\n` : '')
    + `\nHen gap ban ngay mai.`;

  return {
    subject: `Ngày mai ${ngay} — ${gio}: chương trình chính thức Kick-off`,
    html: khung('Ngày mai chương trình chính thức Kick-off', ruot),
    text,
  };
}

// -------------------------------------------------------------------- anh
let dinhKem = [];
if (duongAnh) {
  const buf = readFileSync(duongAnh);
  const ten = basename(duongAnh).replace(/[^\w.-]/g, '_');
  const duoi = extname(duongAnh).toLowerCase();
  // Ten file goc tu dien thoai dai va vo nghia; doi thanh ten doc duoc.
  dinhKem = [{
    filename: `kick-off${duoi || '.jpg'}`,
    content: buf.toString('base64'),
    content_id: CID,
  }];
  console.log(`Anh dinh kem: ${ten} (${Math.round(buf.length / 1024)} KB)`);
}

// ------------------------------------------------------------- ai se nhan
const dieuKienUser = `SELECT lower(trim(email)) AS email, full_name AS ten FROM users
   WHERE status = 'active' AND email IS NOT NULL AND trim(email) <> ''`;
const dieuKienLead = `SELECT lower(trim(email)) AS email, full_name AS ten FROM leads
   WHERE email IS NOT NULL AND trim(email) <> ''`;

const nguon = ai === 'users' ? dieuKienUser
  : ai === 'leads' ? dieuKienLead
    : `${dieuKienUser} UNION ${dieuKienLead}`;

const tatCa = sql(`SELECT email, MIN(ten) AS ten FROM (${nguon}) GROUP BY email ORDER BY email`);

// Ai da nhan dot nay roi thi bo qua - chay lai khong gui trung.
const daNhan = new Set(sql(`SELECT DISTINCT lower(to_addr) AS e FROM emails_sent
   WHERE template = ${nhay(maDot)} AND status = 'sent'`).map((r) => r.e));

let canGui = tatCa.filter((r) => r.email && !daNhan.has(r.email));
if (chiGuiCho) canGui = [{ email: chiGuiCho.toLowerCase(), ten: 'Bạn' }];

console.log(`\nDanh sach "${ai}": ${tatCa.length} dia chi · da nhan dot "${maDot}": ${daNhan.size} · con lai: ${canGui.length}`);
if (chiGuiCho) console.log(`CHE DO THU: chi gui 1 la cho ${chiGuiCho}\n`);
else console.log(that ? `Se gui ${Math.min(soLuong, canGui.length)} thu.\n`
  : `Chay thu - them --that de gui that.\n`);

if (!that && !chiGuiCho) {
  const m = soanThu('Nguyễn Văn A');
  console.log(`Tieu de: ${m.subject}\n`);
  console.log('--- ban chu thuan ---');
  console.log(m.text);
  console.log('\n--- 20 nguoi dau ---');
  for (const r of canGui.slice(0, 20)) console.log(`  ${(r.ten || '').padEnd(28)} ${r.email}`);
  process.exit(0);
}

// -------------------------------------------------------------------- gui
// Gui SONG SONG va ghi log GOP LAI o cuoi.
//
// Ban dau moi la thu ghi ngay mot dong emails_sent - moi dong la mot lan goi
// wrangler, ton 2-4 giay. Voi 400 nguoi la hon 20 phut, trong khi ca la thu nay
// chi co nghia trong 10 phut truoc gio hoc. Nen: ban het thu truoc (10 luong
// mot luc), ghi so sau, gop 50 dong mot lan goi.
const SONG_SONG = 8;      // duoi nguong 10 req/giay cua Resend
const NGHI_MS = 1100;     // moi lo cach nhau hon mot giay
const dsGui = canGui.slice(0, soLuong);
const ketQua = [];
let hetHanMuc = false;

async function guiMot(r, lanThu = 1) {
  const luc = new Date().toISOString();
  const thu = soanThu(r.ten || '');
  const khoa = crypto.randomUUID();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': khoa,
      },
      body: JSON.stringify({
        from,
        to: [r.email],
        subject: thu.subject,
        html: thu.html,
        text: thu.text,
        ...(dinhKem.length ? { attachments: dinhKem } : {}),
        ...(henLuc ? { scheduled_at: henLuc } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const loi = String(data?.message || res.status).slice(0, 200);
      // PHAN BIET HAI THU RAT KHAC NHAU:
      //   "daily sending quota" = het cho trong ngay -> dung han, gui tiep vo ich
      //   "10 requests per second" = minh ban qua nhanh -> CHO ROI GUI LAI
      // Truoc day ca hai deu khop mot regex, nen mot lan bi nhac toc do la ca
      // dot gui 400 nguoi dung lai sau 10 la thu.
      if (/daily|quota/i.test(loi)) { hetHanMuc = true; return { email: r.email, khoa, luc, ok: false, loi }; }
      if (/too many requests|rate limit/i.test(loi) && lanThu < 4) {
        await new Promise((x) => setTimeout(x, 1200 * lanThu));
        return guiMot(r, lanThu + 1);
      }
      return { email: r.email, khoa, luc, ok: false, loi };
    }
    return { email: r.email, khoa, luc, ok: true, id: data?.id || '' };
  } catch (err) {
    return { email: r.email, khoa, luc, ok: false, loi: String(err.message).slice(0, 200) };
  }
}

for (let i = 0; i < dsGui.length && !hetHanMuc; i += SONG_SONG) {
  const lo = dsGui.slice(i, i + SONG_SONG);
  const xong = await Promise.all(lo.map((r) => guiMot(r)));
  if (i + SONG_SONG < dsGui.length) await new Promise((x) => setTimeout(x, NGHI_MS));
  for (const k of xong) {
    ketQua.push(k);
    console.log(k.ok ? `  OK    ${k.email}` : `  HONG  ${k.email}  ${k.loi}`);
  }
  process.stdout.write(`  ... ${ketQua.filter((k) => k.ok).length}/${dsGui.length}\n`);
}
if (hetHanMuc) console.log('\n  -> het han muc gui trong ngay, dung lai.');

const daGui = ketQua.filter((k) => k.ok).length;
const hong = ketQua.length - daGui;

// Ghi so: gop 50 dong mot cau lenh. Thu da di roi nen loi o day khong lam mat
// thu nao, chi lam mat ban ghi - van bao ra man hinh de con biet ma chay lai.
if (!chiGuiCho && ketQua.length) {
  console.log('\nDang ghi so...');
  for (let i = 0; i < ketQua.length; i += 50) {
    const dong = ketQua.slice(i, i + 50).map((k) => (k.ok
      ? `INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, provider_id, created_at, sent_at)
         VALUES (${nhay(crypto.randomUUID())}, ${nhay(k.email)}, ${nhay(maDot)}, ${nhay(k.khoa)},
                 'sent', ${nhay(k.id)}, ${nhay(k.luc)}, ${nhay(k.luc)});`
      : `INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, error, created_at)
         VALUES (${nhay(crypto.randomUUID())}, ${nhay(k.email)}, ${nhay(maDot)}, ${nhay(k.khoa)},
                 'failed', ${nhay(k.loi)}, ${nhay(k.luc)});`)).join(' ');
    try { sql(dong); } catch (err) { console.log(`  ghi so hong: ${err.message}`); }
  }
}

console.log(`\nDa gui ${daGui} thu · ${hong} hong · con ${Math.max(0, canGui.length - daGui)} nguoi chua nhan.`);
