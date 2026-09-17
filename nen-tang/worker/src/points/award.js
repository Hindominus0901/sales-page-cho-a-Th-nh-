/**
 * Cong/tru XP va xu.
 *
 * MOI duong cong diem trong he thong deu phai di qua day. Neu de moi noi tu
 * cong lay, chi can mot cho quen kiem tran la ca co che game hoa vo nghia, ma
 * loi ay rat kho phat hien.
 *
 * Ba dam bao:
 *   1. Khong cong trung - chi muc unique (user_id, event_key, source_id).
 *   2. Ton trong tran ngay/tran doi khai trong bang point_rules.
 *   3. So cai va con so tong luon di cung nhau - ghi trong mot batch nguyen tu.
 *
 * Luat nam trong DATABASE chu khong phai trong ma nguon, nen doi so la doi ngay,
 * khong can deploy lai.
 */
import { ngayDiaPhuong, khoangNgayDiaPhuong } from '../lib/ngay.js';

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** Cac moc thuong them khi giu chuoi ngay. */
const STREAK_BONUS_DAYS = new Set([7, 30, 100]);

async function getRule(store, eventKey) {
  return store.get('SELECT * FROM point_rules WHERE event_key = ? AND is_active = 1', [eventKey]);
}

/**
 * @param {object} rc
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.event_key   xem bang point_rules
 * @param {string} opts.source_id   dinh danh cua thu sinh ra diem (id bai nop,
 *                                  id don hang...). Cung mot source_id chi cong
 *                                  duoc mot lan.
 * @param {number} [opts.multiplier] nhan he so (vd diem AI cham)
 * @param {string} [opts.reason]
 * @param {number} [opts.xp]        ghi de so XP cua luat
 * @param {number} [opts.coin]      ghi de so xu cua luat
 * @returns {Promise<{awarded:boolean, reason?:string, xp:number, coin:number, levelUp?:object}>}
 */
export async function awardPoints(rc, opts) {
  const { store } = rc;
  const {
    user_id: userId, event_key: eventKey, source_id: sourceId,
    multiplier = 1, reason = '',
  } = opts;

  if (!userId || !eventKey || !sourceId) {
    return { awarded: false, reason: 'thieu tham so', xp: 0, coin: 0 };
  }

  const rule = await getRule(store, eventKey);
  if (!rule) return { awarded: false, reason: 'luat chua bat', xp: 0, coin: 0 };

  const user = await store.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user || user.status !== 'active') {
    return { awarded: false, reason: 'tai khoan khong hoat dong', xp: 0, coin: 0 };
  }

  // Da cong cho dung viec nay roi thi thoi.
  const existing = await store.get(
    'SELECT id FROM point_awards WHERE user_id = ? AND event_key = ? AND source_id = ?',
    [userId, eventKey, sourceId]);
  if (existing) return { awarded: false, reason: 'da cong roi', xp: 0, coin: 0 };

  // Tran theo ngay - NGAY VIET NAM, khong phai ngay UTC.
  //
  // `substr(awarded_at,1,10)` la cat ngay theo UTC, ma UTC+7 nghia la moc do
  // roi vao 07:00 sang gio Viet Nam. Mot muc dat daily_cap = 1 an duoc HAI lan
  // trong khoang 00:00-07:00: mot lan tinh vao "ngay hom qua" theo UTC, mot lan
  // vao ngay moi. Do khe ho nay rong 7 tieng moi dem, va no mo dung luc nhieu
  // nguoi lam bai nhat.
  //
  // So sanh khoang [tu, den) bang chuoi ISO thay vi goi datetime() cua SQLite:
  // cot luu dang 'YYYY-MM-DDTHH:MM:SS.sssZ' ma SQLite khong doc chac chan duoc
  // chu 'Z', con so sanh chuoi thi luon dung va con dung duoc chi muc.
  if (rule.daily_cap) {
    const [tuLuc, denLuc] = khoangNgayDiaPhuong(rc.env);
    const row = await store.get(
      `SELECT COUNT(*) AS n FROM point_awards
       WHERE user_id = ? AND event_key = ? AND awarded_at >= ? AND awarded_at < ?`,
      [userId, eventKey, tuLuc, denLuc]);
    if (Number(row?.n || 0) >= rule.daily_cap) {
      return { awarded: false, reason: 'da het luot trong ngay', xp: 0, coin: 0 };
    }
  }

  // Tran theo doi
  if (rule.lifetime_cap) {
    const row = await store.get(
      'SELECT COUNT(*) AS n FROM point_awards WHERE user_id = ? AND event_key = ?',
      [userId, eventKey]);
    if (Number(row?.n || 0) >= rule.lifetime_cap) {
      return { awarded: false, reason: 'da het luot', xp: 0, coin: 0 };
    }
  }

  const xp = Math.round((opts.xp ?? rule.xp) * multiplier);
  const coin = Math.round((opts.coin ?? rule.coin) * multiplier);
  if (!xp && !coin) return { awarded: false, reason: 'luat khong cong gi', xp: 0, coin: 0 };

  const t = nowIso();
  const label = reason || rule.label;
  const writes = [
    store.prepare(
      `INSERT INTO point_awards (id, user_id, event_key, source_id, xp, coin, awarded_at,
         created_date, updated_date) VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), userId, eventKey, sourceId, xp, coin, t, t, t]),
  ];

  if (xp) {
    writes.push(store.prepare(
      `INSERT INTO xp_transactions (id, user_id, user_name, amount, source, source_id,
         description, created_date, updated_date) VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), userId, user.full_name, xp, eventKey, sourceId, label, t, t]));
  }
  if (coin) {
    writes.push(store.prepare(
      `INSERT INTO coin_transactions (id, user_id, user_name, amount, type, source, source_id,
         description, created_date, updated_date) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [newId(), userId, user.full_name, coin, coin >= 0 ? 'earn' : 'spend',
        eventKey, sourceId, label, t, t]));
  }

  writes.push(store.prepare(
    'UPDATE users SET total_xp = total_xp + ?, total_coin = total_coin + ?, updated_date = ? WHERE id = ?',
    [xp, coin, t, userId]));

  // Mot batch = tat ca cung thanh cong hoac cung khong. Khong bao gio co canh
  // "da tru xu ma khong ghi so cai".
  await store.batch(writes);

  const levelUp = await refreshLevel(rc, userId, user.total_xp + xp, user.total_xp);

  // Ra soat huy hieu sau MOI lan cong diem. Nhap dong de tranh vong tron: module
  // huy hieu cung goi nguoc lai awardPoints de trao thuong.
  //
  // Chan de quy: khi chinh no dang cong thuong cho mot huy hieu thi khong ra
  // soat nua - neu khong, trao huy hieu -> cong diem -> ra soat -> trao tiep, va
  // hai huy hieu cung du dieu kien se goi long nhau khong can thiet.
  let huyHieuMoi = [];
  if (eventKey !== 'badge_earned') {
    const { raSoatHuyHieu } = await import('./badges.js');
    huyHieuMoi = await raSoatHuyHieu(rc, userId);
  }

  return { awarded: true, xp, coin, levelUp, badges: huyHieuMoi };
}

/** Tru xu (doi qua). Dung chung duong voi awardPoints de so cai luon khop. */
export async function spendCoin(rc, { user_id: userId, amount, source, source_id: sourceId, description }) {
  const { store } = rc;
  const user = await store.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return { ok: false, reason: 'khong tim thay nguoi dung' };
  if (user.total_coin < amount) return { ok: false, reason: 'khong du xu' };

  const t = nowIso();
  const ketQua = await store.batch([
    store.prepare(
      `INSERT INTO coin_transactions (id, user_id, user_name, amount, type, source, source_id,
         description, created_date, updated_date) VALUES (?,?,?,?, 'spend', ?,?,?,?,?)`,
      [newId(), userId, user.full_name, -Math.abs(amount), source, sourceId, description, t, t]),
    // "AND total_coin >= ?" chan tieu am khi hai lan doi qua chay song song.
    store.prepare(
      'UPDATE users SET total_coin = total_coin - ?, updated_date = ? WHERE id = ? AND total_coin >= ?',
      [Math.abs(amount), t, userId, Math.abs(amount)]),
  ]);

  // PHAI DOC xem lenh UPDATE co doi duoc dong nao khong.
  //
  // Dieu kien "AND total_coin >= ?" o tren chan tieu am - nhung no chan bang
  // cach KHOP 0 DONG, va batch khong nem loi vi chuyen do. Truoc day ham nay
  // tra thang `{ ok: true }` ma khong nhin ket qua, nen khi khong tru duoc xu no
  // van bao thanh cong.
  //
  // Hau qua that: hai request redeemReward chay song song khi so du vua du MOT
  // lan. Ca hai doc `user.total_coin` trong luc chua ai bi tru nen deu qua phep
  // thu "du xu"; lan tru thu hai khop 0 dong; nhung ca hai deu nhan `ok: true`
  // nen nguoi do lay HAI phan qua ma chi tra tien MOT lan. Dong so cai am van
  // duoc ghi, nen doi soat se bao lech - sau khi qua da giao xong.
  const doiDuoc = Number(ketQua?.[1]?.meta?.changes ?? 0);
  if (!doiDuoc) {
    // Don lai dong so cai vua ghi: tru khong thanh thi khong duoc de lai vet
    // tieu tien, neu khong bang doi soat se bao lech vi mot giao dich chua bao
    // gio xay ra.
    await store.run(
      `DELETE FROM coin_transactions
        WHERE user_id = ? AND source = ? AND source_id = ? AND created_date = ?`,
      [userId, source, sourceId, t]).catch(() => {});
    return { ok: false, reason: 'khong du xu' };
  }
  return { ok: true };
}

/** Hoan xu khi don doi qua bi huy. */
export async function refundCoin(rc, { user_id: userId, amount, source_id: sourceId, description }) {
  const { store } = rc;
  const t = nowIso();
  const user = await store.get('SELECT full_name FROM users WHERE id = ?', [userId]);
  await store.batch([
    store.prepare(
      `INSERT INTO coin_transactions (id, user_id, user_name, amount, type, source, source_id,
         description, created_date, updated_date) VALUES (?,?,?,?, 'earn', 'refund',?,?,?,?)`,
      [newId(), userId, user?.full_name || '', Math.abs(amount), sourceId, description, t, t]),
    store.prepare('UPDATE users SET total_coin = total_coin + ?, updated_date = ? WHERE id = ?',
      [Math.abs(amount), t, userId]),
  ]);
  return { ok: true };
}

/** Cap bac hien tai theo tong XP. */
export async function levelFor(store, totalXp) {
  const rows = await store.all(
    'SELECT * FROM levels WHERE is_active = 1 AND threshold_xp <= ? ORDER BY threshold_xp DESC LIMIT 1',
    [totalXp]);
  return rows[0] || null;
}

/** Kiem tra len bac; neu co thi ghi thong bao va cong thuong. */
export async function refreshLevel(rc, userId, newXp, oldXp) {
  const { store } = rc;
  const before = await levelFor(store, oldXp);
  const after = await levelFor(store, newXp);
  if (!after || (before && before.level_number === after.level_number)) return null;

  const t = nowIso();
  await store.run(
    `INSERT INTO notifications (id, user_id, title, body, type, is_read, created_date, updated_date)
     VALUES (?,?,?,?,'level_up',0,?,?)`,
    [newId(), userId, `🎉 Lên cấp ${after.level_number} — ${after.name}`,
      after.perk || 'Chúc mừng bạn đã lên cấp mới!', t, t]);

  // Thuong len cap di qua chinh awardPoints -> van bi chan cong trung.
  await awardPoints(rc, {
    user_id: userId,
    event_key: 'level_up',
    source_id: `level-${after.level_number}`,
    reason: `Lên cấp ${after.level_number} — ${after.name}`,
  }).catch(() => null);

  return { level_number: after.level_number, name: after.name, icon: after.icon };
}

/**
 * Cap nhat chuoi ngay hoat dong.
 * Hom qua co hoat dong -> tang; cach quang -> ve 1. Goi khi mot hoat dong duoc duyet.
 */
export async function touchStreak(rc, userId, dateStr) {
  const { store } = rc;
  const user = await store.get(
    'SELECT current_streak, longest_streak, last_activity_date FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  // Ngay Viet Nam: ai lam bai luc 1-2 gio sang truoc day bi ghi vao ngay HOM
  // TRUOC (theo UTC), nen chuoi ngay dut oan, va cron nhac chuoi (cron.js da
  // cat dung theo gio Viet Nam tu lau) gui email "ban sap mat chuoi" cho nguoi
  // vua lam bai xong.
  const day = dateStr || ngayDiaPhuong(rc.env);
  if (user.last_activity_date === day) return { streak: user.current_streak, changed: false };

  const yesterday = new Date(`${day}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const wasYesterday = user.last_activity_date === yesterday.toISOString().slice(0, 10);

  const streak = wasYesterday ? Number(user.current_streak || 0) + 1 : 1;
  const longest = Math.max(Number(user.longest_streak || 0), streak);

  await store.run(
    `UPDATE users SET current_streak = ?, longest_streak = ?, last_activity_date = ?,
       updated_date = ? WHERE id = ?`,
    [streak, longest, day, nowIso(), userId]);

  if (STREAK_BONUS_DAYS.has(streak)) {
    await awardPoints(rc, {
      user_id: userId,
      event_key: 'streak_milestone',
      source_id: `streak-${streak}`,
      multiplier: streak / 7,
      reason: `Giữ chuỗi ${streak} ngày liên tục`,
    }).catch(() => null);
  }

  return { streak, changed: true };
}

/**
 * Doi soat: tinh lai tong tu so cai va bao cho ai lech.
 * Con so tong tren bang users chi la ban luu san cho nhanh; so cai moi la su that.
 */
export async function reconcile(store) {
  const rows = await store.all(`
    SELECT u.id, u.full_name, u.total_xp, u.total_coin,
      COALESCE((SELECT SUM(amount) FROM xp_transactions x WHERE x.user_id = u.id),0) AS real_xp,
      COALESCE((SELECT SUM(amount) FROM coin_transactions c WHERE c.user_id = u.id),0) AS real_coin
    FROM users u`);
  return rows
    .filter((r) => Number(r.total_xp) !== Number(r.real_xp)
      || Number(r.total_coin) !== Number(r.real_coin))
    .map((r) => ({
      user_id: r.id,
      name: r.full_name,
      xp: { stored: Number(r.total_xp), ledger: Number(r.real_xp) },
      coin: { stored: Number(r.total_coin), ledger: Number(r.real_coin) },
    }));
}

/**
 * Kiem tra len cap cho mot nguoi dua tren tong XP hien tai.
 *
 * Dung khi diem duoc thay doi mA KHONG qua awardPoints - vi du admin cong tay.
 * Thieu buoc nay thi nguoi duoc cong 500 XP se khong len cap, khong duoc thuong,
 * va khong nhan duoc thong bao nao ca.
 */
export async function checkLevelAfterChange(rc, userId, deltaXp) {
  const row = await rc.store.get('SELECT total_xp FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  const after = Number(row.total_xp);
  return refreshLevel(rc, userId, after, after - Number(deltaXp || 0));
}
