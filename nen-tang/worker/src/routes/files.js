/**
 * Tai anh len va doc lai.
 *
 * Truoc day duong /api/files chi duoc liet ke trong danh sach can kiem CSRF
 * chu KHONG co ai xu ly - moi lenh goi deu roi xuong 404. Ba cho trong app phu
 * thuoc vao no va deu hong am tham:
 *   - nop hoat dong kem anh chung minh  (ActivityModal)
 *   - dang bai co anh trong feed        (Community)
 *   - doi anh dai dien                  (Profile)
 *
 * Anh nam trong R2. Chua bat R2 tren tai khoan thi tra ve cau tieng Viet noi ro
 * phai lam gi, thay vi 404 kho hieu.
 */
import { json, apiError } from '../lib/respond.js';
import { loadUser } from '../auth/guard.js';
import { rateLimit } from '../lib/http.js';

// Tran lay tu cau hinh (cfg.limits.uploadBytes) chu KHONG viet cung o day nua.
// Truoc day file nay giu hang 5 MB rieng trong khi router chan o 64 KB, va hai
// con so do khong he biet nhau: moi anh dien thoai deu bi tu choi tu vong ngoai.
const TRAN_MAC_DINH = 5 * 1024 * 1024;   // 5 MB - anh dien thoai chup thuong 2-4 MB
const dinhDangCo = (n) => `${Math.round(n / (1024 * 1024))}MB`;

/** Chi nhan anh. Khong nhan SVG: SVG chua duoc script. */
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

/** POST /api/files  (multipart, truong "file") -> { file_url } */
export async function uploadFile(rc) {
  const user = await loadUser(rc);
  if (!user) return apiError(401, 'unauthorized', 'Bạn cần đăng nhập.');

  // Moi duong ghi khac deu co tran so lan goi, rieng duong nay thi khong - ma
  // no la duong TON TIEN NHAT: mot vong lap don gian day 5 MB moi lan se lam
  // day kho anh va sinh hoa don R2, khong cham vao gioi han nao ca.
  // 40 anh mot gio du rong cho nguoi dung that (doi anh dai dien, nop bai kem
  // anh), va chan duoc viec bom hang loat.
  const soLan = await rateLimit(rc, `upload:${user.id}`, 40, 60 * 60 * 1000);
  if (!soLan.allowed) {
    return apiError(429, 'qua_nhieu_anh',
      'Bạn tải ảnh hơi nhiều trong một giờ. Thử lại sau ít phút nhé.',
      { retry_after: soLan.retryAfter });
  }

  if (!rc.env.UPLOADS) {
    // Nguoi doc cau nay la HOC VIEN, khong phai quan tri vien. Cau huong dan
    // "vao Cloudflare Dashboard bat R2" chi ho ich cho mot nguoi duy nhat va
    // lam kho hoac tat ca nhung nguoi con lai - de no o log may chu thoi.
    console.warn('[files] chua noi kho anh: thieu binding UPLOADS (R2 chua bat)');
    return apiError(503, 'kho_anh_chua_bat',
      'Tính năng tải ảnh đang tạm tắt. Bạn dán link ảnh vào ô bên cạnh, '
      + 'hoặc nhắn admin qua Zalo giúp nhé.');
  }

  let form;
  try {
    form = await rc.request.formData();
  } catch {
    return apiError(400, 'du_lieu_khong_hop_le', 'Không đọc được tệp gửi lên.');
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return apiError(400, 'thieu_tep', 'Chưa chọn tệp nào.');
  }
  const tran = Number(rc.cfg?.limits?.uploadBytes) || TRAN_MAC_DINH;
  if (file.size > tran) {
    return apiError(413, 'tep_qua_lon',
      `Ảnh quá ${dinhDangCo(tran)}. Hãy chọn ảnh nhỏ hơn.`);
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return apiError(415, 'dinh_dang_khong_ho_tro', 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.');
  }

  // Ten tep do NGUOI DUNG dat -> khong bao gio dung lam duong dan. Sinh ten
  // ngau nhien, chia theo nguoi so huu de sau nay xoa du lieu ca nhan de dang.
  const key = `u/${user.id}/${crypto.randomUUID()}.${ext}`;

  try {
    await rc.env.UPLOADS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: { uploader: user.id },
    });
  } catch (err) {
    console.error('[files] khong ghi duoc vao R2', err?.stack || err);
    return apiError(500, 'khong_luu_duoc', 'Không lưu được ảnh, thử lại sau ít phút.');
  }

  return json({ ok: true, file_url: `/api/files/${key}` });
}

/**
 * GET /api/files/u/<id>/<ten>
 *
 * Anh la cong khai voi bat ky ai co duong dan (ten sinh ngau nhien 128 bit nen
 * khong doan duoc). Lam vay de anh dai dien va anh trong feed hien duoc ma
 * khong phai ky lai tung duong dan.
 */
export async function readFile(rc) {
  if (!rc.env.UPLOADS) return apiError(503, 'kho_anh_chua_bat', 'Kho ảnh đang tạm tắt.');

  const key = rc.params.key;
  // Chan di nguoc thu muc truoc khi cham toi kho.
  if (!key || key.includes('..') || !/^u\/[\w-]+\/[\w-]+\.(jpg|png|webp|gif)$/.test(key)) {
    return apiError(404, 'not_found', 'Không tìm thấy ảnh');
  }

  const obj = await rc.env.UPLOADS.get(key).catch(() => null);
  if (!obj) return apiError(404, 'not_found', 'Không tìm thấy ảnh');

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Anh do nguoi dung tai len: khong bao gio de trinh duyet chay no nhu trang.
  headers.set('Content-Disposition', 'inline');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(obj.body, { headers });
}
