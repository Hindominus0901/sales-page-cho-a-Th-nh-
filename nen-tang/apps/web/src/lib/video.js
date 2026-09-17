/**
 * Bang lessons luu "nha cung cap + ma video" chu khong luu duong dan, nen viec
 * ghep ra link xem va anh dai dien nam o day - doi nha cung cap chi sua mot cho.
 */

/**
 * Nhung nha cung cap videoEmbedUrl() ghep duoc link.
 *
 * Danh sach nay la nguon su that cho ca dropdown trong trang quan tri
 * (_khoahoc.jsx) lan buoc doan nha cung cap tu ma tran trong nhanDangVideo().
 * Truoc day hai cho tu giu danh sach rieng nen them mot nha cung cap la phai
 * nho sua ca hai, va quen mot cho thi hong lang le.
 */
export const NHA_CUNG_CAP = ['wistia', 'youtube', 'vimeo', 'stream'];

/**
 * URL de NHUNG vao iframe ngay trong trang. Khac videoUrl(): cai kia la link
 * mo o tab moi.
 *
 * Wistia la nha cung cap chinh (chi Thanh chon). Bang lessons luu ma video chu
 * khong luu link, nen doi nha cung cap ve sau chi sua o day.
 */
export function videoEmbedUrl(lesson) {
  if (!lesson || !lesson.video_id) return null;
  const id = encodeURIComponent(lesson.video_id);
  switch (lesson.video_provider) {
    case 'youtube': return `https://www.youtube.com/embed/${id}?rel=0&playsinline=1`;
    case 'vimeo': return `https://player.vimeo.com/video/${id}`;
    case 'stream': return `https://iframe.videodelivery.net/${id}`;
    case 'wistia':
    case '':
    case undefined:
    case null:
      return `https://fast.wistia.net/embed/iframe/${id}?videoFoam=true`;
    // Nha cung cap la, khong biet dung link nao -> tra null de giao dien bao
    // "chua co video", thay vi dung mot link Wistia sai roi hien khung den.
    default: return null;
  }
}

export function videoUrl(lesson) {
  if (!lesson || !lesson.video_id) return null;
  const id = lesson.video_id;
  switch (lesson.video_provider) {
    case 'youtube': return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    case 'vimeo': return `https://vimeo.com/${encodeURIComponent(id)}`;
    case 'stream': return `https://watch.cloudflarestream.com/${encodeURIComponent(id)}`;
    case 'wistia':
    case '':
    case undefined:
    case null:
      return `https://fast.wistia.net/embed/iframe/${encodeURIComponent(id)}`;
    default: return null;
  }
}

/**
 * Anh dai dien suy tu ma video.
 *
 * YouTube co i.ytimg.com doan duoc tu ma. Wistia co mot anh cong khai tuong tu
 * o fast.wistia.com/embed/medias/<id>/swatch - no nho va hoi mo, nhung van hon
 * han mot o den tuyet doi, vi truoc day videoThumb() tra null cho MOI nha cung
 * cap tru YouTube, ma Wistia lai chinh la nha cung cap mac dinh cua bang
 * lessons. Nghia la mac dinh moi the bai giang deu la mot o den.
 *
 * Vimeo va Stream can goi API moi lay duoc anh nen van tra null - noi goi dung
 * anh nay (LessonRow) da co khung giu cho tu ve, xem onError o do.
 */
export function videoThumb(lesson) {
  if (!lesson || !lesson.video_id) return null;
  const id = encodeURIComponent(lesson.video_id);
  switch (lesson.video_provider) {
    case 'youtube': return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    case 'wistia':
    case '':
    case undefined:
    case null:
      return `https://fast.wistia.com/embed/medias/${id}/swatch`;
    default: return null;
  }
}

/** Anh dai dien cho mot duong dan YouTube day du (challenge.hero_video_url). */
export function youtubeThumbFromUrl(url) {
  if (!url) return null;
  const match = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : null;
}

/**
 * Duong dan day du -> src NHUNG duoc vao iframe.
 *
 * Bang challenges luu ca duong dan (hero_video_url, day_tasks.video_url) chu
 * khong luu "nha cung cap + ma" nhu bang lessons, nen can duong rieng nay.
 *
 * LUON dung lai link theo dung ten mien nhung cua tung nha cung cap thay vi tra
 * ve nguyen duong dan nguoi dung dan: CSP cua khu vuc thanh vien chi cho phep
 * sau ten mien (xem VIDEO_FRAMES trong worker/src/lib/respond.js). Mot link
 * kieu "tenkhach.wistia.com/medias/abc" nhung thang vao iframe se bi chan IM
 * LANG - khung den, khong loi, khong ai hieu vi sao.
 */
export function embedFromUrl(url, nhaCungCapGoiY) {
  const ra = nhanDangVideo(url, nhaCungCapGoiY);
  return ra.ok ? videoEmbedUrl({ video_provider: ra.provider, video_id: ra.id }) : null;
}

/**
 * NHAN DANG mot thu nguoi dung dan vao: link day du HAY ma video tran.
 *
 * Tra ve { ok: true, provider, id } hoac { ok: false, loi: '<cau tieng Viet>' }.
 *
 * VI SAO PHAI CO HAM NAY, TACH KHOI embedFromUrl
 *
 * Form them bai giang (_khoahoc.jsx) truoc day chi nhan MA TRAN, va khong kiem
 * gi ca. Dan mot link YouTube vao do thi videoEmbedUrl() encodeURIComponent ca
 * cai link thanh "ma", cho ra
 *   youtube.com/embed/https%3A%2F%2Fyoutu.be%2FAbC123
 * YouTube tra 404 BEN TRONG iframe: mot o den, khong loi, khong ai doan duoc vi
 * sao. Ma dan link chinh la dong tac tu nhien nhat - nguoi ta bam "Chia se" o
 * YouTube thi duoc mot cai link, khong phai mot cai ma.
 *
 * Logic boc ma thi da co san trong embedFromUrl tu lau; no chi chua bao gio
 * duoc noi vao form. Ham nay tra ve CAP (provider, id) thay vi mot chuoi URL de
 * form con dien duoc vao dropdown va bao loi tai cho.
 *
 * `nhaCungCapGoiY` la lua chon dang hien trong dropdown. No CHI dung cho ma
 * tran - truoc day ma tran luon bi doan la Wistia, nen dan mot ma YouTube tran
 * (dQw4w9WgXcQ) la nhan mot embed Wistia, lai mot o den nua. Co link thi ten
 * mien quyet dinh, goi y bi bo qua.
 */
export function nhanDangVideo(url, nhaCungCapGoiY) {
  const raw = String(url || '').trim();
  if (!raw) return { ok: false, loi: '' };

  // Ma tran: khong co dau cham va khong co dau gach cheo.
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw) && !raw.includes('.')) {
    const provider = NHA_CUNG_CAP.includes(nhaCungCapGoiY) ? nhaCungCapGoiY : 'wistia';
    return { ok: true, provider, id: raw };
  }

  let u;
  try { u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch {
    return { ok: false, loi: 'Không đọc được link này. Kiểm tra lại giúp em nhé.' };
  }
  const host = u.hostname.replace(/^www\./, '');
  const lay = (re) => (re.exec(u.pathname) || [])[1] || '';
  const tra = (provider, id) => (id
    ? { ok: true, provider, id }
    : { ok: false, loi: 'Link đúng trang nhưng không tìm thấy mã video trong đó.' });

  if (host === 'youtu.be') return tra('youtube', lay(/^\/([\w-]{6,})/));
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    return tra('youtube', u.searchParams.get('v') || lay(/\/(?:embed|shorts|live)\/([\w-]{6,})/));
  }
  if (host.endsWith('vimeo.com')) return tra('vimeo', lay(/\/(\d{6,})/));
  if (host.endsWith('wistia.com') || host.endsWith('wistia.net')) {
    // Link chia se .../s/... mang mot ma DA LAM ROI, khong suy nguoc ra ma video
    // duoc bang bat ky cach nao o phia trinh duyet. Noi thang ra thay vi tra
    // null chung chung roi de nguoi ta ngoi doan minh dan sai cho nao.
    if (/^\/s\//.test(u.pathname)) {
      return { ok: false, loi: 'Link dạng .../s/... của Wistia không nhúng được. '
        + 'Vào video trong Wistia, lấy link dạng .../medias/... hoặc mã video.' };
    }
    const id = lay(/(?:medias|iframe)\/([\w-]+)/) || lay(/^\/([\w-]+)$/);
    return tra('wistia', id ? id.replace(/\.\w+$/, '') : '');
  }
  if (host.endsWith('videodelivery.net') || host.endsWith('cloudflarestream.com')) {
    return tra('stream', lay(/^\/([\w-]+)/));
  }
  return { ok: false, loi: `Chưa hỗ trợ "${host}". Dùng YouTube, Wistia, Vimeo hoặc Cloudflare Stream.` };
}
