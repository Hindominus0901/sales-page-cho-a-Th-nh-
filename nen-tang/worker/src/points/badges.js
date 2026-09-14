/**
 * Trao huy hieu.
 *
 * Truoc file nay, KHONG MOT DONG NAO trong ca he thong ghi vao bang
 * `user_badges` - khong tu dong, khong tay. Nghia la 8 huy hieu trong database
 * chi la do trang tri, trang "Huy hieu & Rank" cua moi hoc vien trong vinh vien,
 * va luat diem `badge_earned` (30 xu) khong bao gio kich hoat.
 *
 * Dieu kien nam trong DATABASE (`badges.condition_type` + `condition_value`),
 * khong viet cung o day: chi Thanh doi "Ben bi 7 ngay" thanh 10 ngay, hoac them
 * mot huy hieu moi, deu chi la sua mot dong du lieu.
 *
 * Cach cham: sau moi lan cong diem, ra soat lai TOAN BO huy hieu chua co thay vi
 * co gang doan xem hanh dong vua roi mo khoa cai nao. Dat hon mot chut nhung
 * dung trong moi truong hop - ke ca khi admin cong tay 5000 XP mot phat lam
 * nguoi ta nhay qua may moc cung luc.
 */
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/**
 * Do mot chi so cua nguoi dung theo kieu dieu kien.
 * Tra ve null neu khong hieu kieu do - huy hieu do se bi bo qua chu khong trao nham.
 */
async function doChiSo(store, user, kieu) {
  switch (kieu) {
    // Tong so hoat dong da duoc duyet, gop ca ba loai.
    case 'activity_count':
      return Number(user.content_count || 0) + Number(user.call_count || 0)
        + Number(user.assignment_count || 0);
    case 'content_count':    return Number(user.content_count || 0);
    case 'call_count':       return Number(user.call_count || 0);
    case 'assignment_count': return Number(user.assignment_count || 0);
    // Lay chuoi DAI NHAT chu khong phai chuoi hien tai: huy hieu la ghi nhan
    // viec da tung lam duoc, dut chuoi khong the bi thu hoi thanh tich cu.
    case 'streak':           return Number(user.longest_streak || 0);
    case 'level': {
      const r = await store.get(
        'SELECT MAX(level_number) AS n FROM levels WHERE is_active = 1 AND threshold_xp <= ?',
        [Number(user.total_xp || 0)]);
      return Number(r?.n || 0);
    }
    case 'course_count': {
      const r = await store.get(
        `SELECT COUNT(*) AS n FROM point_awards
         WHERE user_id = ? AND event_key = 'course_completed'`, [user.id]);
      return Number(r?.n || 0);
    }
    case 'referral_count': {
      const r = await store.get(
        `SELECT COUNT(*) AS n FROM leads
         WHERE referral_valid = 1 AND referred_by IN
           (SELECT id FROM affiliates WHERE lead_id = ?)`, [user.legacy_lead_id || 0]);
      return Number(r?.n || 0);
    }
    case 'total_xp':         return Number(user.total_xp || 0);
    case 'total_coin':       return Number(user.total_coin || 0);
    default:                 return null;
  }
}

/**
 * Trao mot huy hieu cu the. Dung chung cho ca duong tu dong lan nut trao tay
 * cua admin, nen mot cho duy nhat lo viec ghi so + cong thuong + bao tin.
 *
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function traoHuyHieu(rc, { userId, badge, boiAi = 'he_thong' }) {
  const { store } = rc;
  const daCo = await store.get(
    'SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?', [userId, badge.id]);
  if (daCo) return { ok: false, reason: 'da_co' };

  const user = await store.get('SELECT full_name FROM users WHERE id = ?', [userId]);
  const t = nowIso();

  await store.batch([
    store.prepare(
      `INSERT INTO user_badges (id, user_id, user_name, badge_id, badge_name, badge_icon,
         created_date, updated_date, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId(), userId, user?.full_name || '', badge.id, badge.name, badge.icon || '', t, t, boiAi]),
    store.prepare(
      `INSERT INTO notifications (id, user_id, title, body, type, link, is_read,
         created_date, updated_date) VALUES (?,?,?,?,'badge','/badges',0,?,?)`,
      [newId(), userId, `${badge.icon || '🏅'} Bạn vừa nhận huy hiệu "${badge.name}"`,
        badge.description || 'Tiếp tục giữ nhịp nhé!', t, t]),
  ]);

  // Thuong di qua awardPoints -> van bi chan cong trung va van ton trong tran.
  // source_id la ma huy hieu, nen mot huy hieu chi thuong duoc dung mot lan ke
  // ca khi admin thu hoi roi trao lai.
  const { awardPoints } = await import('./award.js');
  await awardPoints(rc, {
    user_id: userId,
    event_key: 'badge_earned',
    source_id: `badge-${badge.id}`,
    reason: `Nhận huy hiệu ${badge.name}`,
    // Huy hieu nao co thuong rieng thi lay theo huy hieu, khong thi theo luat chung.
    ...(badge.xp_bonus || badge.coin_bonus
      ? { xp: Number(badge.xp_bonus || 0), coin: Number(badge.coin_bonus || 0) }
      : {}),
  }).catch(() => null);

  return { ok: true };
}

/**
 * Ra soat va trao moi huy hieu ma nguoi nay vua du dieu kien.
 * Goi sau khi cong diem. Loi o day KHONG duoc lam hong viec cong diem.
 *
 * @returns {Promise<Array<{key:string, name:string, icon:string}>>} nhung cai vua trao
 */
export async function raSoatHuyHieu(rc, userId) {
  const { store } = rc;
  try {
    const user = await store.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user || user.status !== 'active') return [];

    const dsHuyHieu = await store.all(
      `SELECT b.* FROM badges b
       WHERE b.is_active = 1
         AND b.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = ?)`, [userId]);
    if (!dsHuyHieu.length) return [];

    const vuaTrao = [];
    for (const badge of dsHuyHieu) {
      if (!badge.condition_type) continue;          // huy hieu chi trao tay
      const dat = await doChiSo(store, user, badge.condition_type);
      if (dat === null) continue;                   // kieu dieu kien la
      if (dat < Number(badge.condition_value || 0)) continue;
      const kq = await traoHuyHieu(rc, { userId, badge, boiAi: 'he_thong' });
      if (kq.ok) vuaTrao.push({ key: badge.key, name: badge.name, icon: badge.icon });
    }
    return vuaTrao;
  } catch (err) {
    console.error('[badges] khong ra soat duoc huy hieu', userId, err?.stack || err);
    return [];
  }
}
