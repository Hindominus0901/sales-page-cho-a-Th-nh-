/**
 * Build: chuyển file thiết kế (.dc.html) thành trang production public/index.html
 *  - Bỏ wrapper của công cụ prototype (x-dc / helmet / support.js / image-slot.js)
 *  - Thay <image-slot> bằng <img> thật; ô video trở thành thumbnail mở lightbox
 *  - Chèn khối đăng ký #dang-ky (form + QR chuyển khoản)
 *  - Thay placeholder [[X]] bằng giá trị trong site.config.json (trống => ẩn đi)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.resolve(ROOT, '..');
// File thiết kế: ưu tiên bản chép trong repo, nếu không có thì lấy bản gốc ngoài dự án
const SRC_CANDIDATES = [
  path.join(ROOT, 'design'),
  path.join(PROJECT, 'site/templates/course-challenge-sales-page/design_handoff_sales_page'),
];
const SRC = SRC_CANDIDATES.find((d) => fs.existsSync(path.join(d, 'AIAgentChallengeForma.dc.html')));
if (!SRC) throw new Error('Không tìm thấy AIAgentChallengeForma.dc.html trong: ' + SRC_CANDIDATES.join(' | '));
const PUBLIC = path.join(ROOT, 'public');
const PARTIALS = path.join(__dirname, 'partials');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const warnings = [];
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------ 1. Ảnh + video
const MEDIA_OUT = path.join(PUBLIC, 'media');
fs.mkdirSync(MEDIA_OUT, { recursive: true });

/** Ảnh máy ảnh gốc nặng ~4 MB/tấm — nén xuống cỡ dùng được cho web. */
const HEAVY_KB = 400;
const MAX_WIDTH = 1600;
let optimised = 0;
let savedBytes = 0;

// Ảnh gốc chỉ có trên máy làm việc. Khi clone repo về, public/media đã có sẵn bản nén
// nên bỏ qua bước này thay vì báo lỗi.
const SRC_MEDIA = path.join(SRC, 'media');
const srcMediaFiles = fs.existsSync(SRC_MEDIA) ? fs.readdirSync(SRC_MEDIA) : [];
if (!srcMediaFiles.length) console.log('  · Không có ảnh gốc — dùng lại ảnh đã nén trong public/media');

for (const f of srcMediaFiles) {
  const from = path.join(SRC_MEDIA, f);
  const to = path.join(MEDIA_OUT, f);
  const size = fs.statSync(from).size;
  const heavyJpeg = /\.jpe?g$/i.test(f) && size > HEAVY_KB * 1024;

  if (!heavyJpeg) { fs.copyFileSync(from, to); continue; }

  try {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', from,
      '-vf', `scale='min(${MAX_WIDTH},iw)':-2:flags=lanczos`,
      '-q:v', '4', to,
    ], { stdio: 'pipe' });
    optimised++;
    savedBytes += size - fs.statSync(to).size;
  } catch {
    fs.copyFileSync(from, to);
    warnings.push(`Không nén được ${f} (thiếu ffmpeg?) — ảnh ${(size / 1024 / 1024).toFixed(1)} MB sẽ làm trang tải chậm.`);
  }
}

/**
 * Ảnh chụp Thành là ảnh dọc toàn thân. Nhét thẳng vào khung 16:9 thì object-fit
 * cắt vào giữa và mất mặt, nên cắt sẵn bằng ffmpeg với điểm cắt chỉnh được.
 */
function makeCrop({ from, to, ratioW, ratioH, cropY, label }) {
  const src = path.join(MEDIA_OUT, from);
  const out = path.join(MEDIA_OUT, to);
  if (!fs.existsSync(src)) { warnings.push(`Không có ảnh ${from} để cắt ${label}.`); return false; }
  try {
    const dims = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim();
    const [w, h] = dims.split(',').map(Number);
    const cropH = Math.min(h, Math.round(w * ratioH / ratioW));
    const y = Math.max(0, Math.min(cropY, h - cropH));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src,
      '-vf', `crop=${w}:${cropH}:0:${y}`, '-q:v', '4', out], { stdio: 'pipe' });
    console.log(`  · Cắt ${label}: ${from} -> ${to} (${w}x${cropH}, từ y=${y})`);
    return true;
  } catch (err) {
    // Máy build không có ffmpeg (ví dụ CI của Cloudflare) nhưng bản đã cắt sẵn
    // được commit trong public/media — dùng lại chính nó, đừng rơi về ảnh dọc
    // vì object-fit sẽ cắt vào giữa và mất mặt.
    if (fs.existsSync(out)) {
      console.log(`  · Dùng lại bản cắt sẵn ${to} (máy này không có ffmpeg)`);
      return true;
    }
    warnings.push(`Không cắt được ${label} (${err.message.slice(0, 60)}) — dùng ảnh gốc, có thể bị mất mặt.`);
    return false;
  }
}

const heroPhoto = cfg.heroPhoto || {};
const portraitPhoto = cfg.portraitPhoto || {};
const heroCropped = makeCrop({
  from: heroPhoto.src || 'thanh-1.jpg', to: 'hero.jpg',
  ratioW: 16, ratioH: 9, cropY: Number(heroPhoto.cropY ?? 300), label: 'ảnh hero 16:9',
});
const portraitCropped = makeCrop({
  from: portraitPhoto.src || 'thanh-2.jpg', to: 'thanh-portrait.jpg',
  ratioW: 4, ratioH: 5, cropY: Number(portraitPhoto.cropY ?? 120), label: 'ảnh chân dung 4:5',
});

const HERO_IMG = heroCropped ? '/media/hero.jpg' : `/media/${heroPhoto.src || 'thanh-1.jpg'}`;
const PORTRAIT_IMG = portraitCropped ? '/media/thanh-portrait.jpg' : `/media/${portraitPhoto.src || 'thanh-2.jpg'}`;

const videoDir = path.join(PUBLIC, 'videos');
/**
 * Danh sách ô video lấy từ CẢ file .mp4 lẫn ảnh poster .jpg.
 *
 * Khi phát qua YouTube (bắt buộc trên Cloudflare vì file 25 MB vượt giới hạn
 * của Workers Assets) thì repo chỉ giữ poster, không giữ mp4 — nếu chỉ đếm
 * .mp4 thì toàn bộ ô video biến mất khỏi trang.
 */
const videos = fs.existsSync(videoDir)
  ? [...new Set(fs.readdirSync(videoDir)
      .filter((f) => /\.(mp4|jpg)$/i.test(f))
      .map((f) => f.replace(/\.(mp4|jpg)$/i, '')))].sort()
  : [];
if (!videos.length) warnings.push('Chưa có video nào trong public/videos — bỏ poster vào rồi build lại.');

// Video có thể phát từ YouTube (nhẹ, hợp Vercel) hoặc từ file mp4 tự host (hợp VPS)
const videoBase = String(cfg.videoBaseUrl || '').replace(/\/$/, '');
const youtubeIds = new Set();

const VID = (id) => {
  const yt = String(cfg.youtube?.[id] || '').trim();
  // Chấp nhận dán cả đường dẫn đầy đủ lẫn ID trần
  const ytId = yt && (yt.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1]
    ?? (/^[\w-]{11}$/.test(yt) ? yt : ''));
  if (ytId) youtubeIds.add(id);
  return {
    id,
    youtube: ytId || '',
    // Không có ID YouTube mà cũng không có file mp4 thì để trống, tránh thẻ
    // <video> trỏ vào đường dẫn 404.
    src: ytId || !fs.existsSync(path.join(videoDir, `${id}.mp4`))
      ? '' : `${videoBase}/videos/${id}.mp4`,
    poster: fs.existsSync(path.join(videoDir, `${id}.jpg`)) ? `${videoBase}/videos/${id}.jpg` : '',
    caption: cfg.videoCaptions?.[id] || '',
  };
};

/** Lấy `count` video liên tiếp từ vị trí `start` (vòng lại nếu thiếu). */
const slice = (start, count) =>
  videos.length ? Array.from({ length: count }, (_, i) => VID(videos[(start + i) % videos.length])) : [];

// Gán video cho từng ô trong 4 dải thumbnail của trang
const videoAssign = {};
slice(0, 6).forEach((v, i) => { videoAssign[`fc2-vw-${i + 1}`] = v; });
slice(6, 4).forEach((v, i) => { videoAssign[`fc2-vw2-${i + 1}`] = v; });
slice(10, 3).forEach((v, i) => { videoAssign[`fc2-vw3-${i + 1}`] = v; });
slice(1, 5).forEach((v, i) => { videoAssign[`fc2-vw4-${i + 1}`] = v; });

const heroVideo = videos.includes(cfg.heroVideo) ? VID(cfg.heroVideo) : (videos[0] ? VID(videos[0]) : null);

// ------------------------------------------------------------ 2. Đọc nguồn
const src = fs.readFileSync(path.join(SRC, 'AIAgentChallengeForma.dc.html'), 'utf8');

const helmetStyle = (src.match(/<helmet>[\s\S]*?(<style>[\s\S]*?<\/style>)/) || [])[1] || '';
const helmetScript = (src.match(/<\/style>\s*(<script>[\s\S]*?<\/script>)\s*<\/helmet>/) || [])[1] || '';
let body = (src.match(/<div class="fc2"[\s\S]*<\/footer>/) || [])[0];
if (!body) throw new Error('Không tìm thấy phần thân .fc2 trong file thiết kế.');

/** ------------------------------------------------------------------
 * Ô còn trống: hiện khung gạch đứt kèm nhãn, để nhìn là biết cần bỏ gì vào.
 * Khi chạy thật thì đặt showPlaceholders = false trong site.config.json.
 * Mỗi ô trống đều được ghi vào cảnh báo cuối lượt build.
 * ------------------------------------------------------------------ */
const SHOW_PH = cfg.showPlaceholders !== false;
const emptySlots = [];

function placeholder({ label, hint = '', ratio = '', minHeight = '120px' }) {
  emptySlots.push(label);
  if (!SHOW_PH) return '';
  return `<div role="img" aria-label="Chỗ trống: ${esc(label)}" style="`
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;'
    + 'border:2px dashed rgba(200,130,20,.55);background:rgba(220,150,20,.07);border-radius:14px;'
    + `padding:18px 16px;min-height:${minHeight};${ratio ? `aspect-ratio:${ratio};` : ''}`
    + 'font-family:Inter,system-ui,sans-serif;color:#8a5a00;box-sizing:border-box">'
    + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.8" cy="9" r="1.6"/>'
    + '<path d="m21 15-4.5-4.5L7 20"/></svg>'
    + `<span style="font-size:13px;font-weight:700;line-height:1.4">${esc(label)}</span>`
    + (hint ? `<span style="font-size:12px;line-height:1.45;opacity:.85">${esc(hint)}</span>` : '')
    + '</div>';
}

// ------------------------------------------------------------ 3. image-slot -> thật
const attr = (raw, name) => (raw.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || '';

/** Thuộc tính data-* để JS biết phát video từ đâu. */
const videoAttrs = (v) =>
  (v.youtube ? ` data-youtube="${esc(v.youtube)}"` : ` data-video="${esc(v.src)}"`)
  + ` data-poster="${esc(v.poster)}" data-caption="${esc(v.caption)}"`;
const THUMB_STYLE = 'width:100%;height:100%;object-fit:cover;display:block;cursor:pointer';
let filledVideo = 0;
let removedEmpty = 0;

body = body.replace(/<image-slot\b([^>]*)><\/image-slot>/g, (match, raw) => {
  const id = attr(raw, 'id');
  const imgSrc = attr(raw, 'src').replace(/^\.\//, '/');
  const alt = attr(raw, 'placeholder').replace(/^🟡\s*/, '').replace(/\[\[.*?\]\]/g, '').trim();

  // Ô VSL ở hero (16:9)
  if (id === 'fc2-vsl') {
    if (!heroVideo) return `<img src="${HERO_IMG}" alt="${esc(alt)}" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;display:block">`;
    return `<img class="fc2-vthumb" role="button" tabindex="0"${videoAttrs(heroVideo)}`
      + ` src="${HERO_IMG}" alt="Xem video giới thiệu" fetchpriority="high" style="${THUMB_STYLE}">`;
  }

  // Ô video học viên (9:16)
  const v = videoAssign[id];
  if (v) {
    filledVideo++;
    return `<img class="fc2-vthumb" role="button" tabindex="0"${videoAttrs(v)}`
      + ` src="${v.poster || imgSrc || '/media/thanh-2.jpg'}"`
      + ` alt="${esc(v.caption || 'Video feedback của học viên')}" loading="lazy" width="540" height="960"`
      + ` style="${THUMB_STYLE}">`;
  }

  // Ảnh chụp màn hình feedback — bấm vào xem được ảnh đầy đủ
  if (imgSrc) {
    return `<img class="fc2-imgthumb" role="button" tabindex="0" data-image="${imgSrc}"`
      + ` src="${imgSrc}" alt="${esc(alt)}" loading="lazy"`
      + ' style="width:100%;height:100%;object-fit:cover;object-position:top;display:block;cursor:zoom-in">';
  }

  removedEmpty++;
  return '<!--EMPTY-->';
});

// Gỡ hẳn thẻ bao quanh ô feedback trống (ô thứ 6 không có ảnh)
body = body.replace(
  /<div><div style="border-radius:10px;overflow:hidden"><!--EMPTY--><\/div><div style="padding:12px 16px;font-size:13px;font-weight:600">[^<]*<\/div><\/div>/g,
  () => '',
);
body = body.replace(/<!--EMPTY-->/g, '');

// Dải chữ chạy trên cùng: bản thiết kế để nghiêng -0.4°, đổi lại thành ngang
body = body.replace(
  '<div style="overflow:hidden;background:#1a1a1a;padding:10px 0;transform:rotate(-.4deg)">',
  '<div style="overflow:hidden;background:#1a1a1a;padding:10px 0">',
);

// Bỏ dải video "Thêm học viên đã đi qua 21 ngày" ở cuối phần từ chối
{
  const before = body.length;
  body = body.replace(
    /<div style="max-width:1400px;margin:0 auto;padding:0 24px 64px">\n<div style="font-size:13px;font-weight:600;color:#55555c;margin-bottom:12px">Thêm học viên đã đi qua 21 ngày<\/div>\n<div class="fc2-scroll">\n(?:<div [^\n]*\n)+<\/div>\n<\/div>\n/,
    '',
  );
  if (body.length === before) warnings.push('Không tìm thấy dải video "Thêm học viên đã đi qua 21 ngày" để gỡ.');
}

// Thumbnail video to hơn cho dễ nhìn
body = body.replace(/flex-shrink:0;width:200px;aspect-ratio:9\/16/g, 'flex-shrink:0;width:300px;aspect-ratio:9/16');
body = body.replace(/flex-shrink:0;width:160px;aspect-ratio:9\/16/g, 'flex-shrink:0;width:240px;aspect-ratio:9/16');

/**
 * Nút play hai lớp của bản thiết kế: vòng ngoài mờ blur, vòng trong gradient
 * xanh, tam giác trắng. Tách thành hàm để trang workshop dùng đúng cái đang
 * có trên trang bán, thay vì vẽ lại một nút khác.
 */
function playOverlay(size) {
  const outer = size === 'lg' ? 92 : 58;
  const inner = size === 'lg' ? 62 : 40;
  const icon = size === 'lg' ? 24 : 16;
  return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">'
    + `<div style="background:rgba(255,255,255,.3);backdrop-filter:blur(6px);border-radius:9999px;width:${outer}px;height:${outer}px;display:flex;align-items:center;justify-content:center">`
    + `<div style="background:linear-gradient(180deg,#3d9962,#2f7a4d);box-shadow:0 6px 16px rgba(0,0,0,.25);border-radius:9999px;width:${inner}px;height:${inner}px;display:flex;align-items:center;justify-content:center">`
    + `<svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`
    + '</div></div></div>';
}

/** Nút dừng/chạy cho các dải tự chạy — WCAG 2.2.2 yêu cầu có cách dừng. */
function pauseButton() {
  return '<button type="button" class="fc2-pause" data-pause aria-pressed="false">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">'
    + '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
    + '<span data-pause-label>Tạm dừng</span></button>';
}

// Các dải video: đổi từ "kéo tay" sang marquee tự chạy.
// Nhân đôi nội dung để vòng lặp liền mạch; bản sao đánh dấu data-clone
// để trình phát không đếm trùng khi bấm mũi tên qua lại.
let marquees = 0;
body = body.replace(/<div class="fc2-scroll">\n((?:<div [^\n]*\n)+)<\/div>/g, (m, items) => {
  const count = (items.match(/^<div /gm) || []).length;
  if (!count) return m;
  marquees++;
  const clone = items
    .replace(/class="fc2-vthumb"/g, 'class="fc2-vthumb" data-clone="1"')
    .replace(/^<div /gm, '<div aria-hidden="true" ');
  const seconds = Math.max(24, count * 7);
  // Nội dung tự chạy bắt buộc phải có nút dừng (WCAG 2.2.2) — hover thôi là chưa đủ,
  // người dùng bàn phím và người dùng chạm không hover được.
  return `<div class="fc2-marqwrap">${pauseButton()}`
    + `<div class="fc2-vmarquee"><div class="fc2-vtrack" style="animation-duration:${seconds}s">\n${items}${clone}</div></div>`
    + '</div>';
});

/**
 * Bọc phần tử bắt đầu bằng `openTag` (kể cả thẻ đóng đúng của nó) vào trong
 * `before` … `after`. Đếm thẻ <div>/</div> để tìm đúng thẻ đóng — không dùng
 * regex quét, vì regex luôn dừng ở thẻ đóng đầu tiên gặp được.
 */
function wrapDiv(html, openTag, before, after) {
  const start = html.indexOf(openTag);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { i = m.index + m[0].length; break; }
  }
  if (depth !== 0) return null;
  return html.slice(0, start) + before + html.slice(start, i) + after + html.slice(i);
}

/** Dải thẻ nhận xét cũng tự chạy — gắn cùng một nút dừng. */
{
  const wrapped = wrapDiv(body, '<div class="fc2-cardmarquee">',
    `<div class="fc2-marqwrap">${pauseButton()}`, '</div>');
  if (wrapped) body = wrapped;
  else warnings.push('Không gắn được nút tạm dừng cho dải thẻ nhận xét.');
}

// Ảnh feedback: dựng lại từ site.config.json, một hàng ngang, ô trống hiện placeholder
{
  const items = (cfg.feedbackImages?.items || []).filter((x) => x && (x.src || x.caption));
  const cards = items.map((it) => {
    const src = String(it.src ?? '').trim();
    const caption = String(it.caption ?? '').trim();
    const khung = src
      ? `<div class="fc2-shadow" style="border-radius:12px;overflow:hidden;aspect-ratio:3/4;background:#fff">`
        + `<img class="fc2-imgthumb" role="button" tabindex="0" data-image="/media/${esc(src)}"`
        + ` src="/media/${esc(src)}" alt="${esc(caption || 'Ảnh chụp feedback học viên')}" loading="lazy"`
        + ' style="width:100%;height:100%;object-fit:cover;object-position:top;display:block;cursor:zoom-in"></div>'
      : placeholder({
        label: caption || 'Ảnh feedback',
        hint: 'Bỏ file vào public/media/ rồi ghi tên vào feedbackImages',
        ratio: '3/4',
      });
    if (!khung) return '';
    return `<div>${khung}<div style="padding:7px 2px;font-size:12px;line-height:1.4;color:#4a4a52">${esc(caption)}</div></div>`;
  }).filter(Boolean).join('\n');

  const truoc = body.length;
  body = body.replace(
    /<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:700px">[\s\S]*?<\/div>\n<\/div>\n\n<div style="max-width:1400px/,
    `<div class="fc2-fbgrid">\n${cards}\n</div>\n</div>\n\n<div style="max-width:1400px`,
  );
  if (body.length === truoc) warnings.push('Không dựng được lưới ảnh feedback từ config.');
  else console.log(`  · Ảnh feedback: ${items.filter((x) => x.src).length} ảnh + ${items.filter((x) => !x.src).length} ô trống`);
}


// Mục "Tại sao anh chị nên nghe Thành" — thêm ảnh Thành bên trái
{
  const before = body.length;
  body = body.replace(
    '<div style="display:grid;gap:22px;max-width:760px">',
    '<div class="fc2-why" style="display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:36px;align-items:start">'
    + `<img src="${PORTRAIT_IMG}" alt="Đỗ Mạnh Thành" loading="lazy" class="fc2-shadow"`
    + ' style="width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:28px;display:block">'
    + '<div style="display:grid;gap:22px">',
  );
  if (body.length === before) warnings.push('Không chèn được ảnh Thành vào mục "Tại sao anh chị nên nghe Thành".');
  else body = body.replace(
    /(Dạy Content thuần trước[^<]*<\/div><\/div>)\s*<\/div>/,
    '$1</div></div>',
  );
}

// Sửa câu chữ theo site.config.json → textOverrides
for (const [from, to] of Object.entries(cfg.textOverrides || {})) {
  if (!from || !to) continue;
  if (!body.includes(from)) {
    warnings.push(`textOverrides: không tìm thấy câu gốc "${from}" trên trang.`);
    continue;
  }
  body = body.split(from).join(esc(to));
}

// ------------------------------------------------------------ 4. Placeholder trong copy
// Học bổng [[tên]]
if (cfg.scholarshipName) {
  body = body.replace(/học bổng <b>\[\[tên\]\]<\/b>/g, `học bổng <b>${esc(cfg.scholarshipName)}</b>`);
} else {
  body = body.replace(/học bổng <b>\[\[tên\]\]<\/b>/g, 'học bổng');
  warnings.push('scholarshipName trống — câu "học bổng [[tên]]" đã rút gọn thành "học bổng".');
}

// Ngành nghề trong testimonial
if (cfg.testimonialIndustry) {
  body = body.replace(/\[\[ngành\]\]/g, esc(cfg.testimonialIndustry));
} else {
  body = body.replace(/Chủ cửa hàng \[\[ngành\]\]/g, 'Chủ cửa hàng');
  warnings.push('testimonialIndustry trống — đã rút gọn thành "Chủ cửa hàng".');
}

// Khối 4 ô số liệu ở cuối trang
const stats = (cfg.stats || []).map((s) => String(s.value ?? '').trim());
if (stats.length === 4 && stats.every(Boolean)) {
  let i = 0;
  body = body.replace(/<div style="font-size:28px;font-weight:800">\[\[X\]\]<\/div>/g,
    () => `<div style="font-size:28px;font-weight:800">${esc(stats[i++])}</div>`);
} else {
  const before = body.length;
  body = body.replace(
    /<div style="display:grid;grid-template-columns:repeat\(4,1fr\);gap:16px;max-width:900px;margin:0 auto 32px">[\s\S]*?bài Thành đã sửa<\/div><\/div>\s*<\/div>\s*/,
    '',
  );
  if (body.length < before) warnings.push('stats chưa điền đủ 4 giá trị — đã ẩn khối 4 ô số liệu ở cuối trang.');
}

// Dòng "Còn [[X]]/30 chỗ · Khai giảng [[ngày]]" -> render động từ API
body = body.replace(
  /<p style="font-size:14px;color:#55555c;margin-top:16px">Còn <b>\[\[X\]\]<\/b>\/30 chỗ · Khai giảng <b>\[\[ngày\]\]<\/b><\/p>/,
  '<p style="font-size:14px;color:#55555c;margin-top:16px" data-seats-line></p>',
);

// Chính sách nộp bù
if (cfg.makeupPolicy) {
  body = body.replace(/\[\[[^\]]*cần chốt\]\]/g, esc(cfg.makeupPolicy));
} else {
  warnings.push('makeupPolicy trống — chính sách nộp bù khi trễ hạn chưa được chốt, trang đang bỏ trống chỗ này.');
  body = body.replace(/\s*🟡?\s*\[\[[^\]]*cần chốt\]\]/g, '');
  body = body.replace(/Không đứt chuỗi ngay\.\s*🟡/g, 'Không đứt chuỗi ngay.');
}

// ---- Emoji đang đóng vai icon ----
// Trình đọc màn hình đọc "backhand index pointing right" trước mỗi gạch đầu dòng.
// Dấu 👉 lặp 13 lần đúng là icon nên thay bằng SVG; số còn lại là trang trí nên ẩn đi.
const ARROW_SVG = '<span aria-hidden="true" style="flex-shrink:0;display:inline-flex;align-items:center;height:1.6em">'
  + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#26643f" stroke-width="2.4"'
  + ' stroke-linecap="round" stroke-linejoin="round" focusable="false">'
  + '<path d="M5 12h13M12 5l7 7-7 7"/></svg></span>';

let emojiFixed = 0;
body = body.replace(/<span>👉<\/span>/g, () => { emojiFixed++; return ARROW_SVG; });
body = body.replace(/<li style="([^"]*)"><span>👉<\/span>/g,
  (m, st) => { emojiFixed++; return `<li style="${st}">${ARROW_SVG}`; });
body = body.replace(/👉/g, () => { emojiFixed++; return ARROW_SVG; });

// Dấu 🟡 giữa câu là ký hiệu "chỗ cần điền" của bản thiết kế, không phải nội dung
body = body.replace(/\s*🟡\s*/g, ' ');

/** Icon SVG thay cho emoji, giữ nguyên kích thước thị giác. */
const svgIcon = (path, size, color) =>
  `<span aria-hidden="true" style="display:inline-flex;align-items:center;flex-shrink:0">`
  + `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}"`
  + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${path}</svg></span>`;

const MEDAL = '<circle cx="12" cy="15" r="6"/><path d="M12 12.5v5M9.5 15h5" stroke-width="1.6"/>'
  + '<path d="M8.2 8 5.5 3h13L15.8 8"/>';
const WARN = '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.5v.01"/>';
const LOCK = '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>';

// 🎖️ trên thẻ "Về đích đúng hạn"
body = body.replace(/<span style="font-size:22px">🎖️?<\/span>/g, svgIcon(MEDAL, 24, '#191919'));
// ⚠️ ở tiêu đề khối từ chối
body = body.replace(/(<h3[^>]*>)⚠️?\s*/g,
  (m, open) => `${open}<span style="display:inline-flex;align-items:center;gap:10px">${svgIcon(WARN, 22, '#26643f')}</span> `);
// 🔒 ở dòng cam kết hoàn tiền
body = body.replace(/🔒\s*/g, `${svgIcon(LOCK, 16, '#26643f')} `);

// Sao đánh giá: ẩn ký tự khỏi trình đọc, thay bằng câu đọc được
body = body.replace(/(<div style="color:#f0a500;font-size:14px;letter-spacing:1px">)(★★★★★)(<\/div>)/,
  '$1<span aria-hidden="true">$2</span><span style="position:absolute;width:1px;height:1px;overflow:hidden;'
  + 'clip:rect(0 0 0 0);white-space:nowrap">Đánh giá 5 trên 5 sao</span>$3');

// Dấu ✓ trong huy hiệu tròn ở hero chỉ để trang trí
body = body.replace(/(font-size:14px[^"]*")(>✓<\/div>)/g, '$1 aria-hidden="true"$2');

// Câu chốt "Đã đến lúc bứt ra khỏi cảnh đó": bản thiết kế gạch chân bằng một
// nét SVG nguệch ngoạc, nhìn rối. Đổi sang vệt bút dạ nằm sau chữ (xem .fc2-mark).
{
  const before = body.length;
  body = body.replace(
    /<span style="position:relative;display:inline-block">(Đã đến lúc bứt ra khỏi cảnh đó\.)\s*<svg viewBox="0 0 300 20"[\s\S]*?<\/svg>\s*<\/span>/,
    '<span class="fc2-mark">$1</span>',
  );
  if (body.length === before) warnings.push('Không đổi được kiểu highlight cho câu chốt.');
}

// ------------------------------------------------------------ 4a. Các khối nội dung mới
const SECTION = 'max-width:1400px;margin:0 auto;padding:0 24px 64px';
const EYEBROW = 'font-size:13px;font-weight:700;color:#2f7a4d;margin-bottom:10px';

/** Ví dụ nổi bật — đặt ngay dưới hero để đọc là thấy ngay bằng chứng. */
function caseStudyBlock() {
  const c = cfg.caseStudy || {};
  if (!String(c.stat ?? '').trim()) { warnings.push('caseStudy trống — đã ẩn khối ví dụ dưới hero.'); return ''; }
  const chips = (c.chips || []).map((t) =>
    `<span style="background:rgba(255,255,255,.14);border-radius:9999px;padding:6px 14px;font-size:14px;font-weight:600">${esc(t)}</span>`).join('');
  return `
<div style="${SECTION}">
  <div class="fc2-shadow fc2-reveal" style="background:#1a1a1a;color:#fff;border-radius:36px;padding:38px 40px;display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:40px;align-items:center" data-case>
    <div>
      <div style="font-size:54px;font-weight:800;line-height:1;color:#a8d98d">${esc(c.stat)}</div>
      <div style="font-size:14px;opacity:.7;margin-top:8px">${esc(c.statLabel || '')}</div>
    </div>
    <div>
      ${c.eyebrow ? `<div style="font-size:13px;font-weight:700;color:#a8d98d;margin-bottom:10px">${esc(c.eyebrow)}</div>` : ''}
      <p style="font-size:19px;line-height:1.65;margin:0 0 18px">${esc(c.text || '')}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${chips}</div>
    </div>
  </div>
</div>`;
}

/** "Đi từ gốc": con người mình -> kênh (công cụ) -> sự nghiệp. */
function positioningBlock() {
  const p = cfg.positioning || {};
  if (!String(p.heading ?? '').trim()) { warnings.push('positioning trống — đã ẩn khối "Xây kênh là xây mình".'); return ''; }
  const steps = (p.steps || []).map((s, i) => `
    <div class="fc2-step fc2-reveal" style="background:#fff;border-radius:28px;padding:28px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="width:30px;height:30px;border-radius:9999px;background:#2f7a4d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${i + 1}</span>
        <span style="font-size:12px;font-weight:700;color:#2f7a4d;text-transform:uppercase;letter-spacing:.04em">${esc(s.label || '')}</span>
      </div>
      <div style="font-size:22px;font-weight:800;margin-bottom:10px">${esc(s.title || '')}</div>
      <div style="font-size:16px;line-height:1.65;color:#55555c">${esc(s.text || '')}</div>
    </div>`).join('');
  return `
<div style="${SECTION}">
  ${p.eyebrow ? `<div style="${EYEBROW}">${esc(p.eyebrow)}</div>` : ''}
  <h2 style="font-size:38px;font-weight:800;letter-spacing:-.02em;margin:0 0 16px">${esc(p.heading)}</h2>
  ${p.lead ? `<p style="font-size:18px;line-height:1.7;color:#333;margin:0 0 32px">${esc(p.lead)}</p>` : ''}
  <div class="fc2-steps" style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:stretch">${steps}</div>
  ${p.closing ? `<p style="font-size:20px;font-weight:700;line-height:1.6;margin:28px 0 0">${esc(p.closing)}</p>` : ''}
</div>`;
}

/** Lớp này hợp với ai. */
function audienceBlock() {
  const a = cfg.audience || {};
  const items = (a.items || []).filter((t) => String(t ?? '').trim());
  if (!String(a.heading ?? '').trim() || !items.length) return '';
  return `
<div style="${SECTION}">
  <div class="fc2-shadow" style="background:#a8d98d;border-radius:36px;padding:34px 38px">
    <h2 style="font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 18px">${esc(a.heading)}</h2>
    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:12px">
      ${items.map((t) => `<li style="display:flex;gap:12px;font-size:17px;line-height:1.65"><span aria-hidden="true" style="flex-shrink:0">✓</span><span>${esc(t)}</span></li>`).join('')}
    </ul>
  </div>
</div>`;
}

/** CLB Rèn Thân — Tâm — Trí. */
function clubBlock() {
  const c = cfg.club || {};
  if (!String(c.heading ?? '').trim()) { warnings.push('club trống — đã ẩn khối CLB.'); return ''; }
  const items = (c.items || []).map((it) => `
    <div style="border-top:2px solid rgba(47,122,77,.25);padding-top:16px">
      <div style="font-size:19px;font-weight:800;margin-bottom:8px">${esc(it.title || '')}</div>
      <div style="font-size:16px;line-height:1.65;color:#55555c">${esc(it.text || '')}</div>
    </div>`).join('');
  return `
<div style="${SECTION}">
  ${c.eyebrow ? `<div style="${EYEBROW}">${esc(c.eyebrow)}</div>` : ''}
  <h2 style="font-size:34px;font-weight:800;letter-spacing:-.02em;margin:0 0 16px">${esc(c.heading)}</h2>
  ${c.lead ? `<p style="font-size:18px;line-height:1.7;color:#333;margin:0 0 30px">${esc(c.lead)}</p>` : ''}
  <div class="fc2-steps" style="display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-bottom:26px">${items}</div>
  ${c.highlight ? `<div class="fc2-shadow" style="background:#fff;border-radius:24px;padding:26px 28px;font-size:17px;line-height:1.7">${esc(c.highlight)}</div>` : ''}
</div>`;
}

/**
 * Chèn HTML ngay TRƯỚC khối `<div style="max-width:1400px...">` chứa đoạn `marker`.
 * Dùng mốc cố định thay cho regex quét ngược — regex rất dễ dừng nhầm ở thẻ đóng
 * đầu tiên và nhét cả khối vào giữa một thumbnail video.
 */
function insertBeforeSection(marker, html, tenKhoi) {
  if (!html) return;
  const at = body.indexOf(marker);
  if (at < 0) { warnings.push(`Không tìm thấy mốc để chèn ${tenKhoi}.`); return; }
  const start = body.lastIndexOf('<div style="max-width:1400px', at);
  if (start < 0) { warnings.push(`Không tìm được đầu khối để chèn ${tenKhoi}.`); return; }
  body = body.slice(0, start) + html + '\n' + body.slice(start);
}

// Ví dụ nổi bật + "Xây kênh là xây mình" đặt trước phần nói về thực tế
insertBeforeSection('90% những ai làm nội dung sẽ thua',
  caseStudyBlock() + '\n' + positioningBlock(), 'khối ví dụ và "Xây kênh là xây mình"');

// "Hợp với ai" + CLB đặt trước phần Học phí
{
  const before = body.length;
  body = body.replace(/(<div id="hoc-phi")/, `${audienceBlock()}\n${clubBlock()}\n$1`);
  if (body.length === before) warnings.push('Không chèn được khối "Hợp với ai" và CLB.');
}

// ------------------------------------------------------------ 4b. FAQ từ cấu hình
{
  const items = (cfg.faq || []).filter((x) => String(x?.q ?? '').trim() && String(x?.a ?? '').trim());
  const missing = (cfg.faq || []).filter((x) => String(x?.q ?? '').trim() && !String(x?.a ?? '').trim());

  if (items.length) {
    const html = items.map((x, i) => `<details${i === 0 ? ' open=""' : ''}>`
      + `<summary>${esc(x.q)}</summary>`
      + `<p style="font-size:15px;line-height:1.7;color:#55555c;margin:0 0 20px">${esc(x.a)}</p>`
      + '</details>').join('\n');

    const before = body.length;
    body = body.replace(
      /(<div id="faq"[\s\S]*?<h2[^>]*>Các câu hỏi thường gặp<\/h2>\s*<div[^>]*>)[\s\S]*?(<\/div>\s*<\/div>)/,
      `$1\n${html}\n$2`,
    );
    if (body.length === before) warnings.push('Không thay được khối FAQ — kiểm tra lại build.mjs.');
    else console.log(`  · FAQ: ${items.length} câu hỏi`);
  }

  for (const x of missing) {
    warnings.push(`FAQ chưa có câu trả lời nên đang bị ẩn: "${x.q}"`);
  }
}

// ------------------------------------------------------------ 5. Footer
// Bản thiết kế để footer gần như trống. Dựng lại thành 3 cột: thương hiệu,
// liên hệ, chính sách — cộng khối pháp lý bắt buộc bên dưới.
//
// Tách thành hàm vì MỌI trang công khai đều cần footer này: khối pháp nhân là
// bắt buộc theo luật thương mại điện tử, không riêng trang có nút mua.
function buildFooter() {
  const L = cfg.legal || {};
  const P = cfg.policies || {};
  const F = cfg.footer || {};
  // Hotline KHÔNG nằm trong danh sách bắt buộc: luật đòi có phương thức liên hệ,
  // và email đã đáp ứng. Bắt buộc cả hotline thì thiếu số điện thoại là ẩn sạch
  // cả khối pháp nhân — tệ hơn nhiều so với hiện khối thiếu một dòng.
  const legalKeys = ['company', 'taxId', 'address', 'email'];
  const thieu = legalKeys.filter((k) => !String(L[k] ?? '').trim());

  const logoBlock = String(cfg.logo?.src ?? '').trim()
    ? `<img src="/media/${esc(cfg.logo.src)}" alt="${esc(cfg.logo.alt || cfg.brand)}"`
      + ' style="height:38px;width:auto;display:block;margin-bottom:12px">'
    : placeholder({ label: 'Logo', hint: 'Bỏ file vào public/media/ rồi ghi tên vào "logo.src"', minHeight: '64px' });

  const link = (label, url) => (url
    ? `<a href="${esc(url)}" style="color:#4a4a52;text-decoration:none;font-size:14px">${label}</a>`
    : `<span style="color:#8a5a00;font-size:14px">${label} <b>(chưa có link)</b></span>`);

  const chinhSach = [
    link('Chính sách bảo mật', P.privacy),
    link('Điều khoản sử dụng', P.terms),
    link('Chính sách hoàn tiền', P.refund),
    // Đường về cho người đã chuyển khoản rồi đóng tab. Để cạnh chính sách vì
    // đây cũng là chỗ người ta tìm khi thấy lúng túng.
    link('Tìm lại đơn của tôi', '/tra-cuu'),
  ].join('');
  const thieuChinhSach = ['privacy', 'terms', 'refund'].filter((k) => !String(P[k] ?? '').trim());
  const ghiChuChinhSach = `Link chính sách: ${thieuChinhSach.join(', ')}`;
  if (thieuChinhSach.length && !emptySlots.includes(ghiChuChinhSach)) {
    emptySlots.push(ghiChuChinhSach);
  }

  const zalo = String(cfg.contact?.zalo ?? '').trim();
  const email = String(cfg.contact?.email ?? '').trim();
  const lienHe = (zalo || email)
    ? `<div style="display:grid;gap:8px;font-size:14px">
${zalo ? `<a href="https://zalo.me/${esc(zalo.replace(/\D/g, ''))}" style="color:#26643f;text-decoration:none;font-weight:600">Zalo: ${esc(zalo)}</a>` : ''}
${email ? `<a href="mailto:${esc(email)}" style="color:#26643f;text-decoration:none;font-weight:600">${esc(email)}</a>` : ''}
</div>`
    : placeholder({ label: 'Zalo và email hỗ trợ', hint: 'Điền "contact.zalo" và "contact.email" trong site.config.json', minHeight: '78px' });

  const khoiPhapLy = thieu.length === 0
    ? `<div style="font-size:14px;color:#4a4a52;line-height:1.8">
<div><b style="color:#191919">${esc(L.company)}</b> · Mã số thuế: ${esc(L.taxId)}</div>
<div>${esc(L.address)}</div>
<div>${String(L.hotline ?? '').trim() ? `Hotline: <a href="tel:${esc(String(L.hotline).replace(/\s/g, ''))}" style="color:#26643f;text-decoration:none">${esc(L.hotline)}</a> · ` : ''}Email: <a href="mailto:${esc(L.email)}" style="color:#26643f;text-decoration:none">${esc(L.email)}</a></div>
${L.mocNotified ? '<div style="margin-top:4px">Đã thông báo với Bộ Công Thương.</div>' : ''}
</div>`
    : placeholder({
      label: 'Thông tin pháp nhân — BẮT BUỘC trước khi chạy quảng cáo',
      hint: `Còn thiếu: ${thieu.join(', ')}. Điền vào mục "legal" trong site.config.json.`,
      minHeight: '110px',
    });

  const footerMoi = `<footer style="border-top:1px solid rgba(25,25,25,.14);background:rgba(25,25,25,.03);padding:44px 24px 0">
<div style="max-width:1040px;margin:0 auto">
  <div class="fc2-footcols" style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:36px;margin-bottom:32px">
    <div>
      ${logoBlock}
      <div style="font-size:17px;font-weight:800;margin-bottom:6px">${esc(cfg.brand)}</div>
      ${F.tagline ? `<div style="font-size:14px;color:#4a4a52;line-height:1.6;max-width:34ch">${esc(F.tagline)}</div>` : ''}
    </div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#191919;margin-bottom:12px">Liên hệ</div>
      ${lienHe}
    </div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#191919;margin-bottom:12px">Chính sách</div>
      <div style="display:grid;gap:9px">${chinhSach}</div>
    </div>
  </div>

  <div style="border-top:1px solid rgba(25,25,25,.12);padding-top:24px;margin-bottom:20px">
    ${khoiPhapLy}
  </div>

  <div style="border-top:1px solid rgba(25,25,25,.12);padding:18px 0 104px;font-size:14px;color:#5c5c64;line-height:1.65">
    Trang này không hứa hẹn kết quả cụ thể. Kết quả tuỳ lĩnh vực, mức độ triển khai và thời gian mỗi người bỏ ra.
  </div>
</div>
</footer>`;

  return footerMoi;
}

{
  const footerMoi = buildFooter();
  const truoc = body.length;
  body = body.replace(/<footer[\s\S]*<\/footer>/, footerMoi);
  if (body.length === truoc) warnings.push('Không thay được footer.');
}

// ------------------------------------------------------------ 6. Khối đăng ký
// Mọi nút CTA giờ dẫn sang trang /dang-ky thay vì cuộn xuống trong trang
body = body.replace(/href="#dang-ky"/g, 'href="/dang-ky"');
const registerBlock = fs.readFileSync(path.join(PARTIALS, 'register.html'), 'utf8');
body = body.replace(
  /(<span style="font-size:38px;font-weight:800;position:relative;z-index:1">2\.000\.000đ<\/span>\s*<\/div>\s*<\/div>)/,
  `$1\n${registerBlock}`,
);
if (!body.includes('id="dang-ky"')) throw new Error('Không chèn được khối đăng ký #dang-ky vào trang.');

// ------------------------------------------------------------ 7. Ráp trang
const read = (f) => fs.readFileSync(path.join(PARTIALS, f), 'utf8');
const appCss = read('app.css');
const commonJs = read('common.js');
const lightbox = read('lightbox.html');

// Dọn CSS đi kèm bản thiết kế:
//  - Hiệu ứng hover gắn vào anchor #dang-ky — đổi theo đường dẫn trang mới
//  - Bỏ @import font (head đã nạp sẵn bằng preconnect + link, nhanh hơn)
//  - Bỏ hai keyframes chạy trên `left` và `box-shadow`. app.css đã thay bằng bản
//    chạy trên transform/opacity; để lại thì chỉ là quy tắc chết trong file.
const baseCss = helmetStyle
  .replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']*'\);?/, '')
  .replace(/a\[href="#dang-ky"\]/g, 'a[href="/dang-ky"]')
  .replace(/@keyframes fc2-glow\{0%\{left:-60%\}100%\{left:130%\}\}/, '')
  .replace(/@keyframes fc2-pulse\{0%,100%\{box-shadow:[^}]*\}50%\{box-shadow:[^}]*\}\}/, '');

/** Khung HTML dùng chung cho cả ba trang. */
/**
 * Địa chỉ gốc của trang, dùng để dựng URL tuyệt đối.
 *
 * og:image BẮT BUỘC tuyệt đối — Facebook và Zalo không đoán được host từ một
 * đường dẫn "/media/hero.jpg", nên chia sẻ link ra là hiện một ô trắng không
 * ảnh. Đây là lỗi im lặng: trang vẫn đúng, chỉ có phần xem trước lúc chia sẻ
 * là hỏng, mà đó lại đúng là thứ quyết định người ta có bấm vào hay không.
 */
const SITE_URL = String(cfg.siteUrl ?? '').replace(/\/$/, '');

const tuyetDoi = (duongDan) => {
  if (!duongDan) return '';
  if (/^https?:\/\//.test(duongDan)) return duongDan;
  if (!SITE_URL) return duongDan;   // chưa đặt siteUrl thì để nguyên, còn hơn dựng URL sai
  return SITE_URL + (duongDan.startsWith('/') ? duongDan : '/' + duongDan);
};

/**
 * `path` là đường dẫn của chính trang này ('/', '/workshop', …).
 *
 * canonical phải khác nhau theo từng trang. Trước đây nó lấy chung một giá trị
 * cfg.canonicalUrl cho MỌI trang — nghĩa là nếu điền vào thì mọi trang đều khai
 * với Google rằng "bản gốc của tôi là trang chủ", và các trang còn lại biến mất
 * khỏi kết quả tìm kiếm. Giá trị đó đang để trống nên chưa gây hại, nhưng đó là
 * một cái bẫy chờ người sau điền vào.
 */
function page({ title, description, body: pageBody, script, noindex = false, path = '' }) {
  const canonical = !noindex && SITE_URL && path ? SITE_URL + path : '';
  const ogImage = tuyetDoi(cfg.ogImage);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta property="og:locale" content="vi_VN">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f3ead9">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap">
${baseCss}
<style>
${appCss}
</style>
</head>
<body style="margin:0;background:#f3ead9;color:#191919">
${pageBody}
<script>
${commonJs}
${script}
</script>
</body>
</html>
`;
}

// ------------------------------------------------------------ 6a. Trang lead magnet /ban-do-21-ngay
function leadMagnetPage() {
  const lm = cfg.leadMagnet || {};
  if (!String(lm.headline ?? '').trim()) {
    warnings.push('leadMagnet trống trong site.config.json — bỏ qua, không build trang /ban-do-21-ngay.');
    return null;
  }
  const bullets = (lm.bullets || []).filter((t) => String(t ?? '').trim())
    .map((t) => `<li style="display:flex;gap:12px;font-size:16px;line-height:1.6"><span style="flex-shrink:0;color:#2f7a4d;font-weight:700">✓</span><span>${esc(t)}</span></li>`)
    .join('\n');

  let html = read('page-ban-do.html');
  const fill = {
    EYEBROW: esc(lm.eyebrow || ''),
    HEADLINE: esc(lm.headline || ''),
    SUBHEADLINE: esc(lm.subheadline || ''),
    LEAD: esc(lm.lead || ''),
    BULLETS: bullets,
    DOWNLOAD_LABEL: esc(lm.downloadLabel || 'Nhận tài liệu miễn phí'),
    ZALO_LABEL: esc(lm.zaloLabel || 'Vào nhóm Zalo'),
    FORM_NOTE: esc(lm.formNote || ''),
    THANKS_HEADLINE: esc(lm.thankYouHeadline || 'Đã nhận được thông tin của anh chị'),
    THANKS_TEXT: esc(lm.thankYouText || ''),
  };
  for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(v);

  return page({
    path: '/ban-do-21-ngay',
    title: lm.title || (lm.headline + ' | ' + cfg.brand),
    description: lm.description || lm.subheadline || '',
    body: html,
    script: read('ban-do.js'),
  });
}

const pages = {
  'index.html': page({
    path: '/',
    title: cfg.title,
    description: cfg.description,
    body: [body, lightbox, helmetScript].join('\n'),
    script: read('app.js'),
  }),
  'dang-ky.html': page({
    path: '/dang-ky',
    title: 'Đăng ký giữ chỗ — ' + cfg.brand,
    description: 'Điền thông tin để giữ chỗ Thử thách 21 ngày.',
    body: read('page-dang-ky.html'),
    script: read('dang-ky.js'),
    noindex: true,
  }),
  'thanh-toan.html': page({
    path: '/thanh-toan',
    title: 'Thanh toán — ' + cfg.brand,
    description: 'Quét mã QR để hoàn tất giữ chỗ.',
    body: read('page-thanh-toan.html'),
    script: read('thanh-toan.js'),
    noindex: true,
  }),
  // Khách đóng tab sau khi chuyển khoản thì mất dấu đơn của mình. Trang này là
  // đường về, và không cần email hay tài khoản gì cả.
  'tra-cuu.html': page({
    path: '/tra-cuu',
    title: 'Tìm lại đơn — ' + cfg.brand,
    description: 'Nhập số điện thoại để tìm lại đơn đăng ký của anh chị.',
    body: read('page-tra-cuu.html'),
    script: read('tra-cuu.js'),
    noindex: true,
  }),
  // Hai trang lấy lại mật khẩu. noindex: chúng không có gì cho Google, và một
  // trang đặt lại mật khẩu nằm trong kết quả tìm kiếm chỉ mời thêm người dò.
  'quen-mat-khau.html': page({
    title: 'Quên mật khẩu — ' + cfg.brand,
    description: 'Lấy lại quyền đăng nhập qua email.',
    body: read('page-quen-mat-khau.html'),
    script: read('quen-mat-khau.js'),
    noindex: true,
  }),
  'dat-lai-mat-khau.html': page({
    title: 'Đặt mật khẩu mới — ' + cfg.brand,
    description: 'Đặt mật khẩu mới cho tài khoản Góc Creator.',
    body: read('page-dat-lai-mat-khau.html'),
    script: read('dat-lai-mat-khau.js'),
    noindex: true,
  }),
  // Cổng học viên. Một file tĩnh dùng chung cho mọi học viên; mã truy cập nằm
  // trên đường dẫn và trang tự đọc lấy, nên không có gì riêng tư nằm trong file.
  'hoc.html': page({
    path: '/hoc',
    title: 'Hành trình 21 ngày — ' + cfg.brand,
    description: 'Nộp bài, xem nhận xét và đổi quà.',
    body: read('page-hoc.html'),
    script: read('hoc.js'),
    noindex: true,
  }),
};


// ------------------------------------------------------------ 6a2. Ba trang chính sách
/**
 * Ba trang chính sách sinh từ cùng một khung. Nội dung nằm trong site.config.json
 * → policyPages, nên sửa một câu trong chính sách không phải đụng vào mã.
 *
 * Bắt buộc theo luật thương mại điện tử, và cần thật sự đứng sau lời hứa hoàn
 * tiền in trên trang bán — chứ không phải một trang cho có.
 */
function policyPage(key) {
  const doc = (cfg.policyPages || {})[key];
  if (!doc || !Array.isArray(doc.sections) || doc.sections.length === 0) {
    warnings.push(`policyPages.${key} trống — bỏ qua, không build trang chính sách này.`);
    return null;
  }

  // **in đậm** là cú pháp duy nhất được phép trong nội dung chính sách. Mọi thứ
  // khác đã thoát HTML, nên không dán được thẻ lạ vào trang từ file cấu hình.
  const rich = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(25,25,25,.06);padding:2px 6px;'
      + 'border-radius:6px;font-size:.92em">$1</code>');

  const sections = doc.sections.map((sec, i) => {
    const ps = (sec.paragraphs || []).filter((t) => String(t ?? '').trim());
    // Mục nào toàn câu ngắn thì trình bày thành danh sách gạch đầu dòng — dễ
    // đọc hơn hẳn một khối chữ liền trên điện thoại.
    const asList = ps.length >= 3 && ps.every((t) => String(t).length < 190);
    const body = asList
      ? `<ul style="display:grid;gap:9px;margin:0;padding-left:20px">`
        + ps.map((t) => `<li style="font-size:16px;line-height:1.75;color:#3a3a42">${rich(t)}</li>`).join('')
        + `</ul>`
      : ps.map((t) => `<p style="font-size:16px;line-height:1.8;color:#3a3a42;margin:0 0 14px">${rich(t)}</p>`).join('');

    return `<section style="margin-bottom:34px">
<h2 style="font-family:Oswald,sans-serif;text-transform:uppercase;font-size:20px;font-weight:600;letter-spacing:.02em;margin:0 0 12px">
<span style="color:#2f7a4d">${String(i + 1).padStart(2, '0')}</span> ${esc(sec.heading)}</h2>
${body}
</section>`;
  }).join('\n');

  const others = [
    ['privacy', 'Chính sách bảo mật', '/chinh-sach-bao-mat'],
    ['terms', 'Điều khoản sử dụng', '/dieu-khoan'],
    ['refund', 'Chính sách hoàn tiền', '/chinh-sach-hoan-tien'],
  ].filter(([k]) => k !== key)
   .map(([, label, href]) => `<a href="${href}" style="color:#26643f;font-weight:600;text-decoration:none">${label}</a>`)
   .join('<span style="color:#a8a5b0">·</span>');

  const duongDan = { privacy: '/chinh-sach-bao-mat', terms: '/dieu-khoan', refund: '/chinh-sach-hoan-tien' }[key];
  return page({
    path: duongDan,
    title: `${doc.title} — ${cfg.brand}`,
    description: String(doc.intro ?? doc.title),
    noindex: false,
    body: `<div class="fc2" style="background:#f3ead9;color:#191919;min-height:100vh">
  <div style="max-width:720px;margin:0 auto;padding:32px 22px 72px">
    <a href="/" style="display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#55555c;text-decoration:none;margin-bottom:26px">← Về trang chủ</a>
    <h1 style="font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-.02em;margin:0 0 10px">${esc(doc.title)}</h1>
    ${doc.intro ? `<p style="font-size:17px;line-height:1.7;color:#55555c;margin:0 0 34px">${rich(doc.intro)}</p>` : ''}
    ${sections}
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:14px;border-top:1px solid rgba(25,25,25,.1);padding-top:22px">
      ${others}
    </div>
  </div>
${buildFooter()}
</div>`,
    script: '',
  });
}

// ------------------------------------------------------------ 6b. Trang workshop /workshop
function workshopPage() {
  const w = cfg.workshop || {};
  if (w.enabled === false || !String(w.headline ?? '').trim()) {
    warnings.push('workshop trống hoặc đang tắt trong site.config.json — bỏ qua, không build trang /workshop.');
    return null;
  }

  const bullet = (t) => `<li style="display:flex;gap:12px;font-size:17px;line-height:1.65">`
    + `<span style="flex-shrink:0;color:#2f7a4d;font-weight:700">✓</span><span>${esc(t)}</span></li>`;
  const dash = (t) => `<li style="display:flex;gap:12px;font-size:17px;line-height:1.65">`
    + `<span style="flex-shrink:0;color:#67676f">—</span><span>${esc(t)}</span></li>`;

  const list = (arr, fn) => (arr || []).filter((t) => String(t ?? '').trim()).map(fn).join('\n');

  // Ngày giờ chỉ hiện dòng nào đã điền — trường trống thì ẩn hẳn, không bao
  // giờ hiện chỗ trống cho khách thấy.
  const whenRows = [
    ['Ngày', w.dateText],
    ['Thời gian', w.timeText],
    ['Hình thức', w.formatText],
  ].filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => `<div style="display:flex;gap:10px;font-size:16px;line-height:1.6">`
      + `<span style="min-width:88px;color:#67676f">${esc(k)}</span>`
      + `<b style="color:#191919">${esc(v)}</b></div>`)
    .join('\n');
  if (!whenRows) emptySlots.push('Ngày giờ workshop — điền "workshop.dateText" và "workshop.timeText"');

  const agenda = (w.agenda || []).filter((a) => String(a?.title ?? '').trim()).map((a) => `
    <div class="fc2-shadow" style="background:#fff;border-radius:20px;padding:22px 24px">
      <div style="font-size:12px;font-weight:700;color:#2f7a4d;letter-spacing:.06em;margin-bottom:8px">${esc(a.label || '')}</div>
      <h3 style="font-size:21px;font-weight:800;margin:0 0 8px">${esc(a.title)}</h3>
      <p style="font-size:16px;line-height:1.7;color:#4a4a52;margin:0">${esc(a.text || '')}</p>
    </div>`).join('\n');

  const ticker = (w.ticker || []).filter(Boolean);
  const tickerHtml = ticker.length
    ? [...ticker, ...ticker].map((t) => `<span>${esc(t)}</span>`).join('\n')
    : '';

  const closing = String(w.closing ?? '').trim()
    ? `<p style="font-size:19px;line-height:1.6;font-weight:600;color:#191919;border-left:3px solid #2f7a4d;padding-left:18px;margin:0">${esc(w.closing)}</p>`
    : '';

  // Ảnh minh chứng: chỉ lấy file thật có trong public/media, thiếu thì bỏ qua ô
  // đó thay vì để khung vỡ.
  const proofImgs = (w.proofImages || [])
    .filter((x) => x && String(x.src ?? '').trim()
      && fs.existsSync(path.join(MEDIA_OUT, String(x.src).trim())))
    // KHÔNG ép khung cố định: ảnh chụp màn hình ở đây phần lớn là ảnh ngang
    // (tỉ lệ 1.3–1.7), nhét vào khung dọc 4:5 thì object-fit cắt mất chữ hai bên
    // và bằng chứng thành vô nghĩa. Để mỗi ảnh giữ đúng tỉ lệ của nó.
    .map((x) => `<figure style="margin:0;flex:0 0 250px">
      <div class="fc2-shadow" style="border-radius:12px;overflow:hidden;background:#e7dcc6;line-height:0">
        <img class="fc2-imgthumb" role="button" tabindex="0" data-image="/media/${esc(x.src)}"
             src="/media/${esc(x.src)}" alt="${esc(x.caption || 'Ảnh chụp màn hình phản hồi của học viên')}"
             loading="lazy" style="width:100%;height:auto;display:block;cursor:zoom-in">
      </div>
      ${x.caption ? `<figcaption style="font-size:12.5px;color:#4a4a52;margin-top:7px;line-height:1.5">${esc(x.caption)}</figcaption>` : ''}
    </figure>`).join('\n');

  if ((w.proofImages || []).length && !proofImgs) {
    warnings.push('Trang workshop: không tìm thấy ảnh nào trong "workshop.proofImages" — đã ẩn khối bằng chứng.');
  }

  // Một hàng cuộn ngang: ảnh chụp tin nhắn là bằng chứng phụ, không nên chiếm
  // hai hàng giữa trang. Bấm vào mở ảnh đầy đủ trong lightbox.
  const proofBlock = proofImgs
    ? `<div style="margin:8px 0 44px">
        <h2 style="font-size:28px;font-weight:800;margin:0 0 8px">${esc(w.proofHeading || '')}</h2>
        ${w.proofNote ? `<p style="font-size:15px;line-height:1.7;color:#4a4a52;margin:0 0 18px">${esc(w.proofNote)}</p>` : ''}
        <div class="fc2-wsproof">${proofImgs}</div>
      </div>`
    : '';

  const hostStats = (w.hostStats || [])
    .filter((x) => String(x?.value ?? '').trim())
    .map((x) => `<div><div style="font-family:Oswald,sans-serif;font-size:26px;font-weight:700;color:#2f7a4d">${esc(x.value)}</div>`
      + `<div style="font-size:14px;color:#4a4a52">${esc(x.label || '')}</div></div>`)
    .join('\n');

  /**
   * Dải video học viên — dùng lại đúng thumbnail, lightbox và nút tạm dừng của
   * trang bán, nên bấm vào là mở trình phát y như bên đó.
   * Nhân đôi danh sách để marquee lặp liền mạch; bản sao đánh dấu data-clone
   * để mũi tên qua lại không đếm trùng.
   */
  const wsVideos = videos.slice(0, 10).map((id) => VID(id));
  const vthumb = (v, clone) => `<div${clone ? ' aria-hidden="true"' : ''} class="fc2-shadow" style="position:relative;flex-shrink:0;width:240px;aspect-ratio:9/16;border-radius:16px;overflow:hidden;background:#e7dcc6">`
    + `<img class="fc2-vthumb"${clone ? ' data-clone="1"' : ''} role="button" tabindex="0"${videoAttrs(v)}`
    + ` src="${v.poster}" alt="${esc(v.caption || 'Video feedback của học viên')}"`
    + ` loading="lazy" width="540" height="960"`
    + ` style="${THUMB_STYLE}">${playOverlay('sm')}</div>`;

  const videoBlock = wsVideos.length
    ? `<div style="margin:8px 0 46px">
        <h2 style="font-size:28px;font-weight:800;margin:0 0 8px">${esc(w.videoHeading || 'Học viên nói gì')}</h2>
        ${w.videoNote ? `<p style="font-size:15px;line-height:1.7;color:#4a4a52;margin:0 0 40px">${esc(w.videoNote)}</p>` : ''}
        <div class="fc2-marqwrap">${pauseButton()}
          <div class="fc2-vmarquee"><div class="fc2-vtrack" style="animation-duration:${Math.max(28, wsVideos.length * 7)}s">
${wsVideos.map((v) => vthumb(v, false)).join('\n')}
${wsVideos.map((v) => vthumb(v, true)).join('\n')}
          </div></div>
        </div>
      </div>`
    : '';

  // Trích dẫn dạng chữ: cuộn ngang tự chạy như trang bán, nhưng dùng thẻ
  // <blockquote> để trình đọc màn hình hiểu đây là lời của người khác.
  const quotes = (w.quotes || []).filter((q) => String(q?.text ?? '').trim());
  const qcard = (q, clone) => `<blockquote${clone ? ' aria-hidden="true"' : ''} class="fc2-shadow" style="flex-shrink:0;width:340px;margin:0;background:#fff;border-radius:18px;padding:22px 24px;display:flex;flex-direction:column;gap:14px">`
    + `<p style="margin:0;font-size:15.5px;line-height:1.7;color:#333">\u201C${esc(q.text)}\u201D</p>`
    + `<footer style="margin-top:auto;border:0;padding:0;background:none">`
    + `<div style="font-weight:700;font-size:15px">${esc(q.name || '')}</div>`
    + (q.meta ? `<div style="font-size:13px;color:#67676f">${esc(q.meta)}</div>` : '')
    + `</footer></blockquote>`;

  const quoteBlock = quotes.length
    ? `<div style="margin:8px 0 46px">
        <h2 style="font-size:28px;font-weight:800;margin:0 0 40px">${esc(w.quoteHeading || '')}</h2>
        <div class="fc2-marqwrap">${pauseButton()}
          <div class="fc2-vmarquee"><div class="fc2-vtrack" style="animation-duration:${Math.max(34, quotes.length * 9)}s;align-items:stretch">
${quotes.map((q) => qcard(q, false)).join('\n')}
${quotes.map((q) => qcard(q, true)).join('\n')}
          </div></div>
        </div>
      </div>`
    : '';

  // FAQ: dùng <details> nên mở được cả khi JavaScript không chạy.
  const faqItems = (w.faq || []).filter((x) => String(x?.q ?? '').trim() && String(x?.a ?? '').trim());
  const faqBlock = faqItems.length
    ? `<div style="margin:8px 0 52px">
        <h2 style="font-size:28px;font-weight:800;margin:0 0 20px">${esc(w.faqHeading || 'Câu hỏi thường gặp')}</h2>
        <div class="fc2-wsfaq">
${faqItems.map((x, i) => `<details${i === 0 ? ' open=""' : ''}>`
  + `<summary>${esc(x.q)}</summary>`
  + `<p style="font-size:15.5px;line-height:1.75;color:#4a4a52;margin:0 0 18px">${esc(x.a)}</p>`
  + '</details>').join('\n')}
        </div>
      </div>`
    : '';

  // Thanh dính đáy: nút giữ chỗ luôn trong tầm tay khi khách đã cuộn xa form.
  const stickyBlock = `<div class="fc2-wssticky" data-sticky hidden>
    <span>${esc(w.stickyText || '')}</span>
    <a href="#fc2-ws-form" class="fc2-cta fc2-wsstickybtn">${esc(w.stickyCta || 'Giữ chỗ')}</a>
  </div>`;

  let html = read('page-workshop.html');
  const fill = {
    HERO_IMG,
    HERO_MEDIA: heroVideo
      ? `<img class="fc2-vthumb" role="button" tabindex="0"${videoAttrs(heroVideo)}`
        + ` src="${HERO_IMG}" alt="Xem video giới thiệu" fetchpriority="high"`
        + ` style="${THUMB_STYLE}">${playOverlay('lg')}`
      : `<img src="${HERO_IMG}" alt="Đỗ Mạnh Thành" width="1280" height="720" fetchpriority="high"`
        + ' style="width:100%;height:100%;object-fit:cover;display:block">',
    PORTRAIT_IMG,
    // Bốn chấm tick chồng nhau, giống hero trang bán
    TRUST_DOTS: [0, 1, 2, 3].map((i) =>
      '<div style="width:30px;height:30px;border-radius:9999px;background:#2f7a4d;color:#fff;'
      + 'display:flex;align-items:center;justify-content:center;font-size:13px;'
      + `${i ? 'margin-left:-9px;' : ''}box-shadow:0 0 0 2px #f3ead9">✓</div>`).join(''),
    TRUST_TEXT: esc(w.trustText || 'Được tin tưởng bởi hàng trăm học viên'),
    HOST_HEADING: esc(w.hostHeading || 'Người dẫn buổi này'),
    HOST_TEXT: esc(w.hostText || ''),
    HOST_STATS: hostStats,
    PROOF: proofBlock,
    VIDEOS: videoBlock,
    QUOTES: quoteBlock,
    FAQ: faqBlock,
    FOOTER: buildFooter(),
    STICKY: stickyBlock,
    TICKER: tickerHtml,
    EYEBROW: esc(w.eyebrow || ''),
    HEADLINE: esc(w.headline || ''),
    SUBHEADLINE: esc(w.subheadline || ''),
    WHEN_ROWS: whenRows,
    LEAD: esc(w.lead || ''),
    PAIN_HEADING: esc(w.painHeading || ''),
    PAINS: list(w.pains, dash),
    AGENDA_HEADING: esc(w.agendaHeading || ''),
    AGENDA_LEAD: esc(w.agendaLead || ''),
    AGENDA: agenda,
    TAKEAWAY_HEADING: esc(w.takeawayHeading || ''),
    TAKEAWAYS: list(w.takeaways, bullet),
    AUDIENCE_HEADING: esc(w.audienceHeading || ''),
    AUDIENCE: list(w.audience, bullet),
    CLOSING: closing,
    FORM_EYEBROW: esc(w.formEyebrow || ''),
    FORM_HEADING: esc(w.formHeading || 'Đăng ký tham gia'),
    FORM_SUB: esc(w.formSub || ''),
    CTA_LABEL: esc(w.ctaLabel || 'Giữ chỗ tham gia'),
    FORM_NOTE: esc(w.formNote || ''),
    THANKS_HEADLINE: esc(w.thankYouHeadline || 'Đã giữ chỗ cho anh chị'),
    THANKS_TEXT: esc(w.thankYouText || ''),
  };
  for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(v);

  return page({
    path: '/workshop',
    title: w.title || (w.headline + ' | ' + cfg.brand),
    description: w.description || w.subheadline || '',
    body: html + '\n' + lightbox,
    // app.js tự thoát nếu trang không có lightbox, nên nạp chung an toàn:
    // nó mang theo trình phát video, nút tạm dừng marquee và bộ nạp ảnh.
    script: read('app.js') + '\n' + read('workshop.js'),
  });
}

const leadPage = leadMagnetPage();
if (leadPage) pages['ban-do-21-ngay.html'] = leadPage;

const wsPage = workshopPage();
if (wsPage) pages['workshop.html'] = wsPage;

for (const [key, file] of [
  ['privacy', 'chinh-sach-bao-mat.html'],
  ['terms',   'dieu-khoan.html'],
  ['refund',  'chinh-sach-hoan-tien.html'],
]) {
  const p = policyPage(key);
  if (p) pages[file] = p;
}

for (const [name, content] of Object.entries(pages)) {
  fs.writeFileSync(path.join(PUBLIC, name), content, 'utf8');
}
const html = pages['index.html'];

// ------------------------------------------------------------ 8. Báo cáo
console.log(`\n✔ Đã build ${Object.keys(pages).length} trang:`);
for (const [name, content] of Object.entries(pages)) {
  console.log(`  · public/${name.padEnd(17)} ${(Buffer.byteLength(content) / 1024).toFixed(0)} KB`);
}
console.log(`  · ${videos.length} video feedback · ${filledVideo} ô video đã gắn · ${removedEmpty} ô trống đã gỡ`);
if (optimised) console.log(`  · Nén ${optimised} ảnh nặng, tiết kiệm ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  · Emoji đóng vai icon đã xử lý: ${emojiFixed}`);
if (heroVideo) console.log(`  · Video hero: ${heroVideo.id} — đổi bằng "heroVideo" trong site.config.json`);
if (youtubeIds.size) {
  console.log(`  · Nguồn phát: ${youtubeIds.size}/${videos.length} video lấy từ YouTube`);
  if (youtubeIds.size < videos.length) {
    warnings.push(`Còn ${videos.length - youtubeIds.size} video chưa có ID YouTube — những ô đó vẫn phát file mp4 tự host.`);
  }
} else {
  console.log('  · Nguồn phát: file mp4 tự host trong public/videos');
}

const leftover = [...new Set(html.match(/\[\[[^\]]+\]\]/g) || [])];
if (leftover.length) warnings.push(`Trang vẫn còn placeholder chưa điền: ${leftover.join(', ')}`);
if (html.includes('<image-slot')) warnings.push('Vẫn còn thẻ <image-slot> chưa được thay.');

if (emptySlots.length) {
  console.log(`
📷 Ô CÒN TRỐNG (${emptySlots.length}) — trang đang hiện khung gạch đứt ở những chỗ này:`);
  emptySlots.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log('   Điền xong thì khung tự biến mất. Chạy thật thì đặt showPlaceholders = false.');
}

if (warnings.length) {
  console.log('\n⚠ CẦN HOÀN THIỆN:');
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}
console.log('');
