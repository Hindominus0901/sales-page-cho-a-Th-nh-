/**
 * Cac ham nghiep vu: POST /api/functions/<ten>
 *
 * Nhung viec KHONG the lam qua API entity thong thuong deu nam o day - vi chung
 * doi hoi nhieu buoc phai xay ra cung nhau (tru xu roi moi tao don doi qua),
 * hoac phai chay duoi quyen he thong (cong XP).
 *
 * Nguyen tac: ham nhan quyen he thong (svc) nhung LUON tu kiem tra nguoi goi la
 * ai truoc. Khong bao gio tin tham so user_id gui len - luon lay tu phien.
 */
import { json, apiError } from '../lib/respond.js';
import { requireUser } from '../auth/guard.js';
import { createServiceRepo, PolicyError, khoaMoQuaGoi, levelOf } from '../entities/repo.js';
import {
  awardPoints, spendCoin, refundCoin, touchStreak, levelFor, reconcile, checkLevelAfterChange,
} from '../points/award.js';
import { traoHuyHieu, raSoatHuyHieu } from '../points/badges.js';
import { rateLimit } from '../lib/http.js';
import { affiliateOfUser } from '../routes/affiliate.js';
import { clean, validateEmail, validatePhone, anhUrl } from '../lib/validate.js';
import { scoreWithAi } from './ai.js';
import { guiLaiThuMoi } from '../auth/invite.js';
import { readSettings } from '../settings.js';

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const today = () => nowIso().slice(0, 10);

const isAdmin = (rc) => rc.user?.role === 'admin';
const isStaff = (rc) => rc.user?.role === 'admin' || rc.user?.role === 'coach';

const notify = (svc, userId, title, body, type = 'system') =>
  svc.Notification.create({ user_id: userId, title, body, type, is_read: false });

// Tran XP moi nguoi nhan duoc trong MOT ngay tu TAT CA cac hoat dong cong lai.
//
// Day la muc chi Thanh chot 12/09 sau khi bang xep hang lech han: hai nguoi
// dung dau co 330 va 265 diem trong khi nguoi thu tu co 110, va toan bo khoang
// cach den tu muc hoat dong. Ho khong gian lan - ca 24 luot deu co bang chung -
// nhung thang diem cho hoat dong an dut phan con lai cua chuong trinh.
//
// Mot ngay tron ven gio la: 10 (diem danh) + 15 (bai tap duoc cham) + 40 (hoat
// dong) = 65 XP. Hoat dong van la phan lon nhat nhung khong con quyet dinh thay
// ca cuoc thi.
//
// Sua duoc bang app_settings (`st-tran-diem-hoat-dong-moi-ngay`) de khong phai
// deploy lai khi chi Thanh doi y.
const TRAN_DIEM_HOAT_DONG = 40;

// --------------------------------------------------------------- hoat dong
/** Nguoi hoc ghi nhan mot hoat dong. */
async function logActivity(rc, svc) {
  const { activity_type_key: key, title, description, evidence_link: link, screenshot_url: shot, date } = rc.body || {};
  if (!key) return apiError(400, 'missing', 'Thiếu loại hoạt động');

  const type = (await svc.ActivityType.filter({ key, is_active: true }))[0];
  if (!type) return apiError(404, 'not_found', 'Loại hoạt động không tồn tại');

  // BAT BUOC CO BANG CHUNG (chi Thanh chot 11/09).
  //
  // Truoc day o bang chung de trong cung nop duoc, nen mot hoat dong chi la mot
  // dong chu tu khai: "Goi khach hang" - go xong la co diem. Voi tran 10 lan
  // mot ngay cho muc goi khach, do la duong farm diem nhanh nhat he thong, va
  // khong ai kiem chung duoc.
  //
  // Nhan MOT trong hai: mot duong dan, hoac mot anh chup. Khong doi ca hai -
  // co nguoi chi co anh, co nguoi chi co link, ep ca hai la chan ca nguoi lam
  // that. Dinh dang duong dan do `repo.js` loc tiep (chan javascript:, data:).
  const coLink = /^https?:\/\/\S+\.\S+/i.test(String(link || '').trim());
  const coAnh = !!String(shot || '').trim();
  if (!coLink && !coAnh) {
    return apiError(422, 'thieu_bang_chung',
      'Bạn gửi kèm bằng chứng nhé — một đường link, hoặc một ảnh chụp màn hình.');
  }

  // Rieng ANH thi siet hon `checkUrls` cua repo.js mot bac: phai la https hoac
  // tep cua chinh he thong.
  //
  // `checkUrls` cho ca http:// - dung cho `evidence_link` (mot duong dan de bam,
  // http van mo duoc), nhung SAI cho mot buc anh: CSP chi cho img-src https,
  // nen anh http luu thanh cong, bao thanh cong, roi khong bao gio hien ra voi
  // bat ky ai. Bao ngay luc dan con hon de nguoi ta tuong da nop xong.
  const anhSach = anhUrl(shot);
  if (anhSach === null) {
    return apiError(422, 'anh_khong_hop_le',
      'Link ảnh cần bắt đầu bằng https:// — bạn kiểm tra lại giúp nhé.');
  }

  const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today();

  // Tran theo ngay cua loai hoat dong: vuot thi VAN GHI NHAN nhung khong tinh
  // diem - de nguoi hoc thay minh da lam, chi khong duoc cong them.
  const sameDay = await svc.Activity.filter({
    user_id: rc.user.id, activity_type_key: key, date: day,
  });
  const countedToday = sameDay.filter((a) => a.counted_for_cap).length;
  const withinCap = countedToday < (type.daily_cap || 999);

  const activity = await svc.Activity.create({
    user_id: rc.user.id,
    user_name: rc.user.full_name,
    activity_type_id: type.id,
    activity_type_key: key,
    activity_type_name: type.name,
    date: day,
    title: clean(title, 200),
    description: clean(description, 4000),
    evidence_link: clean(link, 500),
    screenshot_url: anhSach,
    status: 'pending',
    counted_for_cap: withinCap,
    created_by: rc.user.email,
  });

  return json({
    ok: true,
    activity,
    counted: withinCap,
    message: withinCap
      ? 'Đã ghi nhận, đang chờ duyệt.'
      : `Bạn đã đạt giới hạn ${type.daily_cap} lần/ngày cho mục này. Bài vẫn được ghi nhận nhưng không cộng điểm.`,
  });
}

/** Admin/coach duyet hoac tu choi mot hoat dong. */
async function approveActivity(rc, svc) {
  if (!isStaff(rc)) return apiError(403, 'forbidden', 'Chỉ quản trị viên mới được duyệt');
  const { activity_id: id, action, rejection_reason: reason } = rc.body || {};
  if (!id || !['approve', 'reject'].includes(action)) {
    return apiError(400, 'missing', 'Thiếu dữ liệu');
  }

  const activity = await svc.Activity.get(id);
  if (!activity) return apiError(404, 'not_found', 'Không tìm thấy hoạt động');
  if (activity.status !== 'pending') {
    return apiError(409, 'already_done', 'Hoạt động này đã được xử lý rồi');
  }

  if (action === 'reject') {
    await svc.Activity.update(id, {
      status: 'rejected',
      reviewed_by: rc.user.id,
      reviewed_at: nowIso(),
      rejection_reason: clean(reason, 500),
    });
    await notify(svc, activity.user_id, '❌ Bài nộp cần sửa lại',
      clean(reason, 300) || 'Vui lòng xem lại và nộp lại.', 'approval');
    await svc.AdminLog.create({
      admin_id: rc.user.id, admin_name: rc.user.full_name,
      target_user_id: activity.user_id, target_user_name: activity.user_name,
      action: 'reject_activity', reason: clean(reason, 300), details: activity.title || '',
    });
    return json({ ok: true, status: 'rejected' });
  }

  // THU TU QUAN TRONG: cap nhat bo dem va chuoi ngay TRUOC khi cong diem.
  //
  // awardPoints() ket thuc bang mot lan ra soat huy hieu, va viec ra soat do doc
  // chinh nhung con so nay (content_count, longest_streak...). Neu cap nhat sau,
  // no doc phai gia tri cu: nguoi vua nop hoat dong dau tien van bi coi la co 0
  // hoat dong, nen huy hieu "Buoc dau tien" khong bao gio duoc trao dung luc.
  //
  // An toan khi doi len truoc: den day thi hoat dong chac chan duoc duyet - o
  // tren da chan `status !== 'pending'` bang loi 409, nen khong co duong nao
  // cong bo dem hai lan.
  const counterField = { content: 'content_count', call: 'call_count', assignment: 'assignment_count' }[activity.activity_type_key];
  if (counterField) {
    await rc.store.run(
      `UPDATE users SET ${counterField} = ${counterField} + 1, updated_date = ? WHERE id = ?`,
      [nowIso(), activity.user_id]);
  }
  if (activity.counted_for_cap) await touchStreak(rc, activity.user_id, activity.date);

  // Loai hoat dong bi TAT CONG DIEM.
  //
  // Chi Thanh chot 11/09: bo cong diem cho muc "Dang content" vi co nguoi spam
  // de farm diem. Mot lan duyet la 20 XP, tran 3 lan/ngay - tuc 60 XP/ngay chi
  // bang cach khai bao, trong khi diem danh ca buoi hoc chi duoc 10.
  //
  // Hoat dong VAN duoc ghi nhan, van duyet, van len bo dem va chuoi ngay - chi
  // khong ra XP/xu. De o app_settings chu khong viet cung 'content': chi Thanh
  // doi y hay muon tat them mot muc khac thi sua mot dong, khong can toi.
  //
  //   INSERT INTO app_settings (key, value)
  //   VALUES ('st-hoat-dong-khong-cong-diem', '["content"]');
  const caiHD = await readSettings(rc,
    ['st-hoat-dong-khong-cong-diem', 'st-tran-diem-hoat-dong-moi-ngay']);
  const mucKhongCongDiem = Array.isArray(caiHD['st-hoat-dong-khong-cong-diem'])
    ? caiHD['st-hoat-dong-khong-cong-diem'].map(String)
    : [];
  const congDiemDuoc = !mucKhongCongDiem.includes(String(activity.activity_type_key));

  // DIEM LAY THEO LOAI HOAT DONG, khong phai mot con so chung.
  //
  // Truoc day o day goi awardPoints voi `xp: null` - tuc la de luat chung
  // `activity_approved` (20 XP / 10 xu) quyet dinh, va chi doc `xp_reward` cua
  // loai khi luat chung KHONG khai so. Luat chung luon khai so, nen nhanh do
  // khong bao gio chay: MOI loai hoat dong deu tra 20 XP nhu nhau.
  //
  // Hau qua dung bang so chi Thanh da cau hinh:
  //     loai          dat    thuc tra   tran/ngay   XP toi da mot ngay
  //     Goi khach     5 XP     20 XP       10        200  (dang le 50)
  //     Dang content 20 XP     20 XP        3         60
  //     Nop bai tap  50 XP     20 XP        2         40  (dang le 100)
  //
  // Mot cuoc goi duoc tra gap 4 lan muc dinh, va tran 10 lan/ngay bien no thanh
  // duong farm diem nhanh nhat he thong - mot nguoi khai 10 cuoc goi trong mot
  // buoi toi la hon ca tuan di hoc diem danh.
  let awarded = { xp: 0, coin: 0 };
  if (activity.counted_for_cap && congDiemDuoc) {
    const type = activity.activity_type_id
      ? await svc.ActivityType.get(activity.activity_type_id)
      : null;

    // TRAN CHUNG CHO CA NGAY, cong doi voi tran rieng cua tung loai.
    //
    // Tran rieng khong du: moi loai tu chan minh, nhung cong lai thi khong ai
    // chan. Voi cau hinh cu (goi 10 lan, content 3, bai tap 2) mot nguoi lam
    // du ca ba muc duoc 210 XP mot ngay - trong khi di hoc ca buoi duoc 10 va
    // bai tap duoc cham duoc 15. Hoat dong ap dao toan bo phan con lai cua
    // chuong trinh, nen bang xep hang do chinh no quyet dinh.
    //
    // Tinh theo NGAY CUA HOAT DONG (`activity.date`) chu khong phai ngay duyet:
    // chi Thanh thuong duyet don mot the sau vai hom, lay ngay duyet thi ca
    // tuan hoat dong don vao mot ngay va bi cat oan.
    const tran = Number(caiHD['st-tran-diem-hoat-dong-moi-ngay'] ?? TRAN_DIEM_HOAT_DONG);
    const daCo = await rc.store.get(
      `SELECT COALESCE(SUM(p.xp), 0) AS n FROM point_awards p
         JOIN activities a ON a.id = p.source_id
        WHERE p.event_key = 'activity_approved' AND p.user_id = ? AND a.date = ?`,
      [activity.user_id, activity.date]);
    const conLai = Math.max(0, tran - Number(daCo?.n || 0));

    const xpLoai = Number.isFinite(Number(type?.xp_reward)) ? Number(type.xp_reward) : null;
    const xpTra = xpLoai === null ? null : Math.min(xpLoai, conLai);

    if (conLai > 0) {
      const result = await awardPoints(rc, {
        user_id: activity.user_id,
        event_key: 'activity_approved',
        source_id: activity.id,
        // Loai co khai so thi theo loai; khong khai thi moi roi ve luat chung.
        xp: xpTra,
        coin: Number.isFinite(Number(type?.coin_reward)) ? Number(type.coin_reward) : null,
        reason: `Duyệt: ${type?.name || activity.activity_type_name || activity.activity_type_key}`,
      });
      awarded = { xp: result.xp, coin: result.coin };
    }
  }

  await svc.Activity.update(id, {
    status: 'approved',
    reviewed_by: rc.user.id,
    reviewed_at: nowIso(),
    xp_awarded: awarded.xp,
    coin_awarded: awarded.coin,
  });
  // Loai khong cong diem (`st-hoat-dong-khong-cong-diem`) thi ĐỪNG khoe con so
  // 0 ra: "+0 XP · +0 xu" doc nhu he thong vua hong, va hoc vien se di hoi vi
  // sao minh khong duoc diem - trong khi do la quyet dinh co y.
  const coDiem = awarded.xp > 0 || awarded.coin > 0;
  const ten = activity.title || activity.activity_type_name;
  await notify(svc, activity.user_id, '✅ Bài nộp đã được duyệt',
    coDiem
      ? `"${ten}" +${awarded.xp} XP · +${awarded.coin} xu`
      : `"${ten}" đã được ghi nhận.`,
    'approval');
  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name,
    target_user_id: activity.user_id, target_user_name: activity.user_name,
    action: 'approve_activity',
    details: coDiem ? `+${awarded.xp} XP, +${awarded.coin} xu` : 'khong cong diem',
  });

  return json({ ok: true, status: 'approved', awarded });
}

/** AI cham mot hoat dong theo rubric cua loai hoat dong do. */
async function scoreActivity(rc, svc) {
  if (!isStaff(rc)) return apiError(403, 'forbidden', 'Chỉ quản trị viên');
  const activity = await svc.Activity.get(rc.body?.activity_id);
  if (!activity) return apiError(404, 'not_found', 'Không tìm thấy hoạt động');

  const type = activity.activity_type_id ? await svc.ActivityType.get(activity.activity_type_id) : null;
  const result = await scoreWithAi(rc, {
    criteria: type?.ai_criteria,
    title: activity.title,
    content: activity.description,
    link: activity.evidence_link,
    imageUrl: activity.screenshot_url,
  });
  if (!result.ok) return apiError(503, 'ai_unavailable', result.error);

  await svc.Activity.update(activity.id, {
    ai_score: result.score,
    ai_feedback: result.feedback,
    ai_rubric_json: result.rubric,
    ai_scored_at: nowIso(),
  });
  return json({ ok: true, score: result.score, feedback: result.feedback, rubric: result.rubric });
}

// --------------------------------------------------------------- thu thach
/**
 * Nguoi nay co phai hoc vien cua chuong trinh khong?
 *
 * VI SAO CAN: nut "Dang nhap" tren trang ban hang mo cua cho BAT KY ai co
 * Gmail. Truoc day ai bam vao do cung thanh mot hoc vien day du - vao lop, lam
 * thu thach, tich xu, doi qua - ma chua tung dien form, chua tung dang ky.
 * Tinh den luc viet, co 6 tai khoan nhu vay.
 *
 * "Da dang ky" duoc hieu ROI RAI, co y: mot ve nao dung cung du. Chan nham mot
 * nguoi da tra tien la loi nang hon nhieu so voi de lot mot nguoi to mo.
 *   - la quan tri / tro giang
 *   - tai khoan sinh ra tu form dang ky  (legacy_lead_id)
 *   - co dong lead trung email            (dang ky truoc, tao tai khoan sau)
 *   - co bat ky quyen truy cap nao        (da mua, hoac admin mo tay)
 *
 * Loi trong ham nay -> tra ve TRUE. Mot su co co so du lieu khong duoc bien
 * thanh mot dem 300 nguoi bi khoa ngoai cua.
 */
export async function daDangKyChuongTrinh(rc) {
  try {
    // MAC DINH TAT. Chi Thanh chot: ai vao duoc bang duong nao cung hoc duoc.
    //
    // Ly do bo: cai cong nay chan dung nhung nguoi no sinh ra de chan, nhung
    // no cung chan nham nguoi that - ai dien form bang mot email roi dang nhap
    // Google bang email khac se thay mot canh cua dong ma khong hieu vi sao.
    // Giua "lot mot nguoi to mo" va "khoa mot hoc vien da tra tien ngoai cua",
    // ve dau te hon nhieu.
    //
    // KHONG xoa doan duoi: bat lai chi la doi mot dong trong app_settings, con
    // viet lai tu dau thi ton mot buoi. Bat bang:
    //   INSERT INTO app_settings (key, value) VALUES ('st-khoa-noi-dung','true')
    const cai = await readSettings(rc, ['st-khoa-noi-dung']);
    if (cai['st-khoa-noi-dung'] !== true) return true;

    if (rc.user?.role === 'admin' || rc.user?.role === 'coach') return true;
    if (rc.user?.legacy_lead_id) return true;

    const email = String(rc.user?.email || '').trim().toLowerCase();
    if (email) {
      const lead = await rc.store.get('SELECT 1 x FROM leads WHERE lower(email) = ?', [email]);
      if (lead) return true;
    }
    const quyen = await rc.store.get(
      'SELECT 1 x FROM entitlements WHERE user_id = ? AND revoked_at IS NULL LIMIT 1',
      [rc.user.id]);
    return !!quyen;
  } catch (err) {
    console.error('[gate] khong kiem tra duoc tu cach hoc vien', err?.stack || err);
    return true;
  }
}

const CHUA_DANG_KY = 'Bạn chưa đăng ký chương trình. Điền form đăng ký ở trang chính '
  + 'rồi phần này sẽ tự mở cho bạn.';

async function joinChallenge(rc, svc) {
  if (!await daDangKyChuongTrinh(rc)) return apiError(403, 'chua_dang_ky', CHUA_DANG_KY);

  const challenge = await svc.Challenge.get(rc.body?.challenge_id);
  if (!challenge || !challenge.is_active) return apiError(404, 'not_found', 'Thử thách không tồn tại');

  if (challenge.requires_unlock) {
    const unlocked = await svc.Entitlement.filter({
      user_id: rc.user.id, kind: 'challenge', ref: challenge.id,
    });
    if (!unlocked.some((e) => !e.revoked_at)) {
      return apiError(403, 'locked', 'Thử thách này cần được mở khoá. Nhắn admin qua Zalo nhé.');
    }
  }

  const existing = await svc.ChallengeMember.filter({ challenge_id: challenge.id, user_id: rc.user.id });
  if (existing.length) return json({ ok: true, member: existing[0], joined: false });

  const member = await svc.ChallengeMember.create({
    challenge_id: challenge.id,
    challenge_name: challenge.name,
    user_id: rc.user.id,
    user_name: rc.user.full_name,
    joined_at: nowIso(),
  });
  return json({ ok: true, member, joined: true });
}

/**
 * Chuong trinh dang o ngay thu may, tinh theo LICH CHUONG TRINH chu khong theo
 * ngay tung nguoi bam tham gia.
 *
 * DAY LA MOT LUAT NGHIEP VU, khong phai chi tiet ky thuat. Lop nay hoc chung
 * mot buoi Zoom moi sang, nen "hom nay la ngay 2" phai giong nhau voi tat ca.
 *
 * Truoc day moc tinh tu `member.joined_at`. Nghe hop ly cho mot thu thach ai
 * vao luc nao cung duoc, nhung voi mot lop co lich co dinh thi no hong han:
 * 398/492 hoc vien chua bam tham gia, va ai bam vao ngay 11/09 se chi mo duoc
 * Ngay 0-1 trong khi lop da o Ngay 2 - roi den buoi cuoi ho van con o Ngay 4,
 * KHONG BAO GIO nop duoc Ngay 5.
 *
 * `start_date` la ngay cua buoi 1, nen no ung voi ngay 1; hom truoc do la ngay
 * 0 (Kick-Off). Chan duoi o 0 chu khong phai 1: ngay 0 la mot ngay that.
 *
 * So sanh theo NGAY LICH gio Viet Nam, khong phai theo moc 24 gio. Neu tru
 * thang hai moc thoi gian thi 8 gio sang ngay 10 van dang la "ngay 0" vi chua
 * du 24 tieng - trong khi buoi hoc dang dien ra.
 */
function ngayThuThach(thuThach, env) {
  if (!thuThach?.start_date) return 1;
  const lechPhut = Number(env?.TZ_OFFSET_MINUTES) || 420;
  const homNay = new Date(Date.now() + lechPhut * 60000).toISOString().slice(0, 10);
  const cach = Math.round(
    (Date.parse(`${homNay}T00:00:00Z`) - Date.parse(`${thuThach.start_date.slice(0, 10)}T00:00:00Z`))
    / 86400000);
  const tran = Number(thuThach.duration_days) || 21;
  return Math.min(tran, Math.max(0, cach + 1));
}

/** Nop bai cua mot ngay trong thu thach. */
async function submitChallengeDay(rc, svc) {
  const { challenge_id: challengeId, day, content, link } = rc.body || {};
  const dayNum = Number(day);
  // dayNum >= 0: buoi Kick-Off la NGAY 0 - buoi dinh huong, khong phai nhiem vu.
  // Truoc day chan tu 1 nen khong the danh so buoi khai giang la ngay 0.
  if (!challengeId || !Number.isInteger(dayNum) || dayNum < 0) {
    return apiError(400, 'missing', 'Thiếu dữ liệu bài nộp');
  }

  const member = (await svc.ChallengeMember.filter({
    challenge_id: challengeId, user_id: rc.user.id,
  }))[0];
  if (!member) return apiError(403, 'not_joined', 'Bạn chưa tham gia thử thách này');

  const task = (await svc.ChallengeDayTask.filter({ challenge_id: challengeId, day: dayNum }))[0];
  if (!task) return apiError(404, 'not_found', 'Không có nhiệm vụ cho ngày này');

  // Chan nop truoc ngay - o PHIA MAY CHU.
  //
  // Truoc day chot chan nay chi nam trong React (Challenges.jsx loc
  // `t.day <= currentDay`), nen goi thang API la nop duoc ca 5 ngay ngay hom
  // dau roi ngoi cho cham. Voi mot cuoc thi dua co xep hang thi do la duong
  // gian lan re nhat.
  const thuThach = await svc.Challenge.get(challengeId);
  const ngayHienTai = ngayThuThach(thuThach, rc.env);
  if (dayNum > ngayHienTai) {
    return apiError(409, 'chua_toi_ngay',
      `Nhiệm vụ ngày ${dayNum} chưa mở. Chương trình đang ở ngày ${ngayHienTai}.`);
  }
  // Bai cua mot ngay chi nop duoc TRONG NGAY DO (het 24:00 gio Viet Nam).
  //
  // Chi Thanh chot luat nay ngay 10/09, doi lai luat cu cho nop bu ngay da qua.
  // Y nghia: ai vao muon thi bat dau tu ngay ho vao, khong go lai duoc nhung
  // ngay da troi. Doi lai thi bo hai dong duoi - moc `ngayThuThach` van dung.
  if (dayNum < ngayHienTai) {
    return apiError(409, 'ngay_da_dong',
      `Ngày ${dayNum} đã đóng lúc 24:00 hôm đó. Hôm nay là Ngày ${ngayHienTai}.`);
  }

  const existing = (await svc.ChallengeSubmission.filter({
    challenge_id: challengeId, user_id: rc.user.id, day: dayNum,
  }))[0];

  // Ba o, dung ba cot khac nhau - KHONG nhet ca hai duong dan vao mot cot roi
  // tach bang dau phay. Chi Thanh chot bo bai gom: (1) diem danh, (2) link bai
  // tap tren Drive/Notion, (3) link bai cam nhan dang tren nhom Facebook. Muc
  // (3) la mot DUONG DAN, khong phai doan van - o chu tu do da bo.
  const noiDung = clean(content, 8000);
  const duongDan = clean(link, 500);
  const linkCamNhan = clean(rc.body?.file_url, 500);
  const payload = {
    content: noiDung, link: duongDan, file_url: linkCamNhan, status: 'pending',
  };

  const submission = existing
    ? await svc.ChallengeSubmission.update(existing.id, payload)
    : await svc.ChallengeSubmission.create({
      ...payload,
      challenge_id: challengeId,
      user_id: rc.user.id,
      user_name: rc.user.full_name,
      day: dayNum,
    });

  // ------------------------------------------------------------- tu duyet
  //
  // Chi Thanh chot: nop du bai la duoc, khong cham diem, khong can AI. Nen o
  // day chi co mot bo luat don gian - co du hai thu thi duyet luon va cong
  // diem ngay, khong ai phai ngoi cham 300 bai moi toi.
  //
  // Bai KHONG du luat van duoc luu o trang thai cho, va tra ve loi con thieu
  // gi. Khong tu choi thang: nguoi ta da bo cong go, va quan tri vien van
  // duyet tay duoc neu thay hop le.
  const cai = await readSettings(rc, ['st-tu-duyet', 'st-tu-duyet-link', 'st-tu-duyet-cam-nhan',
    'st-ngay-chi-diem-danh', 'st-ngay-khong-bai-tap']);
  const batTuDuyet = cai['st-tu-duyet'] !== false;

  // Ngay CHI CAN DIEM DANH, khong co bai tap. Buoi Kick-Off la mot buoi dinh
  // huong - khong co gi de nop, nhung the ngay van hien o nop bai va doi hai
  // duong dan, nen hoc vien tuong minh dang thieu viec.
  //
  // De trong app_settings chu khong viet cung so 1: chi Thanh doi lich hay them
  // mot buoi khong bai tap thi sua mot dong, khong can toi.
  const ngayMienNop = Array.isArray(cai['st-ngay-chi-diem-danh']) ? cai['st-ngay-chi-diem-danh'] : [];
  const mienNop = ngayMienNop.map(Number).includes(dayNum);

  // Ngay CHI CO BAI CAM NHAN, khong co bai tap.
  //
  // Khac voi `st-ngay-chi-diem-danh` o mot diem quan trong: ngay do bo CA HAI o
  // link, con day chi bo o "link bai tap" va VAN doi bai cam nhan. Co buoi chi
  // Thanh khong ra bai tap nhung van muon moi nguoi viet cam nhan - gop chung
  // mot cai dat thi hoac la doi ca hai, hoac la bo ca hai, khong dien ta duoc
  // truong hop o giua.
  const ngayKhongBaiTap = Array.isArray(cai['st-ngay-khong-bai-tap'])
    ? cai['st-ngay-khong-bai-tap'] : [];
  const khongBaiTap = ngayKhongBaiTap.map(Number).includes(dayNum);

  const canLink = !mienNop && !khongBaiTap && cai['st-tu-duyet-link'] !== false;
  const canCamNhan = !mienNop && cai['st-tu-duyet-cam-nhan'] !== false;

  // Chi doi "trong o co mot duong dan" chu khong doi ten mien nao: bat buoc
  // phai la facebook.com se chan nhung nguoi dan link m.facebook, fb.watch hay
  // link rut gon - va ho khong lam gi sai ca.
  const laLink = (v) => /^https?:\/\/\S+\.\S+/i.test(String(v || '').trim());

  const thieu = [];
  if (canLink && !laLink(duongDan)) thieu.push('link bài tập (Drive hoặc Notion)');
  if (canCamNhan && !laLink(linkCamNhan)) thieu.push('link bài cảm nhận trên nhóm Facebook');

  if (batTuDuyet && thieu.length === 0 && submission.status !== 'approved') {
    const awarded = await chotBaiThuThach(rc, svc, submission, task, {
      passed: true,
      score: null,                 // co y KHONG cham diem
      feedback: 'Đã nộp đủ bài — hệ thống ghi nhận tự động.',
      reviewedBy: 'tu-dong',
    });
    const daDuyet = await svc.ChallengeSubmission.get(submission.id);
    return json({ ok: true, submission: daDuyet, tu_duyet: true, awarded });
  }

  return json({
    ok: true,
    submission,
    tu_duyet: false,
    con_thieu: thieu.length ? thieu : null,
  });
}

/**
 * Chot mot bai nop thu thach: ghi ket qua, cong diem neu dat, cap nhat tien do,
 * bao tin cho nguoi hoc.
 *
 * Dung chung cho CA HAI duong cham - AI (scoreChallengeDay) va nguoi that
 * (reviewChallengeDay). Truoc day toan bo doan nay nam LONG trong ham AI, nen
 * khong co AI la khong co cach nao cong diem cho mot bai nop: admin co the doi
 * `status` qua API entity, nhung do chi doi duoc chu, diem van bang 0.
 */
async function chotBaiThuThach(rc, svc, submission, task, opts) {
  const { passed, score, feedback, rubric = null, reviewedBy } = opts;

  await svc.ChallengeSubmission.update(submission.id, {
    status: passed ? 'approved' : 'rejected',
    score,
    feedback,
    ai_rubric_json: rubric,
    reviewed_by: reviewedBy,
    reviewed_at: nowIso(),
  });

  // NOP BAI KHONG CON CONG DIEM (chi Thanh chot 11/09).
  //
  // Diem cua mot ngay gio chi den tu DIEM DANH (`event_attended`, 10 XP + 10
  // xu). Nop bai van duoc ghi nhan, van duyet, van tinh vao tien do va vao
  // chuoi ngay - chi khong ra XP/xu nua.
  //
  // Con `task.xp` / `task.coin` trong bang nhiem vu ngay: de nguyen chu khong
  // xoa cot, vi doi y quay lai chi la them lai loi goi awardPoints o day. Nhung
  // hai o do khong con tra ra gi - trang quan tri ghi ro dieu do de chi Thanh
  // khong dat so roi ngoi doi.
  const awarded = { xp: 0, coin: 0 };
  if (passed) {
    // Chuoi ngay VAN cap nhat: no do "hom nay co lam gi khong", khong phai mot
    // khoan thuong.
    await touchStreak(rc, submission.user_id);

    const done = (await svc.ChallengeSubmission.filter({
      challenge_id: submission.challenge_id, user_id: submission.user_id, status: 'approved',
    })).length;
    const member = (await svc.ChallengeMember.filter({
      challenge_id: submission.challenge_id, user_id: submission.user_id,
    }))[0];
    if (member) await svc.ChallengeMember.update(member.id, { progress: done });

    // Xong het cac ngay -> danh dau hoan thanh va trao thuong cua thu thach.
    //
    // Truoc day `challenges.reward_xp / reward_coin / reward_badge_id` chi duoc
    // HIEN THI tren trang Challenge, khong ham nao trao; va cot `completed`
    // khong bao gio thanh 1. Nguoi di het chang duong khong nhan duoc gi ngoai
    // diem cua tung ngay.
    if (member && !member.completed) {
      // CHI DEM NHUNG NGAY THUC SU NOP DUOC.
      //
      // Truoc day dem het moi dong trong challenge_day_tasks, ke ca ngay chi
      // diem danh. Buoi Kick-Off (ngay 0) nam trong `st-ngay-chi-diem-danh` nen
      // KHONG AI nop duoc no - tuc la voi 6 ngay, tran cua moi nguoi la 5/6 va
      // dieu kien `done >= tongNgay` khong bao gio dung. Ket qua do duoc tren
      // ban that: 262 nguoi tham gia, 0 nguoi hoan thanh, va phan thuong hoan
      // thanh chua tra cho ai lan nao.
      //
      // Bo nhung ngay mien nop ra khoi mau so thi "di het chang duong" tro lai
      // dung nghia den: lam het nhung gi co the lam la xong.
      const caiHT = await readSettings(rc, ['st-ngay-chi-diem-danh']);
      const ngayMien = (Array.isArray(caiHT['st-ngay-chi-diem-danh'])
        ? caiHT['st-ngay-chi-diem-danh'] : []).map(Number);
      const tongNgay = (await svc.ChallengeDayTask.filter({
        challenge_id: submission.challenge_id,
      })).filter((t) => !ngayMien.includes(Number(t.day))).length;
      if (tongNgay > 0 && done >= tongNgay) {
        await svc.ChallengeMember.update(member.id, { completed: true });
        const challenge = await svc.Challenge.get(submission.challenge_id);
        if (challenge?.reward_xp || challenge?.reward_coin) {
          await awardPoints(rc, {
            user_id: submission.user_id,
            event_key: 'challenge_day_scored',
            source_id: `hoanthanh-${submission.challenge_id}`,
            xp: challenge.reward_xp || 0,
            coin: challenge.reward_coin || 0,
            reason: `Hoàn thành: ${challenge.name}`,
          }).catch(() => null);
        }
        if (challenge?.reward_badge_id) {
          const badge = await rc.store.get('SELECT * FROM badges WHERE id = ?',
            [challenge.reward_badge_id]);
          if (badge) {
            await traoHuyHieu(rc, { userId: submission.user_id, badge, boiAi: 'he_thong' })
              .catch(() => null);
          }
        }
        await notify(svc, submission.user_id,
          `🏁 Hoàn thành ${challenge?.name || 'thử thách'}!`,
          'Bạn đã đi hết chặng đường. Xem phần thưởng trong hồ sơ nhé.', 'challenge');
      }
    }
  }

  await notify(svc, submission.user_id,
    passed ? 'Bai thu thach da dat' : 'Bai thu thach can sua lai',
    feedback, 'approval');

  return awarded;
}

/**
 * Admin/coach cham bai thu thach BANG TAY.
 *
 * Vi sao phai co: truoc day duong DUY NHAT de mot bai nop duoc cham la nho AI,
 * va duong do bat buoc co ANTHROPIC_API_KEY - khong co khoa thi tra 503 va bai
 * nop nam o 'pending' vinh vien. Nguoi hoc chi thay dong chu "Dang cho cham
 * bai..." nhap nhay mai mai. Mot chuong trinh 21 ngay khong the phu thuoc vao
 * viec mot khoa API con han hay khong. AI gio la LUA CHON.
 */
async function reviewChallengeDay(rc, svc) {
  if (!isStaff(rc)) return apiError(403, 'forbidden', 'Chi quan tri vien moi duoc cham');

  const { submission_id: submissionId, action, feedback, score } = rc.body || {};
  if (!submissionId || !['approve', 'reject'].includes(action)) {
    return apiError(400, 'missing', 'Thieu du lieu');
  }

  const submission = await svc.ChallengeSubmission.get(submissionId);
  if (!submission) return apiError(404, 'not_found', 'Khong tim thay bai nop');

  // Chi muc unique cua point_awards da chan cong diem hai lan, nhung van chan o
  // day de admin khong vo tinh doi ket qua da bao cho nguoi hoc.
  if (submission.status !== 'pending') {
    return apiError(409, 'already_done', 'Bai nay da duoc cham roi');
  }

  const task = (await svc.ChallengeDayTask.filter({
    challenge_id: submission.challenge_id, day: submission.day,
  }))[0];

  const passed = action === 'approve';
  const nhanXet = clean(feedback, 2000)
    || (passed ? 'Bai dat yeu cau. Tiep tuc giu nhip nhe!' : 'Bai can sua lai, xem lai huong dan cua ngay nay.');
  // Diem la tuy chon khi cham tay: khong nhap thi 100 (dat) / 0 (khong dat).
  const soDiem = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(100, Math.round(Number(score))))
    : (passed ? 100 : 0);

  const awarded = await chotBaiThuThach(rc, svc, submission, task, {
    passed, score: soDiem, feedback: nhanXet, reviewedBy: rc.user.id,
  });

  await svc.AdminLog.create({
    admin_id: rc.user.id,
    admin_name: rc.user.full_name,
    target_user_id: submission.user_id,
    target_user_name: submission.user_name,
    action: passed ? 'approve_challenge_day' : 'reject_challenge_day',
    details: `Ngay ${submission.day} - ${soDiem}/100 - +${awarded.xp} XP, +${awarded.coin} xu`,
    reason: nhanXet,
  });

  return json({ ok: true, passed, score: soDiem, awarded });
}

/** AI cham bai nop cua mot ngay, roi cong diem neu dat. */
async function scoreChallengeDay(rc, svc) {
  const { submission_id: submissionId } = rc.body || {};
  const submission = await svc.ChallengeSubmission.get(submissionId);
  if (!submission) return apiError(404, 'not_found', 'Không tìm thấy bài nộp');
  // Nguoi hoc duoc tu nho AI cham bai CUA MINH; admin cham duoc moi bai.
  if (submission.user_id !== rc.user.id && !isStaff(rc)) return apiError(403, 'forbidden', 'Không có quyền');

  // CHI CHAM BAI DANG CHO. Da cham roi thi thoi - giong reviewChallengeDay.
  //
  // Thieu phep thu nay thi cham lai bao nhieu lan cung duoc tren cung mot bai:
  // moi lan la mot lan goi API Anthropic that (tien that), va la mot lan quay
  // lai xem diem co khac khong. Noi dung bai nop di thang vao prompt
  // (functions/ai.js), nen quay du lan se ra lan model tra rubric toan `pass`.
  if (submission.status !== 'pending' && !isStaff(rc)) {
    return apiError(409, 'da_cham', 'Bài này đã chấm rồi. Nhắn admin nếu bạn muốn chấm lại.');
  }

  // Tran goi AI. Day la duong DUY NHAT nguoi dung thuong kich hoat duoc mot lan
  // goi API tinh tien, nen khong co tran la de ngo cho bat ky ai dang nhap duoc
  // dot het han muc API bang mot vong lap.
  if (!isStaff(rc)) {
    const tran = await rateLimit(rc, `ai-cham:${rc.user.id}`, 20, 60 * 60 * 1000);
    if (!tran.allowed) {
      return apiError(429, 'rate_limited',
        'Bạn nhờ AI chấm hơi nhiều lần trong một giờ. Nghỉ chút rồi quay lại nhé.');
    }
  }

  const task = (await svc.ChallengeDayTask.filter({
    challenge_id: submission.challenge_id, day: submission.day,
  }))[0];

  const result = await scoreWithAi(rc, {
    criteria: task?.guide,
    title: task?.title,
    content: submission.content,
    link: submission.link,
  });
  if (!result.ok) return apiError(503, 'ai_unavailable', result.error);

  const passed = result.score >= 60;
  const awarded = await chotBaiThuThach(rc, svc, submission, task, {
    passed,
    score: result.score,
    feedback: result.feedback,
    rubric: result.rubric,
    reviewedBy: 'ai',
  });

  return json({ ok: true, passed, score: result.score, feedback: result.feedback, rubric: result.rubric, awarded });
}

// --------------------------------------------------------------- cong dong
async function togglePostLike(rc, svc) {
  const postId = rc.body?.post_id;

  // Bam thich/bo thich lien tuc la mot vong lap ghi database re tien. Tran dat
  // cao de nguoi dung that khong bao gio cham toi.
  const tranThich = await rateLimit(rc, `like:${rc.user.id}`, 200, 60 * 60 * 1000);
  if (!tranThich.allowed) {
    return apiError(429, 'rate_limited', 'Bạn thao tác hơi nhanh, nghỉ chút nhé.');
  }

  const post = await svc.Post.get(postId);
  if (!post || post.is_hidden) return apiError(404, 'not_found', 'Không tìm thấy bài viết');

  const existing = (await svc.PostLike.filter({ post_id: postId, user_id: rc.user.id }))[0];
  if (existing) {
    await svc.PostLike.delete(existing.id);
    await rc.store.run(
      'UPDATE posts SET like_count = MAX(0, like_count - 1), updated_date = ? WHERE id = ?',
      [nowIso(), postId]);
    return json({ ok: true, liked: false });
  }

  await svc.PostLike.create({ post_id: postId, user_id: rc.user.id });
  await rc.store.run('UPDATE posts SET like_count = like_count + 1, updated_date = ? WHERE id = ?',
    [nowIso(), postId]);
  return json({ ok: true, liked: true });
}

/** Dang binh luan: tao dong + cap nhat bo dem + cong diem, di cung nhau. */
async function createComment(rc, svc) {
  const { post_id: postId, body } = rc.body || {};
  const text = clean(body, 2000);
  if (!postId || !text) return apiError(400, 'missing', 'Thiếu nội dung bình luận');

  // Tran giong createPost. Luat `pr-comment` da nam san trong database va cong
  // diem cho moi binh luan; trang Cong dong truoc day khong co duong vao nen
  // luat do chay rong. Gio trang da noi vao menu, khong co tran thi binh luan
  // thanh duong farm diem re nhat: mot vong lap la mot chuoi diem.
  const tranBinhLuan = await rateLimit(rc, `comment:${rc.user.id}`, 60, 60 * 60 * 1000);
  if (!tranBinhLuan.allowed) {
    return apiError(429, 'rate_limited', 'Bạn bình luận hơi nhanh, nghỉ chút nhé.');
  }

  const post = await svc.Post.get(postId);
  if (!post || post.is_hidden) return apiError(404, 'not_found', 'Không tìm thấy bài viết');

  const comment = await svc.PostComment.create({
    post_id: postId, user_id: rc.user.id, user_name: rc.user.full_name, body: text,
  });
  await rc.store.run(
    'UPDATE posts SET comment_count = comment_count + 1, updated_date = ? WHERE id = ?',
    [nowIso(), postId]);

  await awardPoints(rc, {
    user_id: rc.user.id, event_key: 'comment_created', source_id: comment.id,
    reason: 'Bình luận trong cộng đồng',
  });
  if (post.user_id !== rc.user.id) {
    await notify(svc, post.user_id, '💬 Có bình luận mới',
      `${rc.user.full_name}: ${text.slice(0, 80)}`, 'community');
  }
  return json({ ok: true, comment });
}

/** Dang bai. Tach khoi API entity vi con cong diem va chan spam. */
async function createPost(rc, svc) {
  const text = clean(rc.body?.body, 8000);
  if (!text) return apiError(400, 'missing', 'Bài viết đang trống');

  // Cung ly do voi screenshot_url trong logActivity: anh http:// bi CSP chan
  // luc hien, nen phai bao ngay chu khong luu im lang.
  const anhBai = anhUrl(rc.body?.image_url);
  if (anhBai === null) {
    return apiError(422, 'anh_khong_hop_le',
      'Link ảnh cần bắt đầu bằng https:// — bạn kiểm tra lại giúp nhé.');
  }

  const limit = await rateLimit(rc, `post:${rc.user.id}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Bạn đăng hơi nhanh, nghỉ chút nhé.');

  const post = await svc.Post.create({
    user_id: rc.user.id,
    user_name: rc.user.full_name,
    body: text,
    image_url: anhBai,
  });
  await awardPoints(rc, {
    user_id: rc.user.id, event_key: 'post_created', source_id: post.id,
    reason: 'Đăng bài trong cộng đồng',
  });
  return json({ ok: true, post });
}

// --------------------------------------------------------------- lop hoc
async function completeLesson(rc, svc) {
  if (!await daDangKyChuongTrinh(rc)) return apiError(403, 'chua_dang_ky', CHUA_DANG_KY);

  const lesson = await svc.Lesson.get(rc.body?.lesson_id);
  if (!lesson) return apiError(404, 'not_found', 'Không tìm thấy bài học');

  const course = await svc.Course.get(lesson.course_id);

  // CAP BAC cung la mot cong khoa, khong chi `requires_unlock`.
  //
  // gateByCourse (entities/repo.js) coi mot khoa la mo khi
  //     !requires_unlock VA myLevel >= min_level
  // nhung cho nay truoc day chi nhin `requires_unlock`. Nen mot khoa
  // requires_unlock = 0, min_level = 2 se: bi may chu che mat video_id, ma van
  // cho bam "Da hoc xong" va van cong du 15 XP / 5 xu - roi den bai cuoi cung
  // con cong tiep 200 XP / 100 xu thuong hoan thanh khoa.
  //
  // Tuc la hoc vien "hoc het" mot khoa ma may chu tu choi phat video, va bang
  // xep hang ghi nhan dieu do. Diem sai con te hon khong duoc diem.
  const canCap = Number(course?.min_level || 0);
  if (canCap > 0) {
    const capHienTai = await levelOf(rc.store, rc.user.id);
    if (capHienTai < canCap) {
      return apiError(403, 'chua_du_cap',
        `Bài này thuộc khoá cần cấp ${canCap}. Bạn tích thêm XP rồi quay lại nhé.`);
    }
  }

  if (course?.requires_unlock) {
    // PHAI tinh ca khoa mo qua GOI, dung cung mot luat voi cong che video
    // (khoaMoQuaGoi trong entities/repo.js). Neu chi nhin quyen `course` thi
    // 44 nguoi mua ve VIP truoc khi co noi dung se XEM DUOC video ma bam "Da
    // hoc xong" lai bi tu choi - xem duoc bai nhung khong duoc tinh cong.
    const [rieng, quaGoi] = await Promise.all([
      svc.Entitlement.filter({ user_id: rc.user.id, kind: 'course', ref: course.id }),
      khoaMoQuaGoi(rc.store, rc.user.id),
    ]);
    const ok = rieng.some((e) => !e.revoked_at) || quaGoi.has(course.id);
    if (!ok) return apiError(403, 'locked', 'Bạn chưa có quyền học khoá này.');
  }

  const existing = (await svc.LessonProgress.filter({
    user_id: rc.user.id, lesson_id: lesson.id,
  }))[0];
  if (existing?.completed) return json({ ok: true, already: true });

  if (existing) await svc.LessonProgress.update(existing.id, { completed: true, completed_at: nowIso() });
  else {
    await svc.LessonProgress.create({
      user_id: rc.user.id, course_id: lesson.course_id, lesson_id: lesson.id,
      completed: true, completed_at: nowIso(),
    });
  }

  const awarded = await awardPoints(rc, {
    user_id: rc.user.id, event_key: 'lesson_completed', source_id: lesson.id,
    xp: lesson.xp || null, coin: lesson.coin || null,
    reason: `Học xong: ${lesson.title}`,
  });

  // Xong het bai trong khoa -> thuong them.
  const [all, done] = await Promise.all([
    svc.Lesson.filter({ course_id: lesson.course_id }),
    svc.LessonProgress.filter({ user_id: rc.user.id, course_id: lesson.course_id, completed: true }),
  ]);
  let courseDone = false;
  if (all.length && done.length >= all.length) {
    courseDone = true;
    await awardPoints(rc, {
      user_id: rc.user.id, event_key: 'course_completed', source_id: lesson.course_id,
      reason: `Hoàn thành khoá: ${course?.name || ''}`,
    });
  }

  return json({ ok: true, awarded: { xp: awarded.xp, coin: awarded.coin }, course_completed: courseDone });
}

// --------------------------------------------------------------- doi qua
async function redeemReward(rc, svc) {
  if (!await daDangKyChuongTrinh(rc)) return apiError(403, 'chua_dang_ky', CHUA_DANG_KY);

  const reward = await svc.Reward.get(rc.body?.reward_id);
  if (!reward || !reward.is_active) return apiError(404, 'not_found', 'Phần thưởng không tồn tại');
  if (reward.quantity <= 0) return apiError(409, 'out_of_stock', 'Phần thưởng đã hết.');

  const user = await rc.store.get('SELECT total_xp, total_coin FROM users WHERE id = ?', [rc.user.id]);
  const level = await levelFor(rc.store, user.total_xp);
  if (reward.min_level > (level?.level_number || 1)) {
    return apiError(403, 'level_too_low',
      `Phần thưởng này cần cấp ${reward.min_level} trở lên.`);
  }

  // "Mo khoa bang loi moi, khong phai bang tien" - dung cau tren trang ban hang.
  // Dem o day chu khong tin vao mot cot da luu san: so luot co the tut xuong khi
  // admin huy mot luot dang ngo, va luc do mon qua phai khoa lai theo.
  const canMoi = Number(reward.min_referrals) || 0;
  if (canMoi > 0) {
    const cua = await affiliateOfUser(rc, rc.user);
    const daMoi = cua ? await rc.affiliates.validReferralCount(cua.id) : 0;
    if (daMoi < canMoi) {
      return apiError(403, 'chua_du_luot_moi',
        `Phần thưởng này mở khoá khi bạn mời đủ ${canMoi} người bạn. `
        + `Bạn đã mời được ${daMoi} người — mời thêm ${canMoi - daMoi} bạn nữa là nhận được ngay.`);
    }
  }
  if (user.total_coin < reward.coin_cost) {
    return apiError(409, 'not_enough_coin',
      `Bạn còn thiếu ${reward.coin_cost - user.total_coin} xu.`);
  }

  const spent = await spendCoin(rc, {
    user_id: rc.user.id,
    amount: reward.coin_cost,
    source: 'redemption',
    source_id: reward.id,
    description: `Đổi quà: ${reward.name}`,
  });
  if (!spent.ok) return apiError(409, 'not_enough_coin', 'Không đủ xu.');

  // Qua co san link (thuong la Notion) -> giao NGAY, khong qua hang doi duyet.
  // Mot mon qua ky thuat so thi khong co gi de "chuan bi", bat cho duyet la bat
  // cho vo ich - va chi Thanh khong the ngoi truc de bam duyet.
  //
  // Chep link sang chinh don doi qua thay vi doc nguoc ve bang `rewards`: doi
  // link cua mon qua sau nay khong duoc lam thay doi thu nguoi ta da nhan.
  const coLink = !!reward.delivery_url;
  const redemption = await svc.Redemption.create({
    user_id: rc.user.id, user_name: rc.user.full_name,
    reward_id: reward.id, reward_name: reward.name, reward_image_url: reward.image_url,
    coin_spent: reward.coin_cost,
    status: coLink ? 'delivered' : 'pending',
    delivery_url: reward.delivery_url || null,
    note: coLink ? clean(reward.delivery_note, 300) : '',
  });
  await rc.store.run('UPDATE rewards SET quantity = MAX(0, quantity - 1), updated_date = ? WHERE id = ?',
    [nowIso(), reward.id]);
  await notify(svc, rc.user.id,
    coLink ? `🎁 Quà "${reward.name}" đã mở` : '🎁 Đã ghi nhận yêu cầu đổi quà',
    coLink
      ? 'Mở trong mục Quà của tôi — xem lại bất cứ lúc nào.'
      : `${reward.name} — đang chờ admin xác nhận.`,
    'reward');

  return json({ ok: true, da_giao: coLink, delivery_url: redemption.delivery_url || null, redemption });
}

/** Admin duyet / giao / huy don doi qua. Huy thi HOAN LAI XU. */
async function updateRedemption(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const { redemption_id: id, status } = rc.body || {};
  if (!['approved', 'delivered', 'cancelled'].includes(status)) {
    return apiError(400, 'bad_status', 'Trạng thái không hợp lệ');
  }
  const redemption = await svc.Redemption.get(id);
  if (!redemption) return apiError(404, 'not_found', 'Không tìm thấy');
  if (redemption.status === 'cancelled') return apiError(409, 'already', 'Đơn này đã huỷ rồi');

  if (status === 'cancelled') {
    await refundCoin(rc, {
      user_id: redemption.user_id,
      amount: redemption.coin_spent,
      source_id: redemption.id,
      description: `Hoàn xu do huỷ đổi quà: ${redemption.reward_name}`,
    });
    await rc.store.run('UPDATE rewards SET quantity = quantity + 1 WHERE id = ?', [redemption.reward_id]);
    await notify(svc, redemption.user_id, '↩️ Đã hoàn xu',
      `Yêu cầu đổi "${redemption.reward_name}" bị huỷ, ${redemption.coin_spent} xu đã hoàn lại.`, 'reward');
  }

  await svc.Redemption.update(id, { status, note: clean(rc.body?.note, 300) });
  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name,
    target_user_id: redemption.user_id, target_user_name: redemption.user_name,
    action: `redemption_${status}`, details: redemption.reward_name,
  });
  return json({ ok: true, status });
}

// --------------------------------------------------------------- doi nhom
/**
 * Hoc vien tu chon nhom thi dua (Nhom 1-5).
 *
 * Chi doi duoc khi CHUA co nhom. Cho nhay nhom giua cuoc thi la mo duong cho
 * viec nhay sang nhom dang dan dau vao phut chot - ca bang thi dua mat y nghia.
 * Admin van doi duoc o trang Hoc vien khi co ly do that.
 *
 * Nhom day thi khong vao duoc: `teams.capacity` = 0 nghia la khong gioi han.
 */
/**
 * Chia nhom NGAU NHIEN va DEU cho nhung nguoi chua co nhom.
 *
 * Vi sao can: chi Thanh chia nhom sau buoi Zoom dau tien, va lop co ba tram
 * nguoi. Doi tung nguoi qua o chon trong trang Hoc vien la mot buoi toi ngoi
 * bam chuot, va gan nhu chac chan bo sot ai do.
 *
 * Tron truoc roi chia vong tron, nen khong nhom nao lech qua mot nguoi so voi
 * nhom khac - khac han viec "cho moi nguoi tu chon", kieu do luon ra mot nhom
 * dong gap ba nhom khac vi ai cung bam vao o dau tien.
 *
 * `bao_gom_da_co_nhom` de mac dinh false: chay lai nhieu lan cung chi dong den
 * nguoi CHUA co nhom, khong xao lai ca lop dang thi dua giua chung.
 */
/**
 * Danh so lai cac ngay cua mot thu thach, ghi CA BO trong mot lan.
 *
 * VI SAO PHAI CO HAM RIENG: bang co chi muc UNIQUE(challenge_id, day). Doi cho
 * hai ngay bang cach sua tung dong la KHONG BAO GIO lam duoc - buoc nao cung
 * dam vao dong kia. Chi Thanh da thu nhieu lan qua trang quan tri: moi lan deu
 * that bai, gia tri nhay ve nhu cu, va trong luc do noi dung mot buoi bi ghi de
 * mat.
 *
 * Cach lam: di qua so ngay AM tam thoi. Buoc mot day tat ca xuong -1, -2, -3...
 * (khong the dung voi so duong nao), buoc hai dat so that. Ca hai buoc nam
 * trong mot store.batch nen hoac xong het hoac khong doi gi - khong bao gio
 * de lai mot bo nua chung voi so ngay am.
 */
async function danhSoLaiNgay(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');

  const challengeId = String(rc.body?.challenge_id || '').trim();
  const ds = Array.isArray(rc.body?.ngay) ? rc.body.ngay : [];
  if (!challengeId || !ds.length) {
    return apiError(400, 'missing', 'Thiếu thử thách hoặc danh sách ngày');
  }

  const hopLe = ds
    .map((x) => ({ id: String(x?.id || '').trim(), day: Number(x?.day) }))
    .filter((x) => x.id && Number.isInteger(x.day) && x.day >= 0);
  if (hopLe.length !== ds.length) {
    return apiError(400, 'du_lieu_sai', 'Mỗi dòng cần id và số ngày (số nguyên, từ 0)');
  }

  const trung = new Set();
  for (const x of hopLe) {
    if (trung.has(x.day)) {
      return apiError(409, 'trung_ngay', `Ngày ${x.day} bị đặt cho hai nhiệm vụ.`);
    }
    trung.add(x.day);
  }

  // Chi cho danh so lai nhung dong THUOC thu thach nay - khong the muon ham nay
  // de sua ngay cua mot thu thach khac.
  const cua = await rc.store.all(
    'SELECT id FROM challenge_day_tasks WHERE challenge_id = ?', [challengeId]);
  const trongNha = new Set(cua.map((r) => r.id));
  const lac = hopLe.filter((x) => !trongNha.has(x.id));
  if (lac.length) {
    return apiError(404, 'not_found', 'Có nhiệm vụ không thuộc thử thách này');
  }

  const t = nowIso();
  const lenh = [
    ...hopLe.map((x, i) => rc.store.prepare(
      'UPDATE challenge_day_tasks SET day = ?, updated_date = ? WHERE id = ?',
      [-(i + 1), t, x.id])),
    ...hopLe.map((x) => rc.store.prepare(
      'UPDATE challenge_day_tasks SET day = ?, updated_date = ? WHERE id = ?',
      [x.day, t, x.id])),
  ];
  await rc.store.batch(lenh);

  await rc.store.audit('challenge.renumber_days', challengeId,
    { ngay: hopLe.map((x) => `=`) }, rc.ip).catch(() => {});

  const sau = await rc.store.all(
    'SELECT id, day, title FROM challenge_day_tasks WHERE challenge_id = ? ORDER BY day',
    [challengeId]);
  return json({ ok: true, ngay: sau });
}
/**
 * Chuan bi cho mot don mua trong khu vuc thanh vien: bao dam nguoi mua co
 * `lead`, va ghi nhan ma gioi thieu neu ho nhap.
 *
 * VI SAO CAN MOT BUOC RIENG - va vi sao KHONG them `orders.user_id`:
 *
 * Toan bo he hoa hong noi voi nhau qua bang `leads`, khong qua `users`.
 * `createCommission` thoat ngay dong dau neu don khong co `lead_id`
 * (worker/src/affiliates.js), va MOI bao cao doanh so cua dai ly deu JOIN
 * `leads`. Them mot cot user_id vao don thi sach hon ve mo hinh du lieu, nhung
 * phai sua ca duong di cua tien - noi co ba lop chong tinh hai lan duoc canh
 * bao rat ky o worker/src/routes/webhook.js.
 *
 * Ma so lieu that thi khong can den do: 425 trong 480 hoc vien DA co
 * `legacy_lead_id`. Voi ho, don chi can gan dung `lead_id` la hoa hong va thong
 * ke chay y nhu hom nay, khong sua mot dong nao. 55 nguoi con lai deu vao thang
 * bang Google - va ho cung chinh la 55 nguoi chua co so dien thoai. Hoi so dien
 * thoai o buoc thanh toan la chuyen tu nhien khi mua hang chuyen khoan, nen cho
 * nay vua la mat xich con thieu vua la thu khach mong doi.
 */
/**
 * Tim nguoi gioi thieu de chon trong o tha xuong cua gian hang.
 *
 * VI SAO KHONG TRA VE CA DANH SACH: co 439 nguoi. Do het ve trinh duyet vua
 * nang vua bien mot o chon thanh mot ban danh ba tai duoc.
 *
 * VI SAO EMAIL BI CHE: nguoi mua can phan biet hai nguoi trung ten, chu khong
 * can dia chi that cua ho. Tra ve email day du la de bat ky ai dang nhap cung
 * gom duoc 439 dia chi hoc vien - do la ro ri du lieu ca nhan, va khong ai
 * phat hien ra vi no trong nhu mot tinh nang binh thuong.
 *
 * TEN thi KHONG che: nguoi mua tim nguoi gioi thieu bang ten, che di thi o nay
 * thanh vo dung.
 */
async function timNguoiGioiThieu(rc) {
  const tu = String(rc.body?.q || '').trim();
  if (tu.length < 2) return json({ ok: true, ds: [] });

  const mau = `%${tu.toLowerCase()}%`;
  const rows = await rc.store.all(
    `SELECT code, full_name, email FROM affiliates
      WHERE status = 'active'
        AND (lower(full_name) LIKE ? OR lower(code) LIKE ? OR lower(email) LIKE ?)
      ORDER BY full_name LIMIT 20`,
    [mau, mau, mau]);

  const cheEmail = (e) => {
    const s = String(e || '');
    const at = s.indexOf('@');
    if (at < 1) return '';
    const dau = s.slice(0, at);
    const giu = dau.slice(0, Math.min(3, dau.length));
    return `${giu}${'*'.repeat(Math.max(2, dau.length - giu.length))}${s.slice(at)}`;
  };

  return json({
    ok: true,
    ds: rows.map((r) => ({
      code: r.code,
      ten: r.full_name || '(chưa có tên)',
      email_che: cheEmail(r.email),
    })),
  });
}

async function chuanBiDatHang(rc) {
  const maGioiThieu = String(rc.body?.ref_code || '').trim().toUpperCase();
  const soDienThoai = String(rc.body?.phone || '').trim();

  // ------------------------------------------------------------------ email
  //
  // KHONG PHAI CHI DE LIEN HE. `orders.customer_email` la thu DAU TIEN ma
  // `findBuyer` (commerce/fulfil.js) dung de biet mo quyen cho tai khoan nao.
  // Nen mot email go nham khong chi lam sai dia chi nhan thu - no co the mo
  // san pham cho NGUOI KHAC, va nguoi tra tien khong nhan duoc gi.
  //
  // Vi vay o day tu choi thang khi email do dang thuoc mot tai khoan khac,
  // thay vi im lang nhan roi hong o buoc giao hang.
  const emailXin = String(rc.body?.email || '').trim();
  let emailMoi = '';
  if (emailXin) {
    const kiemEmail = validateEmail(emailXin);
    if (kiemEmail.error) return apiError(422, 'email_khong_hop_le', 'Email chưa đúng định dạng.');
    emailMoi = kiemEmail.value;
    if (emailMoi !== String(rc.user.email || '').toLowerCase()) {
      const cuaNguoiKhac = await rc.store.get(
        'SELECT id FROM users WHERE lower(email) = ? AND id <> ?', [emailMoi, rc.user.id]);
      if (cuaNguoiKhac) {
        return apiError(409, 'email_cua_nguoi_khac',
          'Email này đang thuộc một tài khoản khác. Dùng email của bạn để quyền mở đúng người nhé.');
      }
    }
  }

  let lead = rc.user.legacy_lead_id
    ? await rc.store.getLeadById(rc.user.legacy_lead_id)
    : null;

  // Chua noi qua legacy_lead_id thi thu theo email - nguoi dien form bang mot
  // email roi tao tai khoan sau van la mot nguoi.
  if (!lead && rc.user.email) {
    lead = await rc.store.get(
      'SELECT * FROM leads WHERE lower(email) = lower(?) ORDER BY id ASC LIMIT 1',
      [rc.user.email]);
  }

  if (!lead) {
    // `leads.phone_e164` vua NOT NULL vua UNIQUE - khong co so dien thoai thi
    // khong tao duoc dong lead, ma khong co lead thi khong tinh duoc hoa hong.
    const so = soDienThoai || rc.user.phone_e164 || rc.user.phone || '';
    const kiem = validatePhone(so, rc.body?.country_code || '+84');
    if (!kiem.value) {
      return apiError(422, 'thieu_dien_thoai',
        'Bạn cho mình xin số điện thoại để liên hệ khi giao hàng nhé.');
    }

    // So nay da thuoc ve mot lead khac -> dung lead do thay vi tao trung, neu
    // khong cau INSERT se vo rang buoc UNIQUE va don khong tao duoc.
    lead = await rc.store.getLeadByPhone(kiem.value.e164);
    if (!lead) {
      const kq = await rc.store.upsertLead({
        session_id: rc.sid || null,
        full_name: rc.user.full_name || '',
        email: emailMoi || rc.user.email || '',
        phone: kiem.value.phone,
        phone_e164: kiem.value.e164,
        country_code: rc.body?.country_code || '+84',
        answers_json: JSON.stringify({}),
        score: 0,
        segment: 'member',
        utm_source: 'khu-vuc-thanh-vien',
        utm_campaign: '',
        ip: rc.ip,
        user_agent: rc.userAgent,
      });
      lead = kq.lead;
    }

    // Noi tai khoan voi lead vua co, de lan sau khong phai do lai.
    await rc.store.run(
      'UPDATE users SET legacy_lead_id = ?, updated_date = ? WHERE id = ? AND legacy_lead_id IS NULL',
      [lead.id, nowIso(), rc.user.id]).catch(() => {});
  }

  // Lead da co san: ghi email nguoi mua vua dien, nhung CHI khi dong lead do la
  // cua chinh ho (da noi qua legacy_lead_id) hoac dang bo trong. Mot lead tim
  // duoc theo SO DIEN THOAI co the la cua nguoi khac dung chung so - ghi de
  // email len do la sua ho so cua nguoi la.
  if (emailMoi && emailMoi !== String(lead.email || '').toLowerCase()) {
    const laCuaHo = String(rc.user.legacy_lead_id || '') === String(lead.id)
      || !String(lead.email || '').trim();
    if (laCuaHo) {
      await rc.store.run('UPDATE leads SET email = ?, updated_at = ? WHERE id = ?',
        [emailMoi, nowIso(), lead.id]).catch(() => {});
      lead = { ...lead, email: emailMoi };
    }
  }

  // ------------------------------------------------------------ ma gioi thieu
  //
  // CHI GHI KHI DANG TRONG. Nguoi da duoc ai do gioi thieu tu truoc ma bi ghi
  // de la CUOP HOA HONG cua nguoi gioi thieu dau tien - va khong ai phat hien
  // ra duoc, vi cot cu bi thay the im lang.
  let ketQuaGioiThieu = null;
  if (maGioiThieu && !lead.referred_by) {
    const nguoiGioiThieu = await rc.affiliates.getByCode(maGioiThieu);
    if (!nguoiGioiThieu || nguoiGioiThieu.status !== 'active') {
      ketQuaGioiThieu = { ok: false, ly_do: 'Mã giới thiệu không đúng' };
    } else {
      const kq = await rc.affiliates.creditReferral(lead, nguoiGioiThieu, { ip: rc.ip });
      ketQuaGioiThieu = kq.credited
        ? { ok: true, ten: rc.affiliates.maskName(nguoiGioiThieu.full_name) }
        : { ok: false, ly_do: kq.reason || 'Không ghi nhận được' };
      lead = await rc.store.getLeadById(lead.id);
    }
  } else if (maGioiThieu && lead.referred_by) {
    ketQuaGioiThieu = { ok: false, ly_do: 'Bạn đã có người giới thiệu từ trước' };
  }

  return json({ ok: true, lead_id: lead.id, gioi_thieu: ketQuaGioiThieu });
}
async function chiaNhomNgauNhien(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');

  const nhom = await rc.store.all('SELECT id, name FROM teams ORDER BY name');
  if (!nhom.length) return apiError(409, 'chua_co_nhom', 'Chưa có nhóm nào để chia.');

  const lamLaiTuDau = rc.body?.bao_gom_da_co_nhom === true;
  const nguoi = await rc.store.all(
    `SELECT id FROM users
      WHERE status = 'active' AND role = 'member'
        ${lamLaiTuDau ? '' : 'AND (team_id IS NULL OR length(team_id) = 0)'}
      ORDER BY created_date`);

  if (!nguoi.length) {
    return json({ ok: true, da_chia: 0, ghi_chu: 'Không còn ai chưa có nhóm.' });
  }

  // Fisher-Yates: tron that su, khong phai sort(() => Math.random() - 0.5) -
  // cai do lech han ve mot phia va nhieu nguoi tuong la ngau nhien.
  const thuTu = nguoi.map((u) => u.id);
  for (let i = thuTu.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [thuTu[i], thuTu[j]] = [thuTu[j], thuTu[i]];
  }

  const t = nowIso();
  const dem = Object.fromEntries(nhom.map((n) => [n.name, 0]));
  const lenh = thuTu.map((id, i) => {
    const n = nhom[i % nhom.length];
    dem[n.name] += 1;
    return rc.store.prepare('UPDATE users SET team_id = ?, updated_date = ? WHERE id = ?',
      [n.id, t, id]);
  });

  // Chia lo 200 lenh: mot batch qua lon la D1 tu choi ca cum.
  for (let i = 0; i < lenh.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    await rc.store.batch(lenh.slice(i, i + 200));
  }

  await svc.AdminLog.create({
    admin_id: rc.user.id,
    admin_name: rc.user.full_name,
    action: 'chia_nhom_ngau_nhien',
    details: `${thuTu.length} người · ${Object.entries(dem).map(([k, v]) => `${k}: ${v}`).join(' · ')}`,
  });

  return json({ ok: true, da_chia: thuTu.length, theo_nhom: dem });
}

async function chonNhom(rc) {
  const teamId = String(rc.body?.team_id || '').trim();
  if (!teamId) return apiError(400, 'missing', 'Chưa chọn nhóm');

  const me = await rc.store.get('SELECT team_id FROM users WHERE id = ?', [rc.user.id]);

  // Doi nhom duoc, TRU KHI quan tri vien khoa lai.
  //
  // Truoc day day la "chon mot lan, muon doi phai nho admin". Chi Thanh chot
  // cho doi: trong tuan dau nguoi ta bam nham nhom rat nhieu, va bat ho nhan
  // Zalo cho tung truong hop con ton thoi gian hon la cai gia phai tra.
  //
  // Cai gia do co that: bang xep hang co diem thi dua NHOM, nen cuoi chuong
  // trinh se co nguoi nhay sang nhom dang dan dau. Khoa lai truoc khi cong diem
  // thi dua bang mot dong:
  //   INSERT INTO app_settings (key,value,type) VALUES ('st-khoa-doi-nhom','true','bool')
  if (me?.team_id && me.team_id !== teamId) {
    const cai = await readSettings(rc, ['st-khoa-doi-nhom']);
    if (cai['st-khoa-doi-nhom'] === true) {
      return apiError(409, 'khoa_doi_nhom',
        'Nhóm đã được chốt, không đổi được nữa. Cần đổi thì nhắn quản trị viên nhé.');
    }
  }

  const team = await rc.store.get('SELECT id, name, capacity FROM teams WHERE id = ?', [teamId]);
  if (!team) return apiError(404, 'not_found', 'Không tìm thấy nhóm này');

  // Dang o dung nhom do roi thi khong lam gi - va nhat la KHONG bao "da day",
  // vi chinh ho dang chiem mot cho trong so dem.
  if (me?.team_id === teamId) {
    return json({ ok: true, team: { id: team.id, name: team.name }, khong_doi: true });
  }

  if (team.capacity > 0) {
    const dem = await rc.store.get('SELECT COUNT(*) AS n FROM users WHERE team_id = ?', [teamId]);
    if (Number(dem?.n || 0) >= team.capacity) {
      return apiError(409, 'nhom_day', `${team.name} đã đủ người. Bạn chọn nhóm khác nhé.`);
    }
  }

  await rc.store.run('UPDATE users SET team_id = ?, updated_date = ? WHERE id = ?',
    [teamId, nowIso(), rc.user.id]);
  return json({ ok: true, team: { id: team.id, name: team.name } });
}

/**
 * Danh sach nhom kem so nguoi va con cho hay khong.
 *
 * Rieng ra khoi API entity vi entity khong dem duoc so thanh vien, ma man hinh
 * chon nhom can con so do de bao "nhom nay da day".
 */
async function danhSachNhom(rc) {
  const rows = await rc.store.all(
    `SELECT t.id, t.name, t.color, t.capacity,
       (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id) AS so_nguoi
     FROM teams t ORDER BY t.name`);
  return json({
    ok: true,
    teams: rows.map((t) => ({
      ...t,
      con_cho: !t.capacity || Number(t.so_nguoi) < Number(t.capacity),
    })),
  });
}

// --------------------------------------------------------------- diem danh
/**
 * Hoc vien TU diem danh trong khung gio cua buoi hoc.
 *
 * Truoc day chi admin diem danh duoc (markEventAttendance), nghia la moi buoi
 * chi Thanh phai ngoi tick tung nguoi. Ham nay mo duong cho hoc vien tu bam,
 * nhung chi trong khung gio khai o `checkin_open_min`..`checkin_close_min`
 * (mac dinh 0..15 phut ke tu gio bat dau = "9:00-9:15, sau 9:15 khoa").
 *
 * Khung gio tinh bang PHUT SO VOI `starts_at` chu khong phai gio tuyet doi, nen
 * doi lich buoi hoc la khung gio tu troi theo - khong phai sua lai tung buoi.
 *
 * Diem cong qua awardPoints voi source_id = id dong dang ky, y het
 * markEventAttendance - bam hai lan khong cong hai lan.
 */
async function diemDanh(rc, svc) {
  const eventId = String(rc.body?.event_id || '').trim();
  if (!eventId) return apiError(400, 'missing', 'Thiếu buổi học');

  const event = await svc.CalendarEvent.get(eventId);
  if (!event) return apiError(404, 'not_found', 'Không tìm thấy buổi học');
  if (event.status === 'cancelled') return apiError(409, 'da_huy', 'Buổi này đã huỷ');

  const batDau = new Date(event.starts_at).getTime();
  if (!Number.isFinite(batDau)) return apiError(500, 'gio_hong', 'Buổi học chưa đặt giờ bắt đầu');

  const moLuc = batDau + Number(event.checkin_open_min ?? 0) * 60000;
  const dongLuc = batDau + Number(event.checkin_close_min ?? 15) * 60000;
  const bayGio = Date.now();

  if (bayGio < moLuc) {
    const phut = Math.ceil((moLuc - bayGio) / 60000);
    return apiError(409, 'chua_mo', `Điểm danh mở sau ${phut} phút nữa.`);
  }
  if (bayGio > dongLuc) {
    return apiError(409, 'da_khoa',
      `Điểm danh đã khoá sau ${event.checkin_close_min ?? 15} phút kể từ giờ bắt đầu.`);
  }

  let signup = (await svc.EventSignup.filter({ event_id: eventId, user_id: rc.user.id }))[0];
  if (!signup) {
    // Buoi nay la mot NGAY cua thu thach ma nguoi do da tham gia -> vao thu
    // thach chinh la giu cho. Bat ho quay sang trang Lich giu cho tung buoi
    // roi moi quay lai diem danh la mot vong thua, ma vong nao cung mat nguoi.
    const laNgayThuThach = await rc.store.get(
      `SELECT 1 FROM challenge_day_tasks t
         JOIN challenge_members m
           ON m.challenge_id = t.challenge_id AND m.user_id = ?
        WHERE t.event_id = ? LIMIT 1`, [rc.user.id, eventId]);
    if (!laNgayThuThach) return apiError(403, 'chua_giu_cho', 'Bạn cần giữ chỗ buổi này trước đã.');
    signup = await svc.EventSignup.create({
      event_id: eventId,
      event_title: event.title,
      user_id: rc.user.id,
      user_name: rc.user.full_name,
      status: 'registered',
      registered_at: nowIso(),
    });
  }
  if (signup.status === 'attended') return json({ ok: true, da_diem_danh: true });

  await svc.EventSignup.update(signup.id, { status: 'attended', attended_at: nowIso() });

  // source_id la NGUOI + BUOI, khong phai id dong dang ky.
  //
  // awardPoints chong trung theo (user_id, event_key, source_id). Lay id dong
  // dang ky lam source_id thi chong trung do gan vao mot ban ghi ma chinh nguoi
  // dung XOA DUOC (EventSignup.delete cho phep chu so huu). Vong lap
  // joinEvent -> diemDanh -> xoa dong dang ky -> joinEvent lai sinh id moi moi
  // lan, nen moi vong lai duoc cong tiep - ma luat `event_attended` khong dat
  // daily_cap lan lifetime_cap. Tuc la XP va XU khong gioi han, va xu doi duoc
  // qua that.
  //
  // Ghep tu event_id va user_id thi khoa chong trung khong con phu thuoc vao
  // ban ghi nao ca: mot nguoi, mot buoi, cong diem dung mot lan, xoa gi cung
  // khong lam moi duoc no.
  const award = await awardPoints(rc, {
    user_id: rc.user.id,
    event_key: 'event_attended',
    source_id: `${event.id}:${rc.user.id}`,
    reason: `Điểm danh: ${event.title}`,
  });

  return json({ ok: true, awarded: { xp: award.xp, coin: award.coin } });
}

/**
 * Lich diem danh cua tung ngay trong mot thu thach.
 *
 * Chi tra ve nhung ngay CO gan buoi live (challenge_day_tasks.event_id). Ngay
 * khong gan gi thi the ngay do khong hien nut diem danh - khong bia ra mot
 * khung gio khong ai dat.
 *
 * Tra ve khung gio bang PHUT so voi gio bat dau chu khong tra ve "dang mo hay
 * chua": trang phai tu dem nguoc moi giay, con may chu thi chi tra loi mot lan.
 * May chu van la noi quyet dinh cuoi cung - xem diemDanh().
 */
async function lichThuThach(rc) {
  const challengeId = String(rc.body?.challenge_id || '').trim();
  if (!challengeId) return apiError(400, 'missing', 'Thiếu thử thách');

  const rows = await rc.store.all(
    `SELECT t.day, t.event_id, e.title, e.starts_at, e.status AS trang_thai_buoi,
            COALESCE(e.checkin_open_min, 0)  AS mo,
            COALESCE(e.checkin_close_min, 15) AS dong,
            s.status AS cho_ngoi
       FROM challenge_day_tasks t
       JOIN calendar_events e ON e.id = t.event_id
       LEFT JOIN event_signups s ON s.event_id = e.id AND s.user_id = ?
      WHERE t.challenge_id = ? AND t.event_id IS NOT NULL AND t.event_id <> ''
      ORDER BY t.day`, [rc.user.id, challengeId]);

  return json({
    ok: true,
    days: rows.map((r) => ({
      day: Number(r.day),
      event_id: r.event_id,
      title: r.title,
      starts_at: r.starts_at,
      checkin_open_min: Number(r.mo),
      checkin_close_min: Number(r.dong),
      da_diem_danh: r.cho_ngoi === 'attended',
      da_huy: r.trang_thai_buoi === 'cancelled',
    })),
  });
}

// ------------------------------------------------------ thu moi chua den noi
/**
 * Cau lenh tim nhung nguoi CHUA BAO GIO nhan duoc thu moi vao lop.
 *
 * Dieu kien "chua vao duoc" gom ba ve, thieu ve nao cung sai:
 *   - chua co lan gui invite_app nao thanh cong
 *   - chua tung dat mat khau  (credentials)
 *   - chua tung dang nhap Google (oauth_accounts)
 * Hai ve sau quan trong: ai da vao lop bang duong khac thi gui them mot link
 * dat mat khau chi lam ho hoang, tuong co ke dang nghich tai khoan.
 */
const SQL_CHUA_NHAN_THU = `
  SELECT u.id, u.email, u.full_name, u.legacy_lead_id, u.created_date
    FROM users u
   WHERE u.status = 'active' AND u.role = 'member' AND u.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM emails_sent e
                      WHERE e.to_addr = u.email AND e.template = 'invite_app'
                        AND e.status = 'sent')
     AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM oauth_accounts o WHERE o.user_id = u.id)
   ORDER BY u.created_date`;

/** Dem xem con bao nhieu nguoi chua nhan duoc thu moi. */
async function thuMoiChuaDen(rc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const rows = await rc.store.all(SQL_CHUA_NHAN_THU);
  return json({
    ok: true,
    tong: rows.length,
    danh_sach: rows.slice(0, 50).map((u) => ({
      id: u.id, email: u.email, full_name: u.full_name, created_date: u.created_date,
    })),
  });
}

/**
 * Gui lai thu moi cho tung nguoi mot, co tran.
 *
 * Co tran vi han muc gui cua Resend co han: ban het lan mot luc thi lai that
 * bai hang loat y nhu lan dau. Gap loi "quota" la DUNG NGAY - gui tiep chi to
 * lam ban them ban ghi that bai chu khong den duoc ai.
 */
async function guiLaiThuMoiHangLoat(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const tran = Math.min(Math.max(Number(rc.body?.limit) || 25, 1), 100);

  // CHUA CAU HINH EMAIL thi dung ngay, dung chay het danh sach.
  //
  // Vong lap ben duoi chi dung som khi ly do khop /quota|rate|limit/. Thieu
  // RESEND_API_KEY tra ly do 'chua_cau_hinh_email' - khong khop - nen truoc day
  // no chay het 25 nguoi, tra `da_gui: 0`, va giao dien hien toast XANH "Da gui
  // 0 thu moi" khong mot chu nao noi vi sao. Moi lan bam con ghi 25 dong
  // password_resets va 25 dong emails_sent that bai.
  if (!rc.env.RESEND_API_KEY) {
    return apiError(503, 'email_chua_cau_hinh',
      'Chưa bật gửi email nên không gửi được thư mời nào. '
      + 'Cần nạp RESEND_API_KEY: npx wrangler secret put RESEND_API_KEY');
  }

  const rows = await rc.store.all(SQL_CHUA_NHAN_THU);
  let daGui = 0;
  let hong = 0;
  let dungVi = null;

  for (const u of rows.slice(0, tran)) {
    const ket = await guiLaiThuMoi(rc, u);
    if (ket.ok) { daGui += 1; continue; }
    hong += 1;
    if (/quota|rate|limit/i.test(String(ket.reason || ''))) { dungVi = 'het_han_muc'; break; }
  }

  await svc.AdminLog.create({
    admin_id: rc.user.id,
    admin_name: rc.user.full_name,
    action: 'resend_invites',
    details: `gui lai ${daGui}, hong ${hong}, con lai ${Math.max(0, rows.length - daGui)}`,
  });

  return json({
    ok: true,
    da_gui: daGui,
    hong,
    con_lai: Math.max(0, rows.length - daGui),
    dung_vi: dungVi,
  });
}

// --------------------------------------------------------------- thong bao
/**
 * Admin gui thong bao cho nhieu nguoi cung luc.
 *
 * Truoc day KHONG co kenh nao de chu dong noi voi hoc vien: thong bao chi sinh
 * tu dong khi len cap hay duoc duyet bai. Muon bao "toi nay 8h co buoi live" thi
 * khong co duong nao ngoai Zalo.
 *
 * Gioi han 2000 nguoi mot lan: D1 khong nen nhan mot batch lon hon the, va neu
 * lop dong hon so do thi nen gui bang email chu khong phai chuong trong app.
 *
 * `link` la duong dan trong app (vd '/calendar') - bam vao thong bao la di thang
 * toi noi can den. Chi nhan duong dan NOI BO: cho phep http ben ngoai la bien o
 * thong bao thanh cho phat tan link la.
 */
async function sendNotification(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');

  const title = clean(rc.body?.title, 160);
  const body = clean(rc.body?.body, 1000);
  const doiTuong = rc.body?.audience || 'all';   // all | role | team | user
  if (!title) return apiError(400, 'missing', 'Thiếu tiêu đề thông báo');

  // Cho phep CA link ra ngoai (https://) chu khong chi duong dan trong app.
  // Truoc day link ngoai bi xoa IM LANG: chi Thanh dan link Zoom vao o link,
  // bam gui, he thong bao "da gui toi 347 nguoi" - va 347 nguoi nhan mot thong
  // bao khong co nut bam. Chi chan cac lich khong phai http (javascript:,
  // data:) vi do la duong chay ma trong trinh duyet cua hoc vien.
  //
  // Duong dan NOI BO phai la mot dau / roi den chu - khong duoc la "//" hay
  // "/\\". Ca hai deu qua duoc phep thu "co bat dau bang / khong", nhung trinh
  // duyet doc chung la dia chi NGOAI: //evil.com va /\\evil.com deu dan nguoi
  // bam ra khoi manhthanh.net. Do cung la dang ma canh bao
  // GHSA-wrjc-x8rr-h8h6 cua react-router noi toi (navigate(tin.link) o
  // ThongBao). Hien chi quan tri moi gui duoc thong bao, nen day la lop chan
  // du phong chu khong phai lo hong dang mo - nhung mot phep thu dung thi re
  // hon mot cuoc dieu tra sau nay.
  let link = String(rc.body?.link || '').trim();
  const noiBoHopLe = /^\/(?![/\\])/.test(link);
  if (link && !noiBoHopLe && !/^https:\/\//i.test(link)) link = '';

  // Thong bao quan trong hien thang giua man hinh thay vi nam trong chuong.
  // Dung cho nhung thu co han: link Zoom mo luc 9:00, khung diem danh 15 phut.
  const laPopup = rc.body?.popup === true;

  let sql = "SELECT id FROM users WHERE status = 'active'";
  const args = [];
  if (doiTuong === 'role') {
    const role = ['member', 'coach', 'admin'].includes(rc.body?.role) ? rc.body.role : 'member';
    sql += ' AND role = ?'; args.push(role);
  } else if (doiTuong === 'team') {
    if (!rc.body?.team_id) return apiError(400, 'missing', 'Thiếu đội nhóm');
    sql += ' AND team_id = ?'; args.push(rc.body.team_id);
  } else if (doiTuong === 'user') {
    if (!rc.body?.user_id) return apiError(400, 'missing', 'Thiếu học viên');
    sql += ' AND id = ?'; args.push(rc.body.user_id);
  }
  sql += ' LIMIT 2000';

  const nguoiNhan = await rc.store.all(sql, args);
  if (!nguoiNhan.length) return apiError(404, 'khong_co_ai', 'Không có ai khớp nhóm đã chọn');

  const t = nowIso();
  // Chia lo 50: batch cua D1 co tran, mot lop 2000 nguoi trong mot batch se hong.
  for (let i = 0; i < nguoiNhan.length; i += 50) {
    /* eslint-disable no-await-in-loop */
    await rc.store.batch(nguoiNhan.slice(i, i + 50).map((u) => rc.store.prepare(
      `INSERT INTO notifications (id, user_id, title, body, type, link, is_read,
         created_date, updated_date) VALUES (?,?,?,?,?,?,0,?,?)`,
      [newId(), u.id, title, body, laPopup ? 'popup' : 'admin', link || null, t, t])));
    /* eslint-enable no-await-in-loop */
  }

  // Ghi vao nhat ky quan tri chu KHONG doc lai bang notifications de lam lich su
  // gui: chinh sach cua Notification la `read: 'own'` - ke ca admin cung khong
  // duoc doc thong bao rieng cua nguoi khac, va do la quyet dinh co y. Mot dong
  // nhat ky cho moi lan gui con de doc hon 2000 dong thong bao giong het nhau.
  await svc.AdminLog.create({
    admin_id: rc.user.id,
    admin_name: rc.user.full_name,
    action: 'send_notification',
    details: `${title} → ${nguoiNhan.length} người (${doiTuong})`,
    reason: body || '',
  });
  await rc.store.audit('notification.broadcast', doiTuong,
    { so_nguoi: nguoiNhan.length, title }, rc.ip);
  return json({ ok: true, so_nguoi: nguoiNhan.length });
}

// --------------------------------------------------------------- huy hieu
/**
 * Admin trao huy hieu bang tay.
 *
 * Van can duong tay du da co may tu dong: co nhung thu he thong khong do duoc -
 * dan dat nguoi khac trong nhom, chia se mot bai dang cham, den dung gio suot
 * khoa. Nhung huy hieu do co the de trong `condition_type` va chi trao tay.
 */
async function grantBadge(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const { target_user_id: targetId, badge_id: badgeId } = rc.body || {};
  if (!targetId || !badgeId) return apiError(400, 'missing', 'Thiếu học viên hoặc huy hiệu');

  const target = await rc.store.get('SELECT id, full_name FROM users WHERE id = ?', [targetId]);
  if (!target) return apiError(404, 'not_found', 'Không tìm thấy học viên');
  const badge = await rc.store.get('SELECT * FROM badges WHERE id = ?', [badgeId]);
  if (!badge) return apiError(404, 'not_found', 'Không tìm thấy huy hiệu');

  const kq = await traoHuyHieu(rc, { userId: targetId, badge, boiAi: rc.user.id });
  if (!kq.ok) return apiError(409, 'da_co', 'Học viên này đã có huy hiệu đó rồi');

  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name,
    target_user_id: targetId, target_user_name: target.full_name,
    action: 'grant_badge', details: badge.name,
    reason: clean(rc.body?.reason, 300) || 'trao tay',
  });
  return json({ ok: true, badge: { id: badge.id, name: badge.name, icon: badge.icon } });
}

/**
 * Admin thu hoi huy hieu (trao nham, hoac phat hien gian lan).
 *
 * KHONG doi lai xu da thuong. Thu hoi thuong xay ra sau nhieu ngay, luc do hoc
 * vien co the da tieu so xu ay roi - tru ve am la tao ra mot mon no vo hinh ma
 * ho khong hieu tu dau. Ai can doi lai thi dung nut cong/tru diem tay, o do bat
 * buoc ghi ly do.
 */
async function revokeBadge(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const { target_user_id: targetId, badge_id: badgeId, reason } = rc.body || {};
  if (!targetId || !badgeId) return apiError(400, 'missing', 'Thiếu học viên hoặc huy hiệu');

  const row = await rc.store.get(
    'SELECT * FROM user_badges WHERE user_id = ? AND badge_id = ?', [targetId, badgeId]);
  if (!row) return apiError(404, 'not_found', 'Học viên chưa có huy hiệu này');

  await rc.store.run('DELETE FROM user_badges WHERE id = ?', [row.id]);
  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name,
    target_user_id: targetId, target_user_name: row.user_name,
    action: 'revoke_badge', details: row.badge_name,
    reason: clean(reason, 300) || 'thu hồi',
  });
  return json({ ok: true });
}

/**
 * Ra soat lai huy hieu cho mot nguoi (hoac ca lop neu khong truyen ai).
 *
 * Dung cho nhung nguoi da hoat dong TU TRUOC khi co may trao huy hieu - ho da
 * du dieu kien tu lau nhung khong ai trao vi luc do he thong chua biet trao.
 */
async function backfillBadges(rc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const targetId = rc.body?.target_user_id;

  const ids = targetId
    ? [targetId]
    : (await rc.store.all(
      "SELECT id FROM users WHERE status = 'active' ORDER BY total_xp DESC LIMIT 500"))
      .map((r) => r.id);

  const ketQua = [];
  for (const id of ids) {
    /* eslint-disable no-await-in-loop */
    const moi = await raSoatHuyHieu(rc, id);
    if (moi.length) ketQua.push({ user_id: id, badges: moi });
    /* eslint-enable no-await-in-loop */
  }
  return json({ ok: true, so_nguoi: ids.length, da_trao: ketQua });
}

// --------------------------------------------------------------- quan tri
/** Admin cong/tru XP hoac xu bang tay, bat buoc co ly do. */
async function adjustPoints(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const { target_user_id: targetId, metric, amount, reason } = rc.body || {};
  const value = Number(amount);
  if (!targetId || !['xp', 'coin'].includes(metric) || !value) {
    return apiError(400, 'missing', 'Thiếu dữ liệu');
  }
  const target = await rc.store.get('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return apiError(404, 'not_found', 'Không tìm thấy học viên');

  const t = nowIso();
  const table = metric === 'xp' ? 'xp_transactions' : 'coin_transactions';
  const column = metric === 'xp' ? 'total_xp' : 'total_coin';
  const note = clean(reason, 300) || `Admin điều chỉnh ${value > 0 ? '+' : ''}${value}`;

  const insert = metric === 'xp'
    ? rc.store.prepare(
      `INSERT INTO xp_transactions (id, user_id, user_name, amount, source, source_id,
         description, created_date, updated_date) VALUES (?,?,?,?, 'admin_adjustment',?,?,?,?)`,
      [newId(), targetId, target.full_name, value, rc.user.id, note, t, t])
    : rc.store.prepare(
      `INSERT INTO coin_transactions (id, user_id, user_name, amount, type, source, source_id,
         description, created_date, updated_date)
       VALUES (?,?,?,?, 'admin_adjustment','admin',?,?,?,?)`,
      [newId(), targetId, target.full_name, value, rc.user.id, note, t, t]);

  await rc.store.batch([
    insert,
    rc.store.prepare(`UPDATE users SET ${column} = ${column} + ?, updated_date = ? WHERE id = ?`,
      [value, t, targetId]),
  ]);
  void table;

  // Cong tay cung phai kiem tra len cap. Neu bo qua, nguoi duoc admin cong
  // 500 XP se dung o cap cu, khong duoc thuong va khong nhan thong bao nao.
  const levelUp = metric === 'xp' ? await checkLevelAfterChange(rc, targetId, value) : null;

  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name,
    target_user_id: targetId, target_user_name: target.full_name,
    action: `adjust_${metric}`, reason: note, details: `${value > 0 ? '+' : ''}${value} ${metric}`,
  });
  await notify(svc, targetId, `Điều chỉnh ${metric.toUpperCase()}`,
    `Admin đã ${value > 0 ? 'cộng' : 'trừ'} ${Math.abs(value)} ${metric === 'xp' ? 'XP' : 'xu'}. ${note}`,
    'admin');

  return json({ ok: true, levelUp });
}

/**
 * Admin TANG khoa hoc / thu thach / qua cho mot hoc vien.
 *
 * `source: 'gift'` chu khong phai 'manual' nua, va do la mot khac biet co tien
 * o trong: chi nguoi DA TRA TIEN moi duoc ban lai san pham (affiliate). Neu
 * duong nay van ghi 'manual' thi khong cach nao phan biet nguoi duoc tang voi
 * nguoi chuyen khoan ma webhook khong khop - hai loai nam chung mot nhan.
 *
 * Nguoi da chuyen khoan KHONG di duong nay: ho di duong "xac nhan da nhan
 * tien" tren chinh don cua ho (`markPaid`), de tien vao so, hoa hong den tay
 * nguoi gioi thieu, va quyen ban lai mo ra - ba viec ma mo khoa tay khong lam.
 */
async function grantEntitlement(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const { user_id: userId, kind, ref } = rc.body || {};
  if (!userId || !['course', 'challenge', 'reward', 'package'].includes(kind) || !ref) {
    return apiError(400, 'missing', 'Thiếu dữ liệu');
  }
  const existing = (await svc.Entitlement.filter({ user_id: userId, kind, ref }))
    .filter((e) => !e.revoked_at);
  if (existing.length) return json({ ok: true, already: true, entitlement: existing[0] });

  const entitlement = await svc.Entitlement.create({
    user_id: userId, kind, ref, source: 'gift',
    granted_by: rc.user.id, granted_at: nowIso(),
    note: clean(rc.body?.note, 300),
  });
  await svc.AdminLog.create({
    admin_id: rc.user.id, admin_name: rc.user.full_name, target_user_id: userId,
    action: 'grant_entitlement', details: `${kind}:${ref}`,
  });
  await notify(svc, userId, '🔓 Bạn vừa được mở khoá nội dung mới',
    'Vào mục Lớp học hoặc Challenge để xem nhé.', 'system');
  return json({ ok: true, entitlement });
}

// --------------------------------------------------------------- xep hang
/**
 * Bang xep hang.
 * Ban Base44 keo TOAN BO nguoi dung cong 5.000 giao dich ve roi cong bang
 * JavaScript, moi lan goi - ba trang deu goi ham nay. Viet lai bang GROUP BY
 * de D1 lam viec do.
 */
async function getLeaderboard(rc) {
  const { store } = rc;
  const period = ['today', 'week', 'month', 'all_time'].includes(rc.body?.period)
    ? rc.body.period : 'all_time';
  const metric = ['thi_dua', 'xp', 'coin', 'streak', 'content', 'call', 'assignment']
    .includes(rc.body?.metric) ? rc.body.metric : 'xp';
  const limit = Math.min(Number(rc.body?.limit) || 50, 200);
  // 'nhom' = gop theo doi thay vi xep tung nguoi.
  const pham_vi = rc.body?.scope === 'nhom' ? 'nhom' : 'ca_nhan';

  const since = () => {
    const d = new Date();
    if (period === 'today') return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setDate(d.getDate() - 30);
    else return null;
    return d.toISOString();
  };

  const cols = `u.id AS user_id, u.full_name AS name, u.avatar_url, u.total_xp, u.total_coin,
    u.current_streak, u.content_count, u.call_count, u.assignment_count, u.created_date`;

  // Ba nguon diem cua cuoc thi dua, dung theo dung ba tieu chi chi Thanh chot:
  // chuyen can (diem danh), thuc hanh (bai thu thach), dang bai Facebook (hoat
  // dong duoc duyet). Doc tu point_awards vi do la so cai duy nhat ghi lai TUNG
  // lan cong diem kem event_key - cong tu users.total_xp thi lan ca diem cua
  // nhung viec khong nam trong cuoc thi.
  const NGUON_THI_DUA = ['event_attended', 'challenge_day_scored', 'activity_approved'];
  const choThiDua = NGUON_THI_DUA.map(() => '?').join(',');

  // ---------------------------------------------------------- xep hang NHOM
  //
  // Xep theo DIEM TRUNG BINH moi thanh vien chu khong phai tong: 5 nhom khong
  // bao gio deu nguoi, va xep theo tong thi nhom dong nguoi thang san tu dau -
  // cuoc thi mat y nghia. Van tra ve ca tong de bang hien duoc du hai con so.
  if (pham_vi === 'nhom') {
    const dk = since() ? 'AND p.awarded_at >= ?' : '';
    const args = [...NGUON_THI_DUA];
    if (since()) args.push(since());

    const nhom = await store.all(
      `SELECT t.id, t.name, t.color,
         COUNT(DISTINCT u.id) AS so_nguoi,
         COALESCE(SUM(p.xp), 0) AS tong_diem
       FROM teams t
       LEFT JOIN users u ON u.team_id = t.id AND u.status = 'active'
       LEFT JOIN point_awards p ON p.user_id = u.id
         AND p.event_key IN (${choThiDua}) ${dk}
       GROUP BY t.id
       ORDER BY t.name`, args);

    const bang = nhom
      .map((t) => ({
        team_id: t.id,
        name: t.name,
        color: t.color || '',
        so_nguoi: Number(t.so_nguoi) || 0,
        tong_diem: Number(t.tong_diem) || 0,
        // Nhom chua co ai thi diem trung binh la 0, khong phai chia cho 0.
        diem_tb: Number(t.so_nguoi) > 0
          ? Math.round((Number(t.tong_diem) / Number(t.so_nguoi)) * 10) / 10
          : 0,
      }))
      .sort((a, b) => b.diem_tb - a.diem_tb || b.tong_diem - a.tong_diem)
      .map((t, i) => ({ ...t, position: i + 1 }));

    const me = await store.get('SELECT team_id FROM users WHERE id = ?', [rc.user.id]);
    return json({
      ok: true,
      scope: 'nhom',
      period,
      ranking: bang,
      team_cua_toi: me?.team_id || null,
    });
  }

  // Ba nhanh duoi day dung LEFT JOIN chu khong JOIN: voi JOIN, ai chua co
  // giao dich nao trong ky se BIEN MAT khoi bang - ke ca chinh nguoi dang
  // xem, va ho khong hieu vi sao minh khong co ten.
  //
  // Nhanh 'xp' them dieu kien amount > 0 cho khop nhanh 'coin': truoc day
  // mot lan admin tru diem tay lam tut ca diem tren bang xep hang cua nguoi
  // do, trong khi ben xu thi khong.
  let rows;
  if (metric === 'thi_dua') {
    // LEFT JOIN chu khong JOIN: nguoi chua co diem nao van phai xuat hien voi
    // so 0. Dung JOIN thi ho bien mat khoi bang - ke ca chinh nguoi dang xem,
    // va do la loi cua ba nhanh ben duoi.
    const dk = since() ? 'AND p.awarded_at >= ?' : '';
    const args = [...NGUON_THI_DUA];
    if (since()) args.push(since());
    args.push(limit);
    rows = await store.all(
      `SELECT ${cols}, COALESCE(SUM(p.xp), 0) AS score
       FROM users u
       LEFT JOIN point_awards p ON p.user_id = u.id
         AND p.event_key IN (${choThiDua}) ${dk}
       WHERE u.status = 'active'
       GROUP BY u.id ORDER BY score DESC, u.created_date ASC LIMIT ?`, args);
  } else if (period === 'all_time' || metric === 'streak') {
    const orderBy = {
      xp: 'u.total_xp', coin: 'u.total_coin', streak: 'u.current_streak',
      content: 'u.content_count', call: 'u.call_count', assignment: 'u.assignment_count',
    }[metric];
    rows = await store.all(
      `SELECT ${cols}, ${orderBy} AS score FROM users u
       WHERE u.status = 'active' ORDER BY score DESC, u.created_date ASC LIMIT ?`, [limit]);
  } else if (metric === 'coin') {
    rows = await store.all(
      `SELECT ${cols}, COALESCE(SUM(c.amount),0) AS score
       FROM users u LEFT JOIN coin_transactions c ON c.user_id = u.id
         AND c.created_date >= ? AND c.amount > 0
       WHERE u.status = 'active'
       GROUP BY u.id ORDER BY score DESC, u.created_date ASC LIMIT ?`, [since(), limit]);
  } else if (metric === 'xp') {
    rows = await store.all(
      `SELECT ${cols}, COALESCE(SUM(x.amount),0) AS score
       FROM users u LEFT JOIN xp_transactions x ON x.user_id = u.id
         AND x.created_date >= ? AND x.amount > 0
       WHERE u.status = 'active'
       GROUP BY u.id ORDER BY score DESC, u.created_date ASC LIMIT ?`, [since(), limit]);
  } else {
    rows = await store.all(
      `SELECT ${cols}, COUNT(a.id) AS score
       FROM users u LEFT JOIN activities a ON a.user_id = u.id
         AND a.status = 'approved' AND a.activity_type_key = ? AND a.created_date >= ?
       WHERE u.status = 'active'
       GROUP BY u.id ORDER BY score DESC, u.created_date ASC LIMIT ?`, [metric, since(), limit]);
  }

  const levels = await store.all('SELECT * FROM levels WHERE is_active = 1 ORDER BY threshold_xp ASC');
  const levelOf = (xp) => [...levels].reverse().find((l) => xp >= l.threshold_xp) || levels[0] || null;

  const ranking = rows.map((r, i) => {
    const level = levelOf(Number(r.total_xp));
    return {
      position: i + 1,
      user_id: r.user_id,
      name: r.name,
      avatar_url: r.avatar_url || '',
      score: Number(r.score) || 0,
      total_xp: Number(r.total_xp),
      total_coin: Number(r.total_coin),
      current_streak: Number(r.current_streak),
      content_count: Number(r.content_count),
      call_count: Number(r.call_count),
      assignment_count: Number(r.assignment_count),
      level_number: level?.level_number || 1,
      level_name: level?.name || '',
      level_icon: level?.icon || '',
      is_me: r.user_id === rc.user.id,
    };
  });

  return json({
    ok: true, period, metric, ranking,
    me: ranking.find((r) => r.is_me) || null,
  });
}

/** Doi soat so cai - admin bam de kiem tra con so tong co lech khong. */
async function reconcilePoints(rc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');
  const drift = await reconcile(rc.store);
  return json({ ok: true, drift_count: drift.length, drift });
}

// ----------------------------------------------------------- lich & su kien
/** Dang ky mot cho o buoi live. Bam hai lan khong lay hai cho. */
async function joinEvent(rc, svc) {
  const event = await svc.CalendarEvent.get(rc.body?.event_id);
  if (!event || !event.is_active) return apiError(404, 'not_found', 'Buổi này không tồn tại');
  if (event.status === 'cancelled') return apiError(410, 'cancelled', 'Buổi này đã bị huỷ');
  if (event.status === 'done') return apiError(410, 'ended', 'Buổi này đã kết thúc rồi');

  if (event.requires_unlock) {
    const unlocked = await svc.Entitlement.filter({
      user_id: rc.user.id, kind: 'event', ref: event.id,
    });
    if (!unlocked.some((e) => !e.revoked_at)) {
      return apiError(403, 'locked', 'Buổi này cần được mở khoá. Nhắn admin qua Zalo nhé.');
    }
  }

  if (Number(event.min_level) > 0) {
    const me = await rc.store.get('SELECT total_xp FROM users WHERE id = ?', [rc.user.id]);
    const level = await levelFor(rc.store, me?.total_xp || 0);
    if (Number(level?.level_number || 0) < Number(event.min_level)) {
      return apiError(403, 'level_too_low',
        `Buổi này dành cho thành viên từ cấp ${event.min_level} trở lên.`);
    }
  }

  const mine = await svc.EventSignup.filter({ event_id: event.id, user_id: rc.user.id });
  const active = mine.find((r) => r.status !== 'cancelled');
  if (active) return json({ ok: true, signup: active, joined: false });

  // Dem cho TRUOC khi ghi. Van co the hai nguoi cung bam mot luc va vuot cho mot
  // chut - chap nhan duoc voi buoi live (thua mot ghe khong sao), doi lay viec
  // khong phai khoa bang.
  const cap = Number(event.capacity) || 0;
  if (cap > 0) {
    const taken = await rc.store.get(
      "SELECT COUNT(*) AS n FROM event_signups WHERE event_id = ? AND status <> 'cancelled'",
      [event.id]);
    if ((taken?.n ?? 0) >= cap) return apiError(409, 'full', 'Buổi này đã hết chỗ.');
  }

  // Da tung dang ky roi huy -> mo lai dong cu, khong tao dong thu hai (chi muc
  // unique tren (event_id, user_id) se tu choi).
  const cancelled = mine.find((r) => r.status === 'cancelled');
  if (cancelled) {
    const back = await svc.EventSignup.update(cancelled.id, {
      status: 'registered', registered_at: nowIso(),
    });
    return json({ ok: true, signup: back, joined: true });
  }

  const signup = await svc.EventSignup.create({
    event_id: event.id,
    event_title: event.title,
    user_id: rc.user.id,
    user_name: rc.user.full_name,
    status: 'registered',
    registered_at: nowIso(),
  });
  return json({ ok: true, signup, joined: true });
}

/** Tu bo cho cua minh. */
async function leaveEvent(rc, svc) {
  const mine = await svc.EventSignup.filter({
    event_id: rc.body?.event_id, user_id: rc.user.id,
  });
  const active = mine.find((r) => r.status !== 'cancelled');
  if (!active) return json({ ok: true, changed: false });
  if (active.status === 'attended') {
    return apiError(409, 'da_diem_danh', 'Đã điểm danh rồi thì không bỏ chỗ được.');
  }
  await svc.EventSignup.update(active.id, { status: 'cancelled' });
  return json({ ok: true, changed: true });
}

/**
 * Admin diem danh. Day la cho DUY NHAT cong diem `event_attended` - luat da khai
 * san trong point_rules tu dau nhung chua co ai goi toi.
 */
async function markEventAttendance(rc, svc) {
  if (!isAdmin(rc)) return apiError(403, 'forbidden', 'Chỉ admin');

  const eventId = String(rc.body?.event_id || '');
  const userIds = Array.isArray(rc.body?.user_ids) ? rc.body.user_ids.map(String) : [];
  const present = rc.body?.present !== false;
  if (!eventId || !userIds.length) return apiError(400, 'missing', 'Thiếu buổi hoặc danh sách người');

  const event = await svc.CalendarEvent.get(eventId);
  if (!event) return apiError(404, 'not_found', 'Buổi này không tồn tại');

  const results = [];
  for (const userId of userIds) {
    /* eslint-disable no-await-in-loop */
    const rows = await svc.EventSignup.filter({ event_id: eventId, user_id: userId });
    const signup = rows.find((r) => r.status !== 'cancelled');
    if (!signup) { results.push({ user_id: userId, ok: false, reason: 'chua_dang_ky' }); continue; }

    await svc.EventSignup.update(signup.id, {
      status: present ? 'attended' : 'absent',
      attended_at: present ? nowIso() : null,
    });

    let award = null;
    if (present) {
      // source_id la id cua dong dang ky -> diem danh lai bao nhieu lan cung chi
      // cong mot lan (chi muc unique tren point_awards).
      award = await awardPoints(rc, {
        user_id: userId,
        event_key: 'event_attended',
        // Cung khoa voi diemDanh() - neu khac thi admin diem danh cho mot nguoi
        // da tu diem danh se cong diem LAN HAI.
        source_id: `${signup.event_id}:${signup.user_id}`,
        reason: `Điểm danh: ${event.title}`,
      });
    }
    results.push({ user_id: userId, ok: true, award });
    /* eslint-enable no-await-in-loop */
  }

  await rc.store.audit('event.attendance', eventId,
    { count: userIds.length, present }, rc.ip);
  return json({ ok: true, results });
}

// --------------------------------------------------------------- bang dieu phoi
const FUNCTIONS = {
  logActivity,
  approveActivity,
  scoreActivity,
  joinChallenge,
  submitChallengeDay,
  scoreChallengeDay,
  reviewChallengeDay,
  togglePostLike,
  createPost,
  createComment,
  completeLesson,
  redeemReward,
  updateRedemption,
  adjustPoints,
  sendNotification,
  chonNhom,
  chiaNhomNgauNhien,
  danhSoLaiNgay,
  chuanBiDatHang,
  timNguoiGioiThieu,
  danhSachNhom,
  diemDanh,
  lichThuThach,
  thuMoiChuaDen,
  guiLaiThuMoiHangLoat,
  grantBadge,
  revokeBadge,
  backfillBadges,
  grantEntitlement,
  getLeaderboard,
  reconcilePoints,
  joinEvent,
  leaveEvent,
  markEventAttendance,
};

const PATH_RE = /^\/api\/functions\/([A-Za-z][A-Za-z0-9]*)$/;

export async function handleFunctions(rc) {
  const match = PATH_RE.exec(rc.url.pathname);
  if (!match) return null;
  if (rc.request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
  }

  const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, match[1]) ? FUNCTIONS[match[1]] : null;
  if (!fn) return apiError(404, 'not_found', 'Không có chức năng này');

  const denied = await requireUser(rc);
  if (denied) return denied;

  // Quyen he thong: cac ham duoi day duoc ghi thang vao so cai. Chung tu kiem
  // tra nguoi goi o dong dau tien - khong bao gio tin user_id gui len.
  const svc = createServiceRepo(rc.store);
  try {
    return await fn(rc, svc);
  } catch (err) {
    // Loi do DU LIEU NGUOI DUNG (vd dan mot duong dan khong hop le) phai noi
    // dung ly do. Khong bat o day thi no roi xuong bay 500 chung va nguoi dung
    // doc duoc "he thong dang gap su co" - sai va lam ho tuong minh khong lam
    // gi duoc nua.
    if (err instanceof PolicyError) return apiError(err.status, 'validation_failed', err.message);
    throw err;
  }
}
