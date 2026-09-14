/**
 * Viec chay hang ngay (01:00 gio Viet Nam).
 *
 * Truoc file nay, `triggers.crons` trong wrangler.jsonc bi comment lai va khong
 * co gi chay dinh ky ca. Hau qua khong nhin thay ngay nhung rat that:
 *
 *   - Khong ai duoc nhac truoc khi dut chuoi ngay. Nguoi hoc bo cuoc trong im
 *     lang, va den luc quay lai thi streak ve 0 - dung cai cam giac lam ho nghi
 *     "thoi, coi nhu xong".
 *   - Khong ai duoc nhac ve buoi live ngay mai. Ho da giu cho tu tuan truoc roi
 *     quen mat.
 *   - So tong XP/xu tren `users` khong bao gio duoc doi soat lai voi so cai.
 *     Lech mot dong la lech mai mai, khong ai biet.
 *
 * Nguyen tac o day: MOT VIEC HONG KHONG DUOC LAM HONG NHUNG VIEC CON LAI. Cron
 * chay khong ai nhin, nen mot ngoai le khong bat se im lang nuot ca lan chay.
 */
import { createStore } from './db.js';
import { readConfig } from './config.js';
import { sendMail } from './mail/resend.js';
import { renderMail } from './mail/templates.js';
import { reconcile } from './points/award.js';
import { traoThuongTheoLuot } from './commerce/thuong-gioi-thieu.js';

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/**
 * Ngay theo gio dia phuong cua thuong hieu chu khong phai UTC - cron chay luc
 * 01:00 gio Viet Nam. Do lech lay tu TZ_OFFSET_MINUTES (brand/brand.json),
 * mac dinh 420 phut = UTC+7.
 */
function ngayDiaPhuong(lechPhut, lechNgay = 0) {
  const d = new Date(Date.now() + lechPhut * 60 * 1000 + lechNgay * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Nhac nhung nguoi SAP dut chuoi ngay: hoat dong gan nhat la hom qua, hom nay
 * chua lam gi. Ho con dung mot ngay de cuu chuoi.
 *
 * KHONG nhac nguoi da dut tu lau: mot email "ban sap mat chuoi 12 ngay" gui cho
 * nguoi da nghi ba tuan chi lam ho thay minh that bai, khong keo ai quay lai.
 */
async function nhacChuoiNgay(rc) {
  const homQua = ngayDiaPhuong(rc.lechPhut, -1);
  const nguoi = await rc.store.all(
    `SELECT id, email, full_name, current_streak FROM users
     WHERE status = 'active' AND current_streak >= 3 AND last_activity_date = ?
     LIMIT 500`, [homQua]);

  const t = nowIso();
  let daGui = 0;
  for (const u of nguoi) {
    /* eslint-disable no-await-in-loop */
    try {
      await rc.store.run(
        `INSERT INTO notifications (id, user_id, title, body, type, link, is_read,
           created_date, updated_date) VALUES (?,?,?,?,'streak','/challenges',0,?,?)`,
        [newId(), u.id, `🔥 Chuỗi ${u.current_streak} ngày của bạn đang chờ hôm nay`,
          'Ghi nhận một hoạt động bất kỳ trước nửa đêm là chuỗi vẫn tiếp tục.', t, t]);

      if (u.email) {
        await sendMail(rc, {
          to: u.email,
          template: 'streak_reminder',
          ...renderMail('streak_reminder', {
            name: u.full_name || '',
            streak: u.current_streak,
            appUrl: `${rc.origin}/dashboard`,
            brand: rc.cfg.brand,
          }),
        });
      }
      daGui += 1;
    } catch (err) {
      console.warn('[cron] khong nhac duoc chuoi ngay', u.id, err?.message);
    }
    /* eslint-enable no-await-in-loop */
  }
  return { nhac_chuoi: daGui };
}

/**
 * Nhac nhung ai da giu cho buoi live dien ra NGAY MAI.
 *
 * Chi nhac nguoi da dang ky, khong nhac ca lop: nguoi chua giu cho la nguoi da
 * quyet dinh khong tham gia, nhac ho la spam.
 */
async function nhacSuKien(rc) {
  const mai = ngayDiaPhuong(rc.lechPhut, 1);
  const suKien = await rc.store.all(
    `SELECT id, title, starts_at, join_url FROM calendar_events
     WHERE status != 'cancelled' AND substr(starts_at, 1, 10) = ?`, [mai]);
  if (!suKien.length) return { nhac_su_kien: 0 };

  const t = nowIso();
  let daGui = 0;
  for (const ev of suKien) {
    /* eslint-disable no-await-in-loop */
    const nguoi = await rc.store.all(
      `SELECT u.id, u.email, u.full_name FROM event_signups s
       JOIN users u ON u.id = s.user_id
       WHERE s.event_id = ? AND u.status = 'active' LIMIT 500`, [ev.id]);

    for (const u of nguoi) {
      try {
        await rc.store.run(
          `INSERT INTO notifications (id, user_id, title, body, type, link, is_read,
             created_date, updated_date) VALUES (?,?,?,?,'event','/calendar',0,?,?)`,
          [newId(), u.id, `📅 Ngày mai: ${ev.title}`,
            'Bạn đã giữ chỗ buổi này. Nhớ vào sớm vài phút nhé.', t, t]);

        if (u.email) {
          await sendMail(rc, {
            to: u.email,
            template: 'event_reminder',
            ...renderMail('event_reminder', {
              name: u.full_name || '',
              title: ev.title,
              startsAt: ev.starts_at,
              joinUrl: ev.join_url || `${rc.origin}/calendar`,
              brand: rc.cfg.brand,
            }),
          });
        }
        daGui += 1;
      } catch (err) {
        console.warn('[cron] khong nhac duoc su kien', ev.id, u.id, err?.message);
      }
    }
    /* eslint-enable no-await-in-loop */
  }
  return { nhac_su_kien: daGui };
}

/**
 * Doi soat tong XP/xu tren `users` voi so cai giao dich.
 *
 * KHONG tu sua so lieu - chi bao. Mot con so lech co the la dau hieu cua loi
 * logic o cho khac; lang le sua lai la xoa mat bang chung duy nhat.
 */
async function doiSoat(rc) {
  // reconcile() tra ve THANG mot mang nhung nguoi bi lech, khong boc trong object.
  const lech = await reconcile(rc.store);
  if (lech.length) console.error('[cron] SO LIEU DIEM BI LECH', JSON.stringify(lech));
  return { lech_diem: lech.length };
}

/** Xoa nhung ban ghi tam da het han - de database khong phinh vo ich. */
async function donDep(rc) {
  const t = nowIso();
  await rc.store.run('DELETE FROM otp_codes WHERE expires_at < ?', [t]);
  await rc.store.run('DELETE FROM password_resets WHERE expires_at < ? AND used_at IS NULL', [t]);
  await rc.store.run('DELETE FROM rate_limits WHERE reset_at < ?', [Date.now()]);
  // Thong bao da doc cu hon 60 ngay: hoc vien khong bao gio cuon xuong toi do.
  const cu = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
  await rc.store.run('DELETE FROM notifications WHERE is_read = 1 AND created_date < ?', [cu]);
  return { don_dep: true };
}

/**
 * Diem vao cua cron. Moi viec chay doc lap; mot viec nem loi thi cac viec khac
 * VAN CHAY - day la ly do dung Promise.allSettled chu khong phai Promise.all.
 */
/**
 * Trao nhung phan thuong theo so nguoi da moi cho ai da du dieu kien.
 *
 * Vi sao can chay hang ngay chu khong chi luc co luot moi: mot mon qua Premium
 * duoc them vao kho HOM NAY thi 28 nguoi da moi du 2 ban tu tuan truoc khong co
 * gi danh thuc ho day - refreshLevel chi chay khi so luot THAY DOI. Khong co
 * vong quet nay thi quan tri vien phai nho bam mot nut, va cai gi phai nho thi
 * som muon cung quen.
 */
async function traoThuongHangNgay(rc) {
  const ds = await rc.store.all(`
    SELECT a.*, (SELECT COUNT(*) FROM leads l
                  WHERE l.referred_by = a.id AND l.referral_valid = 1) AS so_luot
      FROM affiliates a WHERE a.status = 'active'`);

  let qua = 0;
  let veVip = 0;
  for (const a of ds) {
    if (!Number(a.so_luot)) continue;
    /* eslint-disable no-await-in-loop */
    const kq = await traoThuongTheoLuot({ store: rc.store, cfg: rc.cfg }, a, Number(a.so_luot))
      .catch(() => null);
    /* eslint-enable no-await-in-loop */
    if (!kq) continue;
    qua += kq.qua.length;
    if (kq.ve_vip) veVip += 1;
  }
  return { qua_da_trao: qua, ve_vip_da_mo: veVip };
}

export async function chayHangNgay(env, execCtx) {
  const cfg = readConfig(env);
  const store = createStore(env);
  const rc = {
    env,
    cfg,
    store,
    // Cron khong co request nao de suy ra ten mien. Ban cu du phong ve ten
    // mien CUA MOT KHACH CU - nghia la moi link trong email nhac cua khach moi
    // se dan nguoi hoc sang site nguoi khac. Thieu thi bo qua vong chay.
    origin: env.APP_ORIGIN || '',
    lechPhut: Number(env.TZ_OFFSET_MINUTES) || 420,
    ip: 'cron',
    waitUntil: (p) => execCtx?.waitUntil?.(p),
  };

  // Hai viec dau deu gui email co chua link vao webapp. Khong biet ten mien
  // thi link se hong; bo qua va noi ro con hon gui thu dan nguoi hoc di dau do.
  const guiDuocMail = Boolean(rc.origin);
  if (!guiDuocMail) {
    console.error('[cron] chua dat APP_ORIGIN - bo qua hai viec gui email nhac');
  }

  const viec = [
    ...(guiDuocMail ? [
      ['nhac chuoi ngay', () => nhacChuoiNgay(rc)],
      ['nhac su kien', () => nhacSuKien(rc)],
    ] : []),
    ['doi soat diem', () => doiSoat(rc)],
    ['trao thuong theo luot moi', () => traoThuongHangNgay(rc)],
    ['don dep', () => donDep(rc)],
  ];

  const ketQua = await Promise.allSettled(viec.map(([, fn]) => fn()));
  const tomTat = {};
  ketQua.forEach((r, i) => {
    const ten = viec[i][0];
    if (r.status === 'fulfilled') Object.assign(tomTat, r.value);
    else {
      tomTat[ten] = 'LOI';
      console.error(`[cron] "${ten}" that bai`, r.reason?.stack || r.reason);
    }
  });

  console.log('[cron] xong', JSON.stringify(tomTat));
  return tomTat;
}
