/**
 * Doc/ghi entity, co ap quyen.
 *
 * THU TU THI HANH - khong duoc dao:
 *   1. xac thuc         (nguoi goi la ai)
 *   2. kiem tra dong tu (co duoc doc/ghi entity nay khong)
 *   3. CHEN dieu kien quyen VAO CAU SQL
 *   4. chay truy van
 *   5. cat bot field theo danh sach trang
 *   6. tra ve
 *
 * Buoc 3 la mau chot: neu loc bang JavaScript sau khi da lay het du lieu ve thi
 * chi mot lan quen `.filter()` la lo sach. Chen vao SQL thi khong the quen.
 */
import { entityDef, LIMITS } from './schema.js';

const STAFF_ROLES = new Set(['admin', 'coach']);

export class PolicyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const deny = (message = 'Bạn không có quyền với dữ liệu này.') => {
  throw new PolicyError(403, message);
};

const isAdmin = (user) => user?.role === 'admin';
const isStaff = (user) => STAFF_ROLES.has(user?.role);

// --- doi kieu giua JSON va SQLite -------------------------------------------
/** SQLite khong co boolean; JSON thi co. Doi ca hai chieu theo khai bao field. */
function toDb(type, value) {
  if (value === undefined || value === null) return null;
  if (type === 'bool') return value ? 1 : 0;
  if (type === 'number') return Number(value);
  if (type === 'json') return typeof value === 'string' ? value : JSON.stringify(value);
  return String(value);
}

function fromDb(type, value) {
  if (value === null || value === undefined) return type === 'bool' ? false : null;
  if (type === 'bool') return !!Number(value);
  if (type === 'number') return Number(value);
  if (type === 'json') {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

const decodeRow = (def, row) => {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = fromDb(def.fields[key] || 'string', value);
  }
  return out;
};

/**
 * Chan duong dan doc hai trong moi field ten *_url / *_link.
 *
 * Vi sao phai lam o day chu khong o tung cho: `evidence_link` cua Activity do
 * CHINH HOC VIEN nhap, roi duoc trang duyet bai cua admin ve thanh the <a>
 * bam duoc. Mot dong "javascript:..." la khi admin bam se chay duoi PHIEN CUA
 * ADMIN - hoc vien tu nang quyen minh len. Cac field *_url khac (bai hoc, thu
 * thach, buoi live) do admin nhap nen it rui ro hon, nhung chan het mot the
 * thi khong con phai nho field nao an toan field nao khong.
 *
 * Chi cho: rong, duong dan noi bo (/...), http(s). Chan javascript:, data:,
 * vbscript:, va moi thu la khac.
 */
const URL_FIELD = /(_url|_link)$/;

function checkUrls(def, data) {
  for (const [key, value] of Object.entries(data)) {
    if (!URL_FIELD.test(key)) continue;
    if (def.fields[key] !== 'string') continue;
    const raw = String(value ?? '').trim();
    if (raw === '') continue;
    const ok = raw.startsWith('/') ? !raw.startsWith('//') : /^https?:\/\/[^\s]+$/i.test(raw);
    if (!ok) {
      throw new PolicyError(422,
        'Đường dẫn không hợp lệ. Chỉ nhận link bắt đầu bằng http:// hoặc https://');
    }
    if (raw.length > 1000) throw new PolicyError(422, 'Đường dẫn quá dài.');
  }
}

// --- quyen -------------------------------------------------------------------
/**
 * Dieu kien WHERE bat buoc, dua vao muc `read`.
 * @returns {{ sql: string, args: any[] }}
 */
function readScope(def, user) {
  const owner = def.ownerField;
  switch (def.read) {
    case 'all':
      return { sql: '', args: [] };
    case 'admin':
      if (!isAdmin(user)) deny();
      return { sql: '', args: [] };
    case 'own_or_staff':
      if (isStaff(user)) return { sql: '', args: [] };
      if (!owner) deny();
      return { sql: `${owner} = ?`, args: [user.id] };
    case 'own':
      if (!owner) deny();
      // Admin cung KHONG duoc doc thong bao rieng cua nguoi khac.
      return { sql: `${owner} = ?`, args: [user.id] };
    default:
      return deny();
  }
}

function canWrite(def, verb, user, row) {
  const rule = def[verb];
  const owner = def.ownerField;
  switch (rule) {
    case 'admin': return isAdmin(user);
    case 'self': return true;                    // owner bi ep = chinh minh khi tao
    case 'own': return !!owner && row && row[owner] === user.id;
    case 'own_or_admin':
      return isAdmin(user) || (!!owner && row && row[owner] === user.id);
    case 'never':
    default:
      return false;
  }
}

/**
 * Loc patch xuong con dung nhung cot nguoi nay duoc phep ghi.
 *
 * @param {object|null} row  ban ghi dang sua, hoac null khi dang TAO MOI.
 *   Luc tao moi thi chu so huu bi ep bang chinh nguoi goi (xem create()), nen
 *   coi nhu la cua minh. Neu khong phan biet duoc hai truong hop nay thi moi
 *   lan tao se bi loc sach field va sinh ra ban ghi rong.
 */
function allowedPatch(def, user, patch, row) {
  const creating = row === null;
  const mine = creating || !def.ownerField || row[def.ownerField] === user.id;
  const list = isAdmin(user)
    ? (def.writable?.admin || Object.keys(def.fields))
    : (def.writable?.self || Object.keys(def.fields));

  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'created_date' || key === 'created_by') continue;
    if (!Object.prototype.hasOwnProperty.call(def.fields, key)) continue;
    if (!list.includes(key)) continue;
    // Nguoi thuong chi ghi duoc dong cua chinh minh, du field co trong danh sach.
    if (!isAdmin(user) && !mine) continue;
    out[key] = value;
  }
  return out;
}

/** Cat bot field khi nguoi doc khong phai chu so huu / khong phai staff. */
function project(def, user, row) {
  if (!row) return row;
  const publicFields = def.readable?.public;
  if (!publicFields) return row;
  if (isStaff(user)) return row;
  if (def.ownerField && row[def.ownerField] === user.id) return row;
  if (def.table === 'users' && row.id === user.id) return row;

  const out = {};
  for (const key of publicFields) if (key in row) out[key] = row[key];
  return out;
}

/**
 * Cat field theo QUYEN TRUY CAP cua tung nguoi (khac project(): cai kia dua vao
 * VAI TRO, cai nay dua vao da mua / da dang ky hay chua).
 *
 * Truoc day Lesson mo cho moi nguoi doc, ke ca `video_id`. Nut khoa trong React
 * chi la trang tri: mot lenh GET /api/entities/Lesson la lay duoc ma video cua
 * moi bai trong moi khoa, ke ca khoa phai tra tien. Day la cho chan that.
 *
 * Entity khai `gatedFields` + `gateBy`:
 *   gateBy 'course' (mac dinh) - mo khi da mua khoa, hoac khoa do mo tu do
 *   gateBy 'event'            - mo khi da dang ky buoi do
 *   gateBy 'package'          - mo khi da mua goi do (khop theo `sku`)
 *   gateBy 'redemption'       - mo khi da doi qua do (khop theo `id`)
 *   gateBy 'challenge'        - mo khi da tham gia thu thach (khop `challenge_id`)
 *   gateBy 'course_self'      - dong do chinh la khoa hoc (id nam o `id`)
 */

/** Cap do hien tai cua nguoi dung, tinh tu tong XP. */
// Export de completeLesson (functions/index.js) dung CHUNG mot cong thuc voi
// cong chan video. Hai noi tu tinh cap bac la som muon lech nhau, va lech
// theo huong nao cung te: hoac chan nguoi du dieu kien, hoac cong diem cho
// bai ma may chu tu choi phat video.
export async function levelOf(store, userId) {
  const [me, levels] = await Promise.all([
    store.get('SELECT total_xp FROM users WHERE id = ?', [userId]),
    store.all('SELECT level_number, threshold_xp FROM levels ORDER BY threshold_xp').catch(() => []),
  ]);
  return levels.reduce(
    (acc, l) => ((me?.total_xp ?? 0) >= l.threshold_xp ? l.level_number : acc), 0);
}

/** Che field roi danh dau `locked` de giao dien biet ma hien dung. */
function maskRow(row, hide) {
  const out = { ...row };
  for (const key of hide) delete out[key];
  out.locked = true;
  return out;
}

/**
 * Khoa hoc mo qua GOI ma nguoi nay dang so huu, doc TU BANG products ngay luc
 * hoi - khong phai anh chup luc mua.
 *
 * VI SAO PHAI CO: `fulfilOrder` cap quyen `course` theo `grants_json` TAI THOI
 * DIEM tra tien. 44 nguoi mua goi VIP khi grants_json con rong nen ho chi co
 * `package:<ma goi>`. Quan tri them mot khoa vao goi hom nay -> ho thay khoa do
 * trong tab VIP (vi tab do doc grants_json) nhung VIDEO KHONG PHAT DUOC, va
 * khong co loi nao hien ra. Nguoi da tra tien ngoi nhin mot khoa hoc cam.
 *
 * De grants_json la nguon su that SONG: them khoa vao goi la moi nguoi da mua
 * goi do xem duoc ngay, bo ra la mat ngay. Quyen cap luc mua van giu nguyen,
 * chi la mot duong nhanh.
 */
export async function khoaMoQuaGoi(store, userId) {
  const rows = await store.all(
    `SELECT p.grants_json FROM entitlements e
       JOIN products p ON p.sku = e.ref
      WHERE e.user_id = ? AND e.kind = 'package' AND e.revoked_at IS NULL`, [userId]);
  const out = new Set();
  for (const r of rows) {
    let ds = [];
    try { ds = JSON.parse(r.grants_json || '[]'); } catch { ds = []; }
    for (const g of Array.isArray(ds) ? ds : []) {
      if (g?.kind === 'course' && g?.ref) out.add(g.ref);
    }
  }
  return out;
}

/**
 * @param {string} cot Ten truong tren dong du lieu dang GIU id khoa hoc.
 *   'course_id' cho bai giang; 'id' cho chinh bang `courses` (link ban ghi va
 *   tai lieu cua khoa). Cung mot luat mo khoa, chi khac cho doc id.
 */
async function gateByCourse(hide, user, rows, store, cot = 'course_id') {
  const ids = [...new Set(rows.map((r) => r?.[cot]).filter(Boolean))];
  if (!ids.length) return rows;
  const holes = ids.map(() => '?').join(',');

  const [courses, ents, quaGoi, myLevel] = await Promise.all([
    store.all(`SELECT id, min_level, requires_unlock FROM courses WHERE id IN (${holes})`, ids),
    store.all(
      `SELECT ref FROM entitlements
        WHERE user_id = ? AND kind = 'course' AND revoked_at IS NULL AND ref IN (${holes})`,
      [user.id, ...ids]),
    khoaMoQuaGoi(store, user.id),
    levelOf(store, user.id),
  ]);

  const owned = new Set([...ents.map((e) => e.ref), ...quaGoi]);
  const open = new Map(courses.map((c) => [
    c.id, !Number(c.requires_unlock) && myLevel >= Number(c.min_level || 0),
  ]));

  return rows.map((row) => {
    const cid = row?.[cot];
    if (!cid) return row;
    if (owned.has(cid) || open.get(cid)) return row;
    return maskRow(row, hide);
  });
}

async function gateByEvent(hide, user, rows, store) {
  const ids = [...new Set(rows.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return rows;
  const holes = ids.map(() => '?').join(',');

  const signups = await store.all(
    `SELECT event_id FROM event_signups
      WHERE user_id = ? AND status <> 'cancelled' AND event_id IN (${holes})`,
    [user.id, ...ids]);
  const joined = new Set(signups.map((r) => r.event_id));

  return rows.map((row) => (joined.has(row.id) ? row : maskRow(row, hide)));
}

/**
 * Mo khi da MUA GOI DO (entitlements kind='package', ref = sku cua san pham).
 *
 * Dung cho `products.delivery_url`: link Notion/Drive cua mot mat hang la thu
 * nguoi ta tra tien de co. Bang `products` doc cong khai (gian hang phai hien
 * ten, gia, anh cho moi nguoi), nen neu khong che cot nay thi mot lenh GET
 * /api/entities/Product la lay duoc link cua moi san pham ma khong tra dong nao.
 *
 * `zalo_group_url` CO Y KHONG bi che: nguoi mua can no TRUOC khi tien ve, de
 * gui bill nho xac nhan khi tu dong khong nhan ra.
 */
async function gateByPackage(hide, user, rows, store) {
  const skus = [...new Set(rows.map((r) => r?.sku).filter(Boolean))];
  if (!skus.length) return rows;
  const holes = skus.map(() => '?').join(',');

  const ents = await store.all(
    `SELECT ref FROM entitlements
      WHERE user_id = ? AND kind = 'package' AND revoked_at IS NULL AND ref IN (${holes})`,
    [user.id, ...skus]);
  const owned = new Set(ents.map((e) => e.ref));

  return rows.map((row) => (owned.has(row?.sku) ? row : maskRow(row, hide)));
}

/**
 * Mo khi DA DOI qua do (bang `redemptions`).
 *
 * Dung cho `rewards.delivery_url`: qua so duoc GIAO NGAY luc doi
 * (functions/index.js -> redeemReward), nen chinh cai link do LA mon hang.
 * Bang `rewards` phai doc cong khai vi cua hang can hien ten, anh, gia xu cho
 * moi nguoi xem truoc khi doi - nhung neu khong che cot link thi mot lenh GET
 * /api/entities/Reward la lay het qua ma khong mat mot xu nao. Dung lo hong ma
 * `products.delivery_url` da duoc va, chi bang `rewards` bi bo sot.
 *
 * Tinh ca don dang cho duyet: nguoi ta da bi tru xu roi.
 */
async function gateByRedemption(hide, user, rows, store) {
  const ids = [...new Set(rows.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return rows;
  const holes = ids.map(() => '?').join(',');

  const daDoi = await store.all(
    `SELECT reward_id FROM redemptions
      WHERE user_id = ? AND status <> 'cancelled' AND reward_id IN (${holes})`,
    [user.id, ...ids]);
  const cua = new Set(daDoi.map((r) => r.reward_id));

  return rows.map((row) => (cua.has(row.id) ? row : maskRow(row, hide)));
}

/**
 * Mo khi DA THAM GIA thu thach do (bang `challenge_members`).
 *
 * Dung cho `challenge_day_tasks`: video va bai tap cua tung ngay la noi dung
 * nguoi ta tra tien de co. Bang nay doc cong khai de trang thu thach hien duoc
 * lich va ten nhiem vu truoc khi tham gia - nhung khong che link thi mot lenh
 * GET /api/entities/ChallengeDayTask lay duoc video + bai tap cua MOI NGAY
 * trong MOI thu thach, ke ca thu thach doi mo khoa. `Lesson` da che dung kieu
 * nay (xem gatedFields cua no trong schema.js).
 */
async function gateByChallenge(hide, user, rows, store) {
  const ids = [...new Set(rows.map((r) => r?.challenge_id).filter(Boolean))];
  if (!ids.length) return rows;
  const holes = ids.map(() => '?').join(',');

  const thamGia = await store.all(
    `SELECT challenge_id FROM challenge_members
      WHERE user_id = ? AND challenge_id IN (${holes})`,
    [user.id, ...ids]);
  const cua = new Set(thamGia.map((r) => r.challenge_id));

  return rows.map((row) => (cua.has(row?.challenge_id) ? row : maskRow(row, hide)));
}

async function applyAccess(def, user, rows, store) {
  const hide = def.gatedFields;
  if (!hide || !rows.length) return rows;
  if (isStaff(user)) return rows;
  if (def.gateBy === 'event') return gateByEvent(hide, user, rows, store);
  if (def.gateBy === 'package') return gateByPackage(hide, user, rows, store);
  if (def.gateBy === 'redemption') return gateByRedemption(hide, user, rows, store);
  if (def.gateBy === 'challenge') return gateByChallenge(hide, user, rows, store);
  // 'course_self': chinh dong do LA khoa hoc, nen id khoa nam o `id`.
  if (def.gateBy === 'course_self') return gateByCourse(hide, user, rows, store, 'id');
  return gateByCourse(hide, user, rows, store);
}

// --- truy van ---------------------------------------------------------------
const SORT_RE = /^-?[a-z_][a-z0-9_]*$/i;

function orderClause(def, sort) {
  if (!sort) return 'created_date DESC';
  if (!SORT_RE.test(sort)) throw new PolicyError(400, 'Tham số sắp xếp không hợp lệ');
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!Object.prototype.hasOwnProperty.call(def.fields, field)) {
    throw new PolicyError(400, `Không sắp xếp được theo "${field}"`);
  }
  return `${field} ${desc ? 'DESC' : 'ASC'}`;
}

/** Chi so sanh BANG - dung het nhu cau cua frontend va khong mo duong cho SQL la. */
function filterClause(def, filter) {
  const parts = [];
  const args = [];
  for (const [key, raw] of Object.entries(filter || {})) {
    if (!Object.prototype.hasOwnProperty.call(def.fields, key)) {
      throw new PolicyError(400, `Không lọc được theo "${key}"`);
    }
    const type = def.fields[key];
    if (raw === null) { parts.push(`${key} IS NULL`); continue; }
    if (Array.isArray(raw)) {
      if (!raw.length) { parts.push('0'); continue; }
      parts.push(`${key} IN (${raw.map(() => '?').join(',')})`);
      args.push(...raw.map((v) => toDb(type, v)));
      continue;
    }
    parts.push(`${key} = ?`);
    args.push(toDb(type, raw));
  }
  return { sql: parts.join(' AND '), args };
}

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

export function createEntityRepo(rc) {
  const { store, user } = rc;
  if (!user) throw new PolicyError(401, 'Bạn cần đăng nhập.');

  const need = (name) => {
    const def = entityDef(name);
    // MAC DINH LA TU CHOI: ten khong co trong bang khai bao -> 403, khong 404.
    // Tra 404 se lo ra entity nao ton tai.
    if (!def) deny('Không có quyền với dữ liệu này.');
    return def;
  };

  async function list(name, { filter, sort, limit, offset } = {}) {
    const def = need(name);
    const scope = readScope(def, user);
    const where = filterClause(def, filter);

    const parts = [scope.sql, where.sql].filter(Boolean);
    const clause = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    const cap = LIMITS[name] || LIMITS.default;
    const take = Math.min(Math.max(1, Number(limit) || 50), cap);
    const skip = Math.max(0, Number(offset) || 0);

    const rows = await store.all(
      `SELECT * FROM ${def.table} ${clause} ORDER BY ${orderClause(def, sort)} LIMIT ? OFFSET ?`,
      [...scope.args, ...where.args, take, skip],
    );
    return applyAccess(def, user, rows.map((row) => project(def, user, decodeRow(def, row))), store);
  }

  async function get(name, id) {
    const def = need(name);
    const scope = readScope(def, user);
    const clause = scope.sql ? `AND ${scope.sql}` : '';
    const row = await store.get(
      `SELECT * FROM ${def.table} WHERE id = ? ${clause}`, [id, ...scope.args]);
    if (!row) throw new PolicyError(404, 'Không tìm thấy dữ liệu');
    const one = await applyAccess(def, user, [project(def, user, decodeRow(def, row))], store);
    return one[0];
  }

  /** Ban ghi tho, khong cat field - dung noi bo de kiem tra quyen. */
  const rawById = async (def, id) =>
    store.get(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);

  /**
   * Doi loi rang buoc cua D1 thanh cau nguoi doc hieu duoc.
   *
   * VI SAO CAN: loi SQL khong phai PolicyError nen no bi nem tiep qua
   * entities/api.js, roi roi xuong bay 500 chung o index.js va hien ra
   * "He thong dang gap su co, thu lai sau it phut".
   *
   * Chuyen do da xay ra that: chi Thanh doi so ngay cua mot nhiem vu sang so
   * ngay da co nguoi giu -> `UNIQUE constraint failed` -> man hinh bao he thong
   * hong. Chi sua tay may lan, moi lan deu that bai va gia tri nhay ve nhu cu,
   * va trong luc do noi dung mot buoi bi ghi de mat. Neu ngay tu dau no noi
   * "Ngay 1 da co nhiem vu roi" thi khong mat gi ca.
   *
   * Chi dich nhung loi do NGUOI DUNG gay ra. Loi that (bang khong ton tai, cot
   * sai) van phai nem nguyen: giau chung sau mot cau tu te la lam ho lan sau
   * kho tim hon.
   */
  function dichLoiRangBuoc(err, def, patch) {
    const msg = String(err?.message || err || '');

    if (/UNIQUE constraint failed/i.test(msg)) {
      // D1 boc them tien to va hau to quanh cau cua SQLite:
      //   "D1_ERROR: UNIQUE constraint failed: challenge_day_tasks.day: SQLITE_CONSTRAINT"
      // nen cat theo dau hai cham thu nhat se lay nham chu "D1_ERROR". Phai bat
      // dung doan NAM SAU "constraint failed:" va dung truoc dau hai cham ke
      // tiep. Cat nham thi cau bao loi rong tue't phan huu ich nhat - dung cai
      // ten cot dang trung - va chi con "Gia tri nay trung voi mot ban ghi da
      // co", tuc la nguoi doc van khong biet phai sua o dau.
      const cot = ((msg.match(/UNIQUE constraint failed:\s*([^:]+)/i) || [])[1] || '')
        .split(',')
        .map((c) => c.trim().split('.').pop())
        .filter((c) => c && c !== 'id');
      const giaTri = cot
        .map((c) => (patch && patch[c] !== undefined ? `${c} = ${patch[c]}` : null))
        .filter(Boolean)
        .join(', ');
      return new PolicyError(409, giaTri
        ? `Đã có bản ghi khác dùng ${giaTri} rồi. Đổi cái kia trước, hoặc chọn giá trị khác.`
        : `Giá trị này trùng với một bản ghi đã có (${cot.join(', ') || 'trùng khoá'}).`);
    }

    if (/NOT NULL constraint failed/i.test(msg)) {
      const cot = ((msg.match(/NOT NULL constraint failed:\s*([^:]+)/i) || [])[1] || '')
        .trim().split('.').pop();
      return new PolicyError(422, `Thiếu ${cot || 'một trường bắt buộc'}.`);
    }

    if (/FOREIGN KEY constraint failed/i.test(msg)) {
      return new PolicyError(409,
        `Không lưu được vì bản ghi này đang gắn với dữ liệu khác (${def.table}).`);
    }

    return err;
  }

  async function create(name, data) {
    const def = need(name);
    if (!canWrite(def, 'create', user, null)) deny();

    const patch = allowedPatch(def, user, data || {}, null);
    checkUrls(def, patch);
    // Chu so huu luon bi EP bang chinh nguoi dang goi - khong bao gio lay tu
    // du lieu gui len, neu khong ai cung tao duoc ban ghi dung ten nguoi khac.
    if (def.ownerField && def.create === 'self') patch[def.ownerField] = user.id;
    if (def.fields.user_name && !patch.user_name) patch.user_name = user.full_name;

    const t = nowIso();
    const row = {
      id: newId(), ...patch, created_date: t, updated_date: t, created_by: user.email,
    };
    const cols = Object.keys(row);
    try {
      await store.run(
        `INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        cols.map((c) => toDb(def.fields[c] || 'string', row[c])),
      );
    } catch (err) {
      throw dichLoiRangBuoc(err, def, patch);
    }
    return get(name, row.id);
  }

  async function update(name, id, data) {
    const def = need(name);
    const existing = await rawById(def, id);
    if (!existing) throw new PolicyError(404, 'Không tìm thấy dữ liệu');
    if (!canWrite(def, 'update', user, existing)) deny();

    const patch = allowedPatch(def, user, data || {}, existing);
    checkUrls(def, patch);
    if (def.guard) {
      const problem = def.guard(rc, patch, existing);
      if (problem) throw new PolicyError(403, problem);
    }
    const cols = Object.keys(patch);
    if (!cols.length) return get(name, id);

    try {
      await store.run(
        `UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_date = ?
         WHERE id = ?`,
        [...cols.map((c) => toDb(def.fields[c] || 'string', patch[c])), nowIso(), id],
      );
    } catch (err) {
      throw dichLoiRangBuoc(err, def, patch);
    }
    return get(name, id);
  }

  /**
   * Xoa mot ban ghi keo theo nhung ban ghi CON cua no.
   *
   * Truoc day khong keo: xoa mot khoa hoc thi cac bai giang cua no o lai vinh
   * vien - vo hinh voi hoc vien (danh sach khoa hoc trong) nhung van nam trong
   * database, van hien o mot vai cho dem so, va khong co man hinh nao xoa duoc
   * chung nua. Tren ban that dang co dung 3 bai giang mo coi kieu do.
   *
   * Khai o day chu khong dat khoa ngoai ON DELETE CASCADE: D1 khong bat khoa
   * ngoai mac dinh, va mot rang buoc chi dung o mot nua so moi truong con nguy
   * hiem hon la khong co.
   */
  const CON_CUA = {
    Course: [['lessons', 'course_id'], ['lesson_progress', 'course_id']],
    Challenge: [['challenge_day_tasks', 'challenge_id'], ['challenge_members', 'challenge_id'],
      ['challenge_submissions', 'challenge_id']],
    CalendarEvent: [['event_signups', 'event_id']],
  };

  async function remove(name, id) {
    const def = need(name);
    const existing = await rawById(def, id);
    if (!existing) throw new PolicyError(404, 'Không tìm thấy dữ liệu');
    if (!canWrite(def, 'delete', user, existing)) deny();

    for (const [bang, cot] of CON_CUA[name] || []) {
      // eslint-disable-next-line no-await-in-loop
      await store.run(`DELETE FROM ${bang} WHERE ${cot} = ?`, [id]);
    }
    await store.run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);
    return { ok: true, id };
  }

  /**
   * Chi dung cho mot viec: danh dau thong bao da doc. Co y KHONG lam tong quat -
   * mot lenh cap nhat hang loat qua HTTP la thu rat de bi dung sai.
   */
  async function updateMany(name, filter, update_) {
    const def = need(name);
    const set = update_?.$set || {};
    if (name !== 'Notification' || Object.keys(set).join() !== 'is_read') {
      deny('Chỉ hỗ trợ đánh dấu thông báo đã đọc.');
    }
    if (filter?.user_id && filter.user_id !== user.id) deny();

    const info = await store.run(
      'UPDATE notifications SET is_read = ?, updated_date = ? WHERE user_id = ? AND is_read = 0',
      [set.is_read ? 1 : 0, nowIso(), user.id]);
    return { count: info.changes };
  }

  return { list, get, create, update, remove, updateMany };
}

/**
 * Quyen "service role": bo qua MOI kiem tra o tren.
 * Chi duoc goi tu ben trong worker/src/functions/* va cac tac vu nen. Tuyet doi
 * khong bao gio noi thang ra mot duong dan HTTP nao.
 */
export function createServiceRepo(store) {
  const wrap = (name) => {
    const def = entityDef(name);
    if (!def) throw new Error(`Entity khong ton tai: ${name}`);
    return {
      async list(sort, limit) {
        const rows = await store.all(
          `SELECT * FROM ${def.table} ORDER BY ${orderClause(def, sort)} LIMIT ?`,
          [Math.min(Number(limit) || 100, 10000)]);
        return rows.map((r) => decodeRow(def, r));
      },
      async filter(where, sort, limit) {
        const f = filterClause(def, where);
        const rows = await store.all(
          `SELECT * FROM ${def.table} ${f.sql ? `WHERE ${f.sql}` : ''}
           ORDER BY ${orderClause(def, sort)} LIMIT ?`,
          [...f.args, Math.min(Number(limit) || 1000, 10000)]);
        return rows.map((r) => decodeRow(def, r));
      },
      async get(id) {
        return decodeRow(def, await store.get(`SELECT * FROM ${def.table} WHERE id = ?`, [id]));
      },
      async create(data) {
        // Ham nghiep vu di duong nay (bo qua kiem quyen), nhung KHONG duoc bo
        // qua loc duong dan: `evidence_link` cua Activity di dung qua day.
        checkUrls(def, data || {});
        const t = nowIso();
        const row = { id: newId(), ...data, created_date: t, updated_date: t };
        const cols = Object.keys(row).filter((c) => c in def.fields);
        await store.run(
          `INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          cols.map((c) => toDb(def.fields[c], row[c])));
        return { ...row };
      },
      async update(id, data) {
        checkUrls(def, data || {});
        const cols = Object.keys(data).filter((c) => c in def.fields);
        if (!cols.length) return null;
        await store.run(
          `UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_date = ?
           WHERE id = ?`,
          [...cols.map((c) => toDb(def.fields[c], data[c])), nowIso(), id]);
        return decodeRow(def, await store.get(`SELECT * FROM ${def.table} WHERE id = ?`, [id]));
      },
      async delete(id) {
        await store.run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);
        return { ok: true };
      },
    };
  };

  return new Proxy({}, { get: (_, name) => wrap(String(name)) });
}

export { toDb, fromDb, decodeRow };
