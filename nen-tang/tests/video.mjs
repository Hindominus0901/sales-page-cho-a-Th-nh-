/**
 * Bo test DUY NHAT khong can may chu.
 *
 * `apps/web/src/lib/video.js` la mot file thuan tuy - khong import gi, khong
 * cham DOM - nen chay thang bang node duoc. Ba bo kia deu goi qua HTTP nen
 * khong bao gio cham toi duoc doan ma nay, va do chinh la ly do mot lo hong to
 * song lau den vay o day: form them bai giang nhan link YouTube roi bien no
 * thanh "ma video", cho ra mot khung den khong loi. Khong bai test nao co the
 * bat duoc chuyen do.
 *
 * Chay rieng: node tests/video.mjs
 */
import { nhanDangVideo, videoEmbedUrl, videoThumb, NHA_CUNG_CAP }
  from '../apps/web/src/lib/video.js';

let dat = 0;
let loi = 0;

function check(ten, ok, chiTiet) {
  if (ok) { dat += 1; console.log(`  OK   ${ten}`); return; }
  loi += 1;
  console.log(`  FAIL ${ten}`
    + (chiTiet === undefined ? '' : ` -> ${JSON.stringify(chiTiet)}`));
}

/** Nhan dang ra dung cap (nha cung cap, ma). */
function nhan(ten, dauVao, provider, id, goiY) {
  const ra = nhanDangVideo(dauVao, goiY);
  check(ten, ra.ok && ra.provider === provider && ra.id === id, ra);
}

/** Phai TU CHOI, va phai kem mot cau giai thich cho nguoi doc. */
function tuChoi(ten, dauVao) {
  const ra = nhanDangVideo(dauVao);
  check(ten, !ra.ok && typeof ra.loi === 'string' && ra.loi.length > 10, ra);
}

console.log('Nhan dang video (khong can may chu)\n');

console.log('1. Link YouTube - dang tac nguoi dung hay lam nhat');
nhan('link chia se youtu.be', 'https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ');
nhan('link xem day du', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ');
nhan('link con tham so khac', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtube', 'dQw4w9WgXcQ');
nhan('link nhung', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ');
nhan('link shorts', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ');
nhan('ban nocookie', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ');

console.log('\n2. Link Wistia');
nhan('duong medias tren ten mien khach', 'https://khach.wistia.com/medias/abc123xyz', 'wistia', 'abc123xyz');
nhan('duong nhung iframe', 'https://fast.wistia.net/embed/iframe/abc123xyz', 'wistia', 'abc123xyz');
tuChoi('link chia se .../s/... -> tu choi va noi ro vi sao',
  'https://khach.wistia.com/s/AbCdEfGh');

console.log('\n3. Ma tran - cho bay nha cung cap doan nham');
nhan('ma tran, khong goi y -> Wistia (mac dinh cua san pham)',
  'abc123xyz', 'wistia', 'abc123xyz');
nhan('ma tran + dang chon YouTube -> KHONG bi ep thanh Wistia',
  'dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ', 'youtube');
nhan('ma tran + dang chon Vimeo', '123456789', 'vimeo', '123456789', 'vimeo');
nhan('goi y bay -> quay ve mac dinh, khong nhan bua',
  'abc123xyz', 'wistia', 'abc123xyz', 'khong-ton-tai');

console.log('\n4. Nha cung cap con lai');
nhan('vimeo', 'https://vimeo.com/123456789', 'vimeo', '123456789');
nhan('cloudflare stream', 'https://watch.cloudflarestream.com/abc123', 'stream', 'abc123');

console.log('\n5. Dau vao hong - phai tu choi, KHONG duoc tra embed sai');
tuChoi('ten mien chua ho tro', 'https://drive.google.com/file/d/abc/view');
tuChoi('link youtube khong co ma video', 'https://www.youtube.com/');
check('chuoi rong -> khong ok, va khong keu la loi',
  (() => { const r = nhanDangVideo(''); return !r.ok && r.loi === ''; })());

console.log('\n6. Ghep link nhung - phai ra dung ten mien CSP cho phep');
// CSP o worker/src/lib/respond.js chi cho fast.wistia.net, fast.wistia.com,
// www.youtube.com, www.youtube-nocookie.com, player.vimeo.com,
// iframe.videodelivery.net. Sai ten mien la khung den, KHONG co loi nao.
const CHO_PHEP = [
  'https://fast.wistia.net/', 'https://fast.wistia.com/',
  'https://www.youtube.com/', 'https://www.youtube-nocookie.com/',
  'https://player.vimeo.com/', 'https://iframe.videodelivery.net/',
];
for (const p of NHA_CUNG_CAP) {
  const url = videoEmbedUrl({ video_provider: p, video_id: 'abc123' });
  check(`${p} -> ten mien nam trong danh sach CSP`,
    !!url && CHO_PHEP.some((g) => url.startsWith(g)), url);
}
check('nha cung cap la -> null, chu khong doan bua',
  videoEmbedUrl({ video_provider: 'tiktok', video_id: 'abc' }) === null);
check('khong co ma video -> null',
  videoEmbedUrl({ video_provider: 'youtube', video_id: '' }) === null);

console.log('\n7. Anh thu nho');
check('youtube co anh', !!videoThumb({ video_provider: 'youtube', video_id: 'abc123' }));
check('wistia co anh (truoc day la o den)',
  !!videoThumb({ video_provider: 'wistia', video_id: 'abc123' }));
check('bo trong nha cung cap = wistia, cung co anh',
  !!videoThumb({ video_id: 'abc123' }));

console.log(`\nKet qua: ${dat} dat, ${loi} loi`);
process.exit(loi ? 1 : 0);
