/**
 * He thong affiliate: moi nguoi dang ky xong deu duoc cap mot link gioi thieu rieng.
 *   - Khach vao qua ?ref=MA  -> ghi 1 luot bam + dat cookie 60 ngay
 *   - Khach do dang ky       -> lead.referred_by = affiliate
 *   - Don cua khach do duoc thanh toan -> sinh hoa hong cho affiliate
 */
import { stripDiacritics } from './questions.js';
import { traoThuongTheoLuot } from './commerce/thuong-gioi-thieu.js';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Bo qua 0/O/1/I de nguoi doc khong nham khi go tay. */
const randomPart = (n) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

const randomHex = (n) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const num = (v) => Number(v) || 0;

/** "Nguyễn Văn An" -> "Nguyễn V. A." */
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  return [parts[0], ...parts.slice(1).map((x) => `${x[0]}.`)].join(' ');
}

/**
 * Cache bang xep hang o cap module: tren Cloudflare mot isolate phuc vu nhieu
 * request lien tiep nen cach nay van an - va tu bien mat khi isolate bi thu hoi.
 */
let cache = { at: 0, rows: null };
export const clearLeaderboardCache = () => { cache = { at: 0, rows: null }; };

/**
 * @param {object} deps { store, cfg, rewards }
 */
export function createAffiliates({ store, cfg, rewards }) {
  // --- doc -----------------------------------------------------------------
  const getById = (id) => store.get('SELECT * FROM affiliates WHERE id = ?', [id]);
  const getByCode = (code) =>
    store.get('SELECT * FROM affiliates WHERE code = ?', [String(code || '').toUpperCase()]);
  const getByToken = (token) => store.get('SELECT * FROM affiliates WHERE token = ?', [token]);

  /**
   * Tra affiliate theo ma, va NEU ma do la mot ma la da duoc quan tri vien gan
   * cho ai do thi tra ve chinh nguoi ay.
   *
   * Vi sao can: gan ma la trong trang quan tri chi chua lai nguoi da dang ky
   * TRUOC luc gan. Nguoi gioi thieu van dang di rai link cua he thong cu - moi
   * luot bam sau do lai roi vao hu khong, va thang sau admin lai phai vao gan
   * bang tay mot lan nua. Doi chieu that: ma IHMMIP56 duoc gan ngay 10/09 luc
   * 04:03, den 06:26 cung ngay da co them mot luot bam khong duoc tinh cho ai.
   */
  async function getByCodeOrMapped(code) {
    const ma = String(code || '').toUpperCase();
    if (!ma) return null;
    const thang = await getByCode(ma);
    if (thang) return thang;
    const maLa = await store.get('SELECT gan_cho FROM ref_ma_la WHERE ma = ?', [ma])
      .catch(() => null);
    return maLa?.gan_cho ? getByCode(maLa.gan_cho) : null;
  }
  const getByLead = (leadId) => store.get('SELECT * FROM affiliates WHERE lead_id = ?', [leadId]);

  /** Ma gioi thieu de doc: ten rieng + 3 ky tu ngau nhien, vd "THANHK7D". */
  async function newCode(fullName) {
    const base = stripDiacritics(String(fullName || ''))
      .toUpperCase().replace(/[^A-Z]/g, '').slice(-6) || 'ADM';
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = `${base}${randomPart(3)}`;
      if (!(await getByCode(code))) return code;
    }
    return `ADM${randomPart(7)}`;
  }

  // --- ghi -----------------------------------------------------------------
  const getByEmail = (email) => (email
    ? store.get('SELECT * FROM affiliates WHERE lower(email) = lower(?) LIMIT 1', [String(email)])
    : null);

  /** Cap link gioi thieu cho mot lead (goi lai tra ve ban ghi cu). */
  async function ensureForLead(lead) {
    const existing = await getByLead(lead.id);
    if (existing) return existing;

    // Nguoi nay co the da duoc cap link tu TAI KHOAN (chua co lead) truoc do -
    // ensureForUser cap duoc ban ghi lead_id NULL. Tao them mot dong nua la ho
    // co HAI ma gioi thieu: ma dang di rai ngoai kia va ma trang web hien ra
    // khong con la mot, va khong ai hieu vi sao luot khong duoc tinh.
    const cuaEmail = await getByEmail(lead.email);
    if (cuaEmail && !cuaEmail.lead_id) {
      await store.run(
        `UPDATE affiliates SET lead_id = ?,
           full_name = COALESCE(NULLIF(full_name,''), ?),
           phone = COALESCE(NULLIF(phone,''), ?), updated_at = ?
         WHERE id = ? AND lead_id IS NULL`,
        [lead.id, lead.full_name || '', lead.phone || '', store.now(), cuaEmail.id]);
      return getById(cuaEmail.id);
    }

    const t = store.now();
    return store.get(
      `INSERT INTO affiliates (lead_id, code, token, full_name, email, phone, status,
         commission_rate, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'active',?,?,?) RETURNING *`,
      [lead.id, await newCode(lead.full_name), randomHex(16),
        lead.full_name, lead.email, lead.phone, cfg.affiliate.rate, t, t],
    );
  }

  /**
   * Cap link gioi thieu cho mot TAI KHOAN nen tang.
   *
   * Truoc day ensureForLead la cho DUY NHAT trong ca he thong sinh ra affiliate,
   * va no chi chay khi nguoi ta dien form o trang ban hang. Ai vao thang webapp
   * bang Google thi mo tab Dai ly ra chi thay "Ban can dang ky Challenge truoc"
   * - trong khi ho la hoc vien that, dang di moi ban that. Ho khong co link de
   * moi, hoac tho hon: ho di rai mot link cu tu he thong khac va mat sach luot.
   *
   * `leads.phone_e164` vua NOT NULL vua UNIQUE nen khong the bia mot dong lead
   * cho ho; nhung `affiliates.lead_id` cho phep NULL, va portal tim duoc theo
   * email. Khi nao ho dien form that thi ensureForLead noi lead vao dong nay.
   */
  async function ensureForUser(user) {
    if (!user) return null;

    if (user.legacy_lead_id) {
      const lead = await store.getLeadById(user.legacy_lead_id);
      if (lead) return ensureForLead(lead);
    }
    if (user.email) {
      const lead = await store.get(
        'SELECT * FROM leads WHERE lower(email) = lower(?) ORDER BY id ASC LIMIT 1', [user.email]);
      if (lead) return ensureForLead(lead);
    }

    const cuaEmail = await getByEmail(user.email);
    if (cuaEmail) return cuaEmail;
    if (!user.email) return null;

    const t = store.now();
    return store.get(
      `INSERT INTO affiliates (lead_id, code, token, full_name, email, phone, status,
         commission_rate, created_at, updated_at)
       VALUES (NULL,?,?,?,?,?,'active',?,?,?) RETURNING *`,
      [await newCode(user.full_name || user.email), randomHex(16),
        user.full_name || '', user.email, user.phone || user.phone_e164 || null,
        cfg.affiliate.rate, t, t],
    );
  }

  /** Ghi mot luot bam link. Moi phien chi tinh 1 lan (chi muc unique chan trung). */
  async function recordClick(affiliate, ctx = {}) {
    try {
      await store.run(
        `INSERT INTO referral_clicks
           (affiliate_id, code, session_id, landing_url, referrer, ip, user_agent, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [affiliate.id, affiliate.code, ctx.session_id || null,
          String(ctx.landing_url || '').slice(0, 500), String(ctx.referrer || '').slice(0, 300),
          ctx.ip || '', String(ctx.user_agent || '').slice(0, 300), store.now()],
      );
      return { counted: true };
    } catch (err) {
      if (/unique|duplicate/i.test(err?.message || '')) return { counted: false };
      throw err;
    }
  }

  /**
   * Ty le hoa hong cho mot don, theo thu tu uu tien:
   *
   *   1. `products.commission_rate` cua chinh san pham da ban
   *   2. `affiliates.commission_rate` - ngoai le rieng cho tung nguoi, va la
   *      duong lui cho moi don da phat sinh TRUOC khi co cot o muc 1
   *
   * Vi sao san pham thang nguoi, khong phai nguoc lai: cot tren `affiliates`
   * co mac dinh 0.2 nen MOI dong deu co gia tri. Neu de nguoi thang thi ty le
   * dat cho san pham se khong bao giờ duoc dung toi, va chi Thanh se sua gia
   * trong trang quan tri ma khong hieu vi sao tien tra ra khong doi.
   *
   * Khong co gia tri mac dinh nao viet cung o day. San pham chua dat ty le thi
   * roi ve con so cu - dung bang hanh vi hom qua, khong tu bia ra mot ty le moi.
   */
  async function tyLeCua(sku, affiliate) {
    if (sku) {
      const sp = await store.get(
        'SELECT commission_rate FROM products WHERE sku = ?', [sku]);
      // Chi NULL moi la "chua dat". So 0 la mot quyet dinh that: san pham nay
      // khong tra hoa hong - phai ton trong, khong duoc coi la chua dat.
      if (sp && sp.commission_rate !== null && sp.commission_rate !== undefined) {
        return num(sp.commission_rate);
      }
    }
    return num(affiliate.commission_rate);
  }

  /**
   * Sinh hoa hong khi mot don chuyen sang paid.
   * Goi tu webhook ngan hang va tu nut xac nhan tay trong admin.
   */
  async function createCommission(order) {
    if (!order || !order.lead_id) return null;

    // order_id la UNIQUE nen goi lai khong bao gio sinh hoa hong thu hai.
    const existing = await store.get('SELECT * FROM commissions WHERE order_id = ?', [order.id]);
    if (existing) return existing;

    const lead = await store.getLeadById(order.lead_id);
    if (!lead || !lead.referred_by) return null;

    // Luot gioi thieu bi danh dau khong hop le (nghi gian lan, hoac admin da
    // huy) thi KHONG sinh hoa hong. Truoc day co nay chi chan bang xep hang chu
    // khong chan tien: ke tu tao luot gioi thieu tu mot IP van an du 20% moi
    // don, va he thong lai tuong nhu da chan duoc.
    if (!Number(lead.referral_valid)) return null;

    const affiliate = await getById(lead.referred_by);
    if (!affiliate || affiliate.status !== 'active') return null;
    if (affiliate.lead_id === lead.id) return null; // chan tu gioi thieu chinh minh

    const rate = await tyLeCua(order.product_sku, affiliate);

    // GOC TINH HOA HONG KHONG DUOC VUOT GIA NIEM YET CUA DON.
    //
    // webhook.js:176 chi chan chuyen THIEU (duoi 98%), khong chan chuyen THUA -
    // don van thanh 'paid' va `paid_amount` mang dung so khach da chuyen. Khach
    // go nham mot so 0 (20.000.000 thay vi 2.000.000) thi dai ly duoc 20% cua
    // con so nham: 4.000.000, nhieu hon ca gia san pham.
    //
    // Day khong phai tinh huong tuong tuong: trang chinh sach cua chinh he
    // thong (apps/funnel-gc/site.config.json:446) liet ke "Chuyen khoan trung
    // hoac chuyen thua" la MOT TRONG BA truong hop duoc hoan tien. Tuc la tien
    // thua se duoc tra lai khach - nhung hoa hong da tra tren phan thua do thi
    // khong doi ve duoc.
    //
    // Van giu duong "tinh tren so THUC NHAN" cho truong hop nguoc lai: chuyen
    // thieu trong nguong 2% (phi, lam tron) thi hoa hong tinh tren so thuc
    // nhan, khong phai gia niem yet.
    const daTra = num(order.paid_amount);
    const niemYet = num(order.amount);
    const orderAmount = daTra && niemYet ? Math.min(daTra, niemYet) : (daTra || niemYet);
    return store.get(
      `INSERT INTO commissions (affiliate_id, order_id, order_code, lead_id, order_amount,
         rate, amount, status, created_at, product_sku)
       VALUES (?,?,?,?,?,?,?,'pending',?,?) RETURNING *`,
      [affiliate.id, order.id, order.code, lead.id, orderAmount, rate,
        Math.round(orderAmount * rate), store.now(), order.product_sku || null],
    );
  }

  // --- ghi nhan luot gioi thieu --------------------------------------------
  /** So luot gioi thieu HOP LE (da tru cac luot bi admin huy). */
  async function validReferralCount(affiliateId) {
    const row = await store.get(
      'SELECT COUNT(*) AS n FROM leads WHERE referred_by = ? AND referral_valid = 1', [affiliateId]);
    return num(row?.n);
  }

  /**
   * Lead moi co duoc tinh cho nguoi gioi thieu khong.
   * Lead luon duoc luu; day chi quyet dinh co tinh diem hay khong.
   */
  async function judgeReferral(lead, referrer, ctx = {}) {
    if (!referrer || referrer.status !== 'active') {
      return { credited: false, reason: 'khong co nguoi gioi thieu' };
    }

    if (referrer.lead_id === lead.id
      || (referrer.phone && referrer.phone === lead.phone)
      || (referrer.email && referrer.email === lead.email)) {
      return { credited: false, reason: 'tu gioi thieu chinh minh' };
    }

    // Nhieu luot tu cung mot IP cho cung nguoi gioi thieu -> cho admin duyet tay
    const maxPerIp = cfg.affiliate.maxPerIp;
    if (maxPerIp > 0 && ctx.ip) {
      const row = await store.get(
        'SELECT COUNT(*) AS n FROM leads WHERE referred_by = ? AND ip = ? AND referral_valid = 1',
        [referrer.id, ctx.ip]);
      if (num(row?.n) >= maxPerIp) {
        return { credited: true, valid: false, reason: `qua ${maxPerIp} luot tu cung IP` };
      }
    }

    return { credited: true, valid: true };
  }

  /** Cap nhat bac mo khoa theo so luot hien tai, va trao nhung gi ho vua du dieu kien. */
  async function refreshLevel(affiliateId) {
    const affiliate = await getById(affiliateId);
    if (!affiliate) return null;

    const count = await validReferralCount(affiliateId);

    // Trao thuong TRUOC khi so sanh bac: phan thuong khong di theo "bac" ma di
    // theo SO LUOT, va hai thu do khong phai luc nao cung doi cung nhau (admin
    // cong nhan mot luot cu thi so luot doi ma bac co the giu nguyen). Dat o
    // day thi moi duong ghi nhan deu di qua - khong cho nao phai tu nho.
    const thuong = await traoThuongTheoLuot({ store, cfg }, affiliate, count)
      .catch((err) => {
        console.warn('[affiliate] khong trao duoc thuong', affiliateId, err?.message || err);
        return { qua: [], ve_vip: false };
      });

    const level = rewards.levelFor(count);
    const current = num(affiliate.unlocked_level) || 1;
    if (level === current) return { level, count, changed: false, thuong };

    // Len bac thi giu moc thoi gian dau tien; tut bac (bi huy luot) thi xoa moc.
    await store.run(
      'UPDATE affiliates SET unlocked_level = ?, unlocked_at = ?, updated_at = ? WHERE id = ?',
      [level, level > 1 ? (affiliate.unlocked_at || store.now()) : null, store.now(), affiliateId]);
    return { level, count, changed: true, up: level > current, thuong };
  }

  /**
   * Sinh hoa hong cho nhung don DA THANH TOAN TU TRUOC cua mot lead.
   *
   * Vi sao can: createCommission chi chay o dung mot khoanh khac - luc don
   * chuyen sang paid. Neu luot gioi thieu duoc ghi nhan SAU do (khach chon
   * nguoi gioi thieu o gian hang, admin cong nhan lai, hoac quan tri gan bu mot
   * ma cu) thi khoanh khac ay da troi qua, va khong co gi goi lai.
   *
   * Doi chieu that: don VIPPXGTDE tra tien 08/09 luc 10:47, luot gioi thieu
   * duoc ghi 09/09 luc 14:25 - nguoi gioi thieu mat 79.800d, khong bao loi,
   * khong ai biet. Ba duong ghi nhan deu tung tu bu lay mot kieu; gio mot cho.
   *
   * Idempotent nho commissions.order_id UNIQUE.
   */
  async function buHoaHong(leadId) {
    const donDaTra = await store.all(
      "SELECT * FROM orders WHERE lead_id = ? AND status = 'paid'", [leadId]);
    let dem = 0;
    for (const don of donDaTra) {
      const c = await createCommission(don).catch(() => null);
      if (c) dem += 1;
    }
    return dem;
  }

  async function creditReferral(lead, referrer, ctx = {}) {
    const verdict = await judgeReferral(lead, referrer, ctx);
    if (!verdict.credited) return { credited: false, reason: verdict.reason };

    await store.run(
      'UPDATE leads SET referred_by = ?, referral_valid = ?, referral_void_reason = ? WHERE id = ?',
      [referrer.id, verdict.valid ? 1 : 0, verdict.valid ? null : verdict.reason, lead.id]);

    clearLeaderboardCache();
    const level = await refreshLevel(referrer.id);
    const hoaHongBu = verdict.valid ? await buHoaHong(lead.id) : 0;
    return {
      credited: true, valid: verdict.valid, reason: verdict.reason || null, level, hoaHongBu,
    };
  }

  /** Admin huy / khoi phuc mot luot gioi thieu. */
  async function setReferralValid(leadId, valid, reason) {
    const lead = await store.getLeadById(leadId);
    if (!lead || !lead.referred_by) return { changed: false, lead };
    await store.run('UPDATE leads SET referral_valid = ?, referral_void_reason = ? WHERE id = ?',
      [valid ? 1 : 0, valid ? null : (reason || 'huy boi admin'), leadId]);
    clearLeaderboardCache();
    const level = await refreshLevel(lead.referred_by);
    const hoaHongBu = valid ? await buHoaHong(leadId) : 0;
    return { changed: true, lead: await store.getLeadById(leadId), level, hoaHongBu };
  }

  // --- bang xep hang -------------------------------------------------------
  const contestWindow = () => {
    const { starts_at: from, ends_at: to } = rewards.CONTEST;
    const clause = [];
    const args = [];
    if (from) { clause.push('l.created_at >= ?'); args.push(from); }
    if (to) { clause.push('l.created_at <= ?'); args.push(to); }
    return { clause: clause.length ? ` AND ${clause.join(' AND ')}` : '', args };
  };

  /** Top nguoi gioi thieu nhieu nhat. Cache 60 giay vi trang cong khai goi lien tuc. */
  async function leaderboard(limit = 10) {
    const nowMs = Date.now();
    if (cache.rows && nowMs - cache.at < 60_000) return cache.rows.slice(0, limit);

    const win = contestWindow();
    const rows = await store.all(`
      SELECT a.id, a.code, a.full_name, a.hide_from_leaderboard, a.unlocked_level,
        (SELECT COUNT(*) FROM leads l
          WHERE l.referred_by = a.id AND l.referral_valid = 1${win.clause}) AS referrals
      FROM affiliates a
      WHERE a.status = 'active'
      ORDER BY referrals DESC, a.id ASC
      LIMIT 50`, win.args);

    // AN THI PHAI AN CA MA GIOI THIEU.
    //
    // Ban cu che ten bang maskName ("Nguyen V. A.") nhung van tra `code` -
    // ma ma gioi thieu sinh TU CHINH TEN (newCode: "THANHK7D" = 6 chu cuoi cua
    // ten + 3 ky tu). Nen che ten xong van doc nguoc ra duoc nguoi do, va viec
    // an tro thanh mot lo`i hua khong giu.
    //
    // `code` chi de trang Dai ly danh dau "day la ban" - ma cho do da co `rank`
    // rieng tu rankOf(), khong can doi chieu qua bang cong khai.
    const ranked = rows.filter((r) => num(r.referrals) > 0).map((r, index) => {
      const an = !!num(r.hide_from_leaderboard);
      return {
        position: index + 1,
        code: an ? null : r.code,
        name: an ? maskName(r.full_name) : r.full_name,
        referrals: num(r.referrals),
        level: num(r.unlocked_level) || 1,
      };
    });

    cache = { at: nowMs, rows: ranked };
    return ranked.slice(0, limit);
  }

  /** Vi tri trong cuoc dua + con thieu bao nhieu luot de chen vao top. */
  async function rankOf(affiliateId) {
    const affiliate = await getById(affiliateId);
    if (!affiliate) return null;

    const board = await leaderboard(50);
    const row = board.find((r) => r.code === affiliate.code);
    const top = rewards.CONTEST.top;
    const cutoff = board[top - 1];
    const mine = row ? row.referrals : await validReferralCount(affiliateId);

    // Ngoai 50 nguoi dau thi bang xep hang khong chua ho, va ban cu tra
    // position: null - trang Dai ly hien mot o trong, nhu the ho khong ton tai.
    // Dem thang so nguoi dang tren ho thay vi bo cuoc.
    let position = row ? row.position : null;
    if (!row && mine > 0) {
      const win = contestWindow();
      const tren = await store.get(`
        SELECT COUNT(*) AS n FROM affiliates a
         WHERE a.status = 'active'
           AND (SELECT COUNT(*) FROM leads l
                 WHERE l.referred_by = a.id AND l.referral_valid = 1${win.clause}) > ?`,
      [...win.args, mine]);
      position = num(tren?.n) + 1;
    }

    return {
      position,
      referrals: mine,
      total: board.length,
      top,
      in_top: !!position && position <= top,
      need_for_top: position && position <= top
        ? 0
        : Math.max(1, (cutoff ? cutoff.referrals : 1) - mine + 1),
    };
  }

  async function setLeaderboardVisibility(affiliateId, hidden) {
    await store.run('UPDATE affiliates SET hide_from_leaderboard = ?, updated_at = ? WHERE id = ?',
      [hidden ? 1 : 0, store.now(), affiliateId]);
    clearLeaderboardCache();
    return getById(affiliateId);
  }

  // --- thong ke ------------------------------------------------------------
  async function stats(affiliateId) {
    const [clicks, referrals, orders, commission] = await Promise.all([
      store.get('SELECT COUNT(*) AS n FROM referral_clicks WHERE affiliate_id = ?', [affiliateId]),
      store.get('SELECT COUNT(*) AS n FROM leads WHERE referred_by = ? AND referral_valid = 1',
        [affiliateId]),
      // `referral_valid = 1` phai co o day: luot bi admin loai thi KHONG sinh hoa
      // hong (xem createCommission), nen neu doanh thu van cong vao thi portal
      // bay ra mot con doanh thu khong bao gio thanh tien - va nguoi ta hoi.
      store.get(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(o.paid_amount, o.amount)),0) AS revenue
                 FROM orders o JOIN leads l ON l.id = o.lead_id
                 WHERE l.referred_by = ? AND l.referral_valid = 1 AND o.status = 'paid'`,
      [affiliateId]),
      // KHOAN DA HUY (`void`) KHONG DUOC NAM TRONG BAT KY O NAO.
      //
      // `status <> 'paid'` gom luon `void`, nen mot khoan admin vua huy vi nghi
      // gian lan van hien trong o "Dang cho chi tra" cua CHINH nguoi bi huy
      // (Affiliate.jsx:95) - ho doc con so do la tien sap nhan, va se hoi. Do
      // dung la thu voidCommission (routes/admin.js) duoc viet ra de dap.
      //
      // `total` cung phai tru: no la "da kiem duoc", ma khoan bi huy thi khong
      // kiem duoc. Huy roi ma tong khong doi thi khong ai tin duoc con so nao.
      store.get(`SELECT COALESCE(SUM(CASE WHEN status <> 'void' THEN amount ELSE 0 END),0) AS total,
                   COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END),0) AS paid,
                   COALESCE(SUM(CASE WHEN status NOT IN ('paid','void') THEN amount ELSE 0 END),0)
                     AS pending,
                   COALESCE(SUM(CASE WHEN status = 'void' THEN amount ELSE 0 END),0) AS voided
                 FROM commissions WHERE affiliate_id = ?`, [affiliateId]),
    ]);

    const clickCount = num(clicks?.n);
    const referralCount = num(referrals?.n);
    return {
      clicks: clickCount,
      referrals: referralCount,
      paid_orders: num(orders?.n),
      revenue: num(orders?.revenue),
      commission_total: num(commission?.total),
      commission_paid: num(commission?.paid),
      commission_pending: num(commission?.pending),
      commission_void: num(commission?.voided),
      conversion_rate: clickCount ? Math.round((referralCount / clickCount) * 1000) / 10 : 0,
    };
  }

  /** Nguoi da dang ky qua link cua affiliate (che bot thong tin ca nhan o route). */
  const listReferrals = (affiliateId, limit = 100) => store.all(`
    SELECT l.id, l.full_name, l.created_at, l.referral_valid, l.referral_void_reason,
           (SELECT o.status FROM orders o WHERE o.lead_id = l.id ORDER BY o.id DESC LIMIT 1) AS order_status,
           (SELECT COALESCE(o2.paid_amount, o2.amount) FROM orders o2
             WHERE o2.lead_id = l.id AND o2.status = 'paid' ORDER BY o2.id DESC LIMIT 1) AS paid_amount
    FROM leads l WHERE l.referred_by = ? ORDER BY l.id DESC LIMIT ?`, [affiliateId, limit]);

  const listAll = ({ limit = 50, offset = 0, search = '' } = {}) => {
    const args = [];
    let clause = '';
    if (search) {
      clause = 'WHERE (a.full_name LIKE ? OR a.code LIKE ? OR a.phone LIKE ? OR a.email LIKE ?)';
      const like = `%${search}%`;
      args.push(like, like, like, like);
    }
    return store.all(`
      SELECT a.*,
        (SELECT COUNT(*) FROM referral_clicks c WHERE c.affiliate_id = a.id) AS clicks,
        (SELECT COUNT(*) FROM leads l WHERE l.referred_by = a.id AND l.referral_valid = 1) AS referrals,
        (SELECT COUNT(*) FROM leads lp WHERE lp.referred_by = a.id AND lp.referral_valid = 0) AS pending_referrals,
        (SELECT COUNT(*) FROM orders o JOIN leads l2 ON l2.id = o.lead_id
          WHERE l2.referred_by = a.id AND l2.referral_valid = 1 AND o.status = 'paid') AS paid_orders,
        (SELECT COALESCE(SUM(COALESCE(o2.paid_amount, o2.amount)),0) FROM orders o2
          JOIN leads l3 ON l3.id = o2.lead_id
          WHERE l3.referred_by = a.id AND l3.referral_valid = 1 AND o2.status = 'paid') AS revenue,
        (SELECT COALESCE(SUM(cm.amount),0) FROM commissions cm
          WHERE cm.affiliate_id = a.id AND cm.status <> 'void') AS commission_total,
        (SELECT COALESCE(SUM(cm2.amount),0) FROM commissions cm2
          WHERE cm2.affiliate_id = a.id AND cm2.status NOT IN ('paid','void')) AS commission_pending
      FROM affiliates a
      ${clause}
      ORDER BY commission_total DESC, referrals DESC, a.id DESC
      LIMIT ? OFFSET ?`, [...args, limit, offset]);
  };

  const countAll = () => store.get('SELECT COUNT(*) AS n FROM affiliates');

  const listCommissions = ({ status = '', limit = 100 } = {}) => {
    const filtered = ['pending', 'approved', 'paid'].includes(status);
    return store.all(`
      SELECT c.*, a.code AS affiliate_code, a.full_name AS affiliate_name, a.phone AS affiliate_phone
      FROM commissions c JOIN affiliates a ON a.id = c.affiliate_id
      ${filtered ? 'WHERE c.status = ?' : ''}
      ORDER BY c.id DESC LIMIT ?`, filtered ? [status, limit] : [limit]);
  };

  /**
   * Doi trang thai mot khoan hoa hong.
   * "AND status <> ?" khien viec bam hai lan khong the ghi de moc thoi gian da
   * tra - admin nhin `changed` la biet minh vua thao tac that hay bam trung.
   */
  async function setCommissionStatus(id, status, note) {
    // Giu nguyen paid_at khi KHONG phai dang danh dau da tra. Ban cu dat null:
    // huy mot khoan da tra la xoa luon ngay da chuyen tien, doi soat cuoi thang
    // khong con gi de doi chieu.
    const info = await store.run(
      `UPDATE commissions
          SET status = ?,
              paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END,
              note = COALESCE(?, note)
        WHERE id = ? AND status <> ?`,
      [status, status, store.now(), note || null, id, status]);
    return {
      changed: info.changes > 0,
      commission: await store.get('SELECT * FROM commissions WHERE id = ?', [id]),
    };
  }

  async function setStatus(code, status) {
    const info = await store.run('UPDATE affiliates SET status = ?, updated_at = ? WHERE code = ?',
      [status, store.now(), String(code).toUpperCase()]);
    clearLeaderboardCache();
    return { changed: info.changes > 0, affiliate: await getByCode(code) };
  }

  async function setRate(code, rate) {
    const info = await store.run(
      'UPDATE affiliates SET commission_rate = ?, updated_at = ? WHERE code = ?',
      [rate, store.now(), String(code).toUpperCase()]);
    return { changed: info.changes > 0, affiliate: await getByCode(code) };
  }

  /**
   * Link chia se + link xem thong ke rieng cua affiliate.
   *
   * Link chia se PHAI tro ve trang ban hang. Truoc day no lay origin cua chinh
   * request: hoc vien mo trang Affiliate trong khu vuc thanh vien thi link sinh
   * ra mang ten mien cua webapp - nguoi duoc moi bam vao roi thang vao man hinh
   * dang nhap, khong thay trang ban hang, va cu bam do khong duoc ghi cho ai
   * (funnel.js moi la noi goi POST /api/ref).
   */
  const links = (affiliate, origin) => {
    const laApp = cfg.appHost && origin && (() => {
      try { return new URL(origin).hostname === cfg.appHost; } catch { return false; }
    })();
    const base = (cfg.publicUrl || (laApp && cfg.salesOrigin) || origin || '').replace(/\/$/, '');
    return {
      share_url: `${base}/?ref=${affiliate.code}`,
      portal_url: `${base}/dai-ly?token=${affiliate.token}`,
    };
  };

  return {
    ensureForLead, ensureForUser, recordClick, createCommission, stats, links, maskName,
    creditReferral, setReferralValid, validReferralCount, refreshLevel, buHoaHong,
    leaderboard, clearLeaderboardCache, rankOf, setLeaderboardVisibility,
    getById, getByCode, getByCodeOrMapped, getByToken, getByLead,
    listReferrals, listAll, countAll, listCommissions, setCommissionStatus, setStatus, setRate,
  };
}
