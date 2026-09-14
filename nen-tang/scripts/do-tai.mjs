/**
 * Do suc chiu tai cua mot ban dang chay.
 *
 *   node scripts/do-tai.mjs [baseUrl] [soLuot] [songSong]
 *
 * CHI GOI NHUNG DUONG DOC. Khong tao lead, khong tao don, khong ghi mot dong
 * nao - nen chay duoc ca voi ban that ma khong de lai rac.
 *
 * Doc ket qua the nao:
 *   - p95 la con so dang nhin, khong phai trung binh. Trung binh giau di dung
 *     nhung nguoi cham nhat, ma do lai la nhung nguoi bo di.
 *   - 429 KHONG phai loi: do la bo chong spam lam dung viec. No duoc dem rieng.
 *   - 5xx moi la loi that.
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const SO_LUOT = Number(process.argv[3]) || 300;
const SONG_SONG = Number(process.argv[4]) || 30;

const DUONG = [
  ['/api/health', 'kiem tra suc khoe'],
  ['/', 'trang ban hang'],
  ['/dang-ky', 'trang dang ky'],
  ['/thanh-toan', 'trang thanh toan'],
  ['/api/apps/public/prod/public-settings/by-id/x', 'cau hinh cong khai'],
];

const phanVi = (ds, p) => {
  if (!ds.length) return 0;
  const sx = [...ds].sort((a, b) => a - b);
  return Math.round(sx[Math.min(sx.length - 1, Math.floor((p / 100) * sx.length))]);
};

async function doMot(duong) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + duong, { redirect: 'manual' });
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status };
  } catch (err) {
    return { ms: performance.now() - t0, status: 0, err: err.message };
  }
}

(async () => {
  console.log(`\nDo tai ${BASE}`);
  console.log(`  ${SO_LUOT} luot moi duong, ${SONG_SONG} luot cung luc\n`);

  for (const [duong, ten] of DUONG) {
    const ketQua = [];
    let i = 0;

    // Chay theo tung lan song SONG_SONG luot, khong ban het mot luc: ban het
    // mot luc thi do la do gioi han cua may dang chay script chu khong phai
    // cua may chu.
    /* eslint-disable no-await-in-loop */
    while (i < SO_LUOT) {
      const lo = Math.min(SONG_SONG, SO_LUOT - i);
      const batch = await Promise.all(Array.from({ length: lo }, () => doMot(duong)));
      ketQua.push(...batch);
      i += lo;
    }
    /* eslint-enable no-await-in-loop */

    const ms = ketQua.map((r) => r.ms);
    const ok = ketQua.filter((r) => r.status >= 200 && r.status < 400).length;
    const chan = ketQua.filter((r) => r.status === 429).length;
    const hong = ketQua.filter((r) => r.status >= 500 || r.status === 0).length;

    console.log(`  ${ten.padEnd(22)} ${duong}`);
    console.log(`     ${ok} thanh cong · ${chan} bi chan (429) · ${hong} hong (5xx)`);
    console.log(`     p50 ${phanVi(ms, 50)}ms · p95 ${phanVi(ms, 95)}ms · p99 ${phanVi(ms, 99)}ms`
      + ` · cham nhat ${Math.round(Math.max(...ms))}ms`);
    if (hong) {
      const viDu = ketQua.find((r) => r.status >= 500 || r.status === 0);
      console.log(`     vi du loi: ${viDu.status} ${viDu.err || ''}`);
    }
    console.log('');
  }
})();
