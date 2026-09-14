/**
 * Bang lessons luu "nha cung cap + ma video" chu khong luu duong dan, nen viec
 * ghep ra link xem va anh dai dien nam o day - doi nha cung cap chi sua mot cho.
 */

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

/** Chi YouTube cho san anh dai dien theo ma video; con lai tra ve null. */
export function videoThumb(lesson) {
  if (!lesson || !lesson.video_id) return null;
  if (lesson.video_provider === 'youtube') {
    return `https://i.ytimg.com/vi/${encodeURIComponent(lesson.video_id)}/hqdefault.jpg`;
  }
  return null;
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
export function embedFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  // Chi dan moi ma video (nguoi dung hay copy dung phan nay) -> mac dinh Wistia.
  if (/^[A-Za-z0-9_-]{6,}$/.test(raw) && !raw.includes('.')) {
    return videoEmbedUrl({ video_provider: 'wistia', video_id: raw });
  }

  let u;
  try { u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const lay = (re) => (re.exec(u.pathname) || [])[1] || '';

  if (host === 'youtu.be') {
    const id = lay(/^\/([\w-]{6,})/);
    return id ? videoEmbedUrl({ video_provider: 'youtube', video_id: id }) : null;
  }
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const id = u.searchParams.get('v') || lay(/\/(?:embed|shorts|live)\/([\w-]{6,})/);
    return id ? videoEmbedUrl({ video_provider: 'youtube', video_id: id }) : null;
  }
  if (host.endsWith('vimeo.com')) {
    const id = lay(/\/(\d{6,})/);
    return id ? videoEmbedUrl({ video_provider: 'vimeo', video_id: id }) : null;
  }
  if (host.endsWith('wistia.com') || host.endsWith('wistia.net')) {
    // .../medias/ID  .../embed/iframe/ID  .../embed/medias/ID.jsonp  .../ID
    const id = lay(/(?:medias|iframe)\/([\w-]+)/) || lay(/^\/([\w-]+)$/);
    return id ? videoEmbedUrl({ video_provider: 'wistia', video_id: id.replace(/\.\w+$/, '') }) : null;
  }
  if (host.endsWith('videodelivery.net') || host.endsWith('cloudflarestream.com')) {
    const id = lay(/^\/([\w-]+)/);
    return id ? videoEmbedUrl({ video_provider: 'stream', video_id: id }) : null;
  }
  return null;
}
