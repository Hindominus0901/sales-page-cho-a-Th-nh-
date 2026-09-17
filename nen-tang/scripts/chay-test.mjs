/**
 * Chay ca ba bo test, va TU LO may chu dev.
 *
 *   node scripts/chay-test.mjs
 *
 * VI SAO CO FILE NAY: `wrangler dev` tren Windows thinh thoang sap ngang, khong
 * in ra chu nao, ma cung khong lien quan gi toi ma nguon dang duoc kiem thu.
 * Khi do ca bo test do lom dom voi "fetch failed / ECONNREFUSED" - mot loi
 * HOAN TOAN GIA, va nguoi doc mat ca chuc phut di tim mot con bo khong ton tai.
 * Chinh cac bo test da phai co san co che thu lai cho D1 vi cung ly do do.
 *
 * File nay bit not lo hong con lai: neu may chu chet giua chung, no dung day,
 * bat lai, va CHAY LAI DUNG BO DO mot lan. Chay lai duoc vi ca ba bo deu tu don
 * du lieu cua minh - khong bo nao dua tren rac cua lan chay truoc.
 *
 * Neu may chu da chay san (nguoi dung tu mo `npm run dev:worker` o cua so khac)
 * thi KHONG dung vao no: dung nho, va de nguyen luc xong. Tat may chu cua nguoi
 * khac la mot bat ngo kho chiu.
 */
import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

const CONG = 8787;
const GOC = `http://127.0.0.1:${CONG}`;
// video.mjs va ngay.mjs chay DAU TIEN va co y: hai bo do khong can may chu nen
// chung cho ket qua trong mot phan giay. Ba bo sau phai cho wrangler dev khoi
// dong (co khi 30 giay). Mot loi cu phap trong lib/video.js hay lib/ngay.js thi
// bat duoc ngay thay vi sau nua phut cho mot thu khong lien quan.
const BO_TEST = [
  'tests/video.mjs', 'tests/ngay.mjs',
  'tests/smoke.mjs', 'tests/auth.mjs', 'tests/platform.mjs',
];
const CHO_KHOI_DONG_MS = 120_000;

const nghi = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function conSong() {
  try {
    const res = await fetch(`${GOC}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

async function choSong(hanMs) {
  const het = Date.now() + hanMs;
  while (Date.now() < het) {
    if (await conSong()) return true;
    await nghi(1500);
  }
  return false;
}

let tienTrinh = null;

/** Tat ca cay tien trinh. `child.kill()` khong du: workerd la tien trinh con. */
function tat() {
  if (!tienTrinh) return;
  const pid = tienTrinh.pid;
  tienTrinh = null;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch { /* da chet roi thi thoi */ }
}

async function bat() {
  const nhatKy = openSync('wd.out', 'a');
  const loi = openSync('wd.err', 'a');
  tienTrinh = spawn(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(CONG)],
    { stdio: ['ignore', nhatKy, loi], detached: process.platform !== 'win32' },
  );
  tienTrinh.unref();
  closeSync(nhatKy);
  closeSync(loi);

  if (!(await choSong(CHO_KHOI_DONG_MS))) {
    tat();
    throw new Error('may chu dev khong len sau 2 phut - xem wd.err');
  }
}

/** @returns {boolean} bo test xanh hay do */
function chayMot(duong) {
  try {
    execFileSync(process.execPath, ['--env-file=.env', duong], { stdio: 'inherit' });
    return true;
  } catch { return false; }
}

(async () => {
  const tuMo = !(await conSong());
  if (tuMo) {
    console.log('\n  Khong thay may chu dev - tu bat len...\n');
    await bat();
  } else {
    console.log('\n  Dung may chu dev dang chay san o cong 8787.\n');
  }

  // Xoa bo dem chan spam TRUOC KHI chay.
  //
  // /api/leads gioi han RATE_LEAD_PER_HOUR (mac dinh 10) lua dang ky moi GIO
  // moi DIA CHI IP. Ca ba bo test - va bat cu lan thu tay nao trong cung gio -
  // deu di ra tu mot dia chi duy nhat la 127.0.0.1, nen chung tieu chung mot
  // han muc. Cham tran thi tests/smoke.mjs do o nhung bai KHONG LIEN QUAN GI
  // toi gioi han (vi du "mat cookie ref -> van doc duoc ma tu dia chi trang"),
  // kem mot thong bao noi ve spam - doc len khong ai nghi toi rate limit, va
  // no tu khoi sau mot tieng nen cang giong mot loi chap chon.
  //
  // Xoa o day chu khong o trong smoke.mjs: smoke la bo DUY NHAT duoc phep chay
  // voi ban deploy that, nen no tuyet doi khong duoc dung toi database. Con
  // script nay thi chi chay o may - no tu bat wrangler dev len.
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'platform', '--local',
      '--command', 'DELETE FROM rate_limits'], { stdio: 'ignore', shell: true });
  } catch { /* khong xoa duoc thi cung dung chan viec chay test */ }

  let hong = 0;
  try {
    for (const bo of BO_TEST) {
      console.log(`\n${'='.repeat(60)}\n  ${bo}\n${'='.repeat(60)}`);
      let xanh = chayMot(bo);

      // Do vi may chu chet, hay do that? Hoi lai may chu roi moi ket luan.
      if (!xanh && !(await conSong())) {
        console.log('\n  >> May chu dev da chet giua chung. Bat lai va chay lai bo nay.\n');
        tat();
        await bat();
        xanh = chayMot(bo);
      }
      if (!xanh) hong += 1;
    }
  } finally {
    if (tuMo) tat();
  }

  console.log(hong
    ? `\n  ${hong}/${BO_TEST.length} bo test DO.\n`
    : `\n  Ca ${BO_TEST.length} bo test xanh.\n`);
  process.exit(hong ? 1 : 0);
})().catch((err) => {
  tat();
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
});
