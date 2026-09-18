/**
 * Chay wrangler voi dung tai khoan Cloudflare cua khach.
 *
 *   node scripts/cf.mjs deploy
 *   node scripts/cf.mjs d1 migrations apply platform --remote
 *
 * Vi sao can: mot nguoi thuong la thanh vien cua nhieu tai khoan Cloudflare
 * (tai khoan rieng, va tai khoan cua tung khach). Wrangler khong tu biet chon
 * cai nao. Script nay doc CLOUDFLARE_ACCOUNT_ID va CLOUDFLARE_API_TOKEN tu
 * .env roi truyen sang - deploy nham cho la khong the xay ra.
 *
 * Bi mat KHONG bao gio duoc in ra man hinh, ke ca khi loi.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Doc .env, giu nguyen gia tri co khoang trang va dau gach ngang. */
function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = readEnvFile(path.join(ROOT, '.env'));
const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = env.CLOUDFLARE_API_TOKEN;

if (!accountId || !apiToken) {
  console.error('');
  console.error('DUNG: thieu CLOUDFLARE_ACCOUNT_ID hoac CLOUDFLARE_API_TOKEN trong .env');
  console.error('');
  console.error('  Da chay `wrangler login` roi VAN bao loi nay la binh thuong:');
  console.error('  lenh nay doc .env chu khong dung phien dang nhap do.');
  console.error('');
  console.error('  Account ID : dashboard -> chon tai khoan -> Account ID o cot phai');
  console.error('  API token  : My Profile -> API Tokens -> Create Token');
  console.error('               -> mau "Edit Cloudflare Workers"');
  console.error('');
  console.error('  Dien ca hai vao file .env (muc "Chon tai khoan Cloudflare de deploy").');
  console.error('');
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Dung: node scripts/cf.mjs <lenh wrangler...>');
  process.exit(1);
}

/**
 * Hai cua kiem TRUOC KHI deploy. Ca hai deu sinh ra tu mot su co that ngay
 * 12/09/2026, cach nhau vai phut, tren trang dang phuc vu hoc vien that.
 *
 * Bo qua bang `--du-ban` khi biet ro minh dang lam gi.
 */
const CO_THE_BO_QUA = '--du-ban';

const dongCua = (...dong) => {
  for (const d of dong) console.error(d);
  process.exit(1);
};

/**
 * Cua 1 - cay lam viec phai sach.
 *
 * Chuyen da xay ra: hai nguoi cung sua mot thu muc. Mot nguoi build luc 15:03
 * roi deploy luc 15:04; giua hai moc do nguoi kia dang go do dang mot route
 * moi va mot cot CSDL. Ban deploy cuon theo ma chua xong cua ho - `repo.js`
 * doc mot cot khong ton tai tren CSDL that, va duong mo noi dung khoa hoc cho
 * MOI hoc vien dang nhap gay trong im lang.
 *
 * `wrangler deploy` dong goi tu MA NGUON tai thoi diem chay, KHONG phai tu
 * `dist/`, nen "toi vua build xong" khong cuu duoc gi.
 */
function kiemCayLamViec() {
  let ban;
  try {
    ban = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return; // khong phai kho git thi khong co gi de kiem
  }
  if (!ban) return;
  const dong = ban.split('\n').map((d) => d.replace(/\s+$/, ''));
  dongCua(
    '',
    'DUNG: cay lam viec con ' + dong.length + ' thay doi chua commit.',
    '',
    ...dong.slice(0, 20).map((d) => '   ' + d),
    dong.length > 20 ? '   ... va ' + (dong.length - 20) + ' file nua' : '',
    '',
    'Deploy dong goi tu ma nguon, nen tat ca nhung thu tren se len ban that -',
    'ke ca thu nguoi khac dang go do dang. Commit hoac stash truoc da.',
    'Biet ro minh dang lam gi thi them ' + CO_THE_BO_QUA,
    '',
  );
}

/**
 * Cua 2 - migration tren dia phai da chay xong o CSDL that.
 *
 * Chuyen da xay ra: mot migration them cot moi, ma nguon doc cot do, nhung
 * migration chua chay tren CSDL that. Deploy xong la 500, va no gay dung cho
 * chan noi dung cua moi hoc vien.
 *
 * Thu tu dung luon la: migration truoc, ma sau.
 */
function kiemMigration() {
  const thuMuc = path.join(ROOT, 'worker', 'migrations');
  if (!fs.existsSync(thuMuc)) return;
  const trenDia = fs.readdirSync(thuMuc).filter((f) => f.endsWith('.sql')).sort();
  if (!trenDia.length) return;

  let ra;
  try {
    ra = execFileSync('npx', ['wrangler', 'd1', 'migrations', 'list', 'platform', '--remote'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: accountId,
        CLOUDFLARE_API_TOKEN: apiToken,
        WRANGLER_SEND_METRICS: 'false',
      },
    });
  } catch (err) {
    // Khong hoi duoc thi KHONG cho di tiep. Mot cua kiem tu mo ra khi gap su co
    // la cua kiem vo dung - va day la cua chan dung loi da tung lam hong that.
    dongCua(
      '',
      'DUNG: khong kiem duoc migration tren CSDL that.',
      String(err && err.message ? err.message : err).split('\n')[0],
      'Sua ket noi roi chay lai, hoac them ' + CO_THE_BO_QUA + ' neu chac chan.',
      '',
    );
  }

  // `migrations list` chi in ra nhung migration CHUA chay.
  const chuaChay = trenDia.filter((f) => ra.includes(f));
  if (!chuaChay.length) return;
  dongCua(
    '',
    'DUNG: ' + chuaChay.length + ' migration chua chay tren CSDL that:',
    '',
    ...chuaChay.map((f) => '   ' + f),
    '',
    'Deploy truoc khi chay chung la ma nguon se doc nhung cot chua ton tai.',
    'Chay truoc:  node scripts/cf.mjs d1 migrations apply platform --remote',
    '',
  );
}

if (args[0] === 'deploy') {
  const viTri = args.indexOf(CO_THE_BO_QUA);
  if (viTri !== -1) {
    args.splice(viTri, 1);
    console.warn('Bo qua hai cua kiem truoc deploy (' + CO_THE_BO_QUA + ').');
  } else {
    kiemCayLamViec();
    kiemMigration();
  }
}

const child = spawn('npx', ['wrangler', ...args], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    // Tat phan hoi tuong tac - script nay hay chay tu cong cu tu dong.
    WRANGLER_SEND_METRICS: 'false',
  },
});

child.on('exit', (code) => process.exit(code ?? 1));
