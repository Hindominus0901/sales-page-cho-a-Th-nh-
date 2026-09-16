import { json, apiError } from '../lib/respond.js';
import { rateLimit, setCookie, REF_COOKIE } from '../lib/http.js';
import { loadUser } from '../auth/guard.js';

/** Ma gioi thieu dang duoc ghi nhan cho khach nay (cookie dat khi bam link ?ref=). */
export const refCodeFromRequest = (rc) => rc.cookies[REF_COOKIE] || '';

/**
 * Duong lui khi KHONG co cookie ref: doc lai ma tu dia chi trang ma phien nay
 * dap vao.
 *
 * Vi sao can: cookie ref chi duoc dat khi POST /api/ref chay XONG. No duoc goi
 * kieu ban roi quen luc trang vua mo, nen chi can nguoi ta bam tiep sang trang
 * dang ky trong lúc do la yeu cau bi huy - khong cookie, khong dong nao trong
 * referral_clicks, va nguoi gioi thieu mat luot du ma hoan toan hop le.
 *
 * Doi chieu that: lead 232 vao luc 02:53:33 bang ?ref=NHNGOCCA9 (ma that, con
 * hoat dong), dang ky luc 02:55:42 CUNG PHIEN - va khong duoc tinh cho ai.
 *
 * `sessions.landing_url` thi luon duoc ghi, boi mot duong khac (/api/track).
 */
const RE_MA_REF = /[?&]ref=([A-Za-z0-9]{4,20})/;
export function refCodeFromSession(session) {
  for (const cot of [session?.landing_url, session?.referrer]) {
    const m = RE_MA_REF.exec(String(cot || ''));
    if (m) return m[1].toUpperCase();
  }
  return '';
}

/**
 * Ghi lai mot ma gioi thieu khong ton tai.
 *
 * Vi sao can: ai do van dang di rai mot link cu (mot he thong khac, hoac mot
 * mau quang cao chua thay ma). Nguoi bam vao van dang ky binh thuong nen nhin
 * tu ngoai khong co gi sai - chi nguoi gioi thieu la mat luot, va khong mot ai
 * biet de sua. Dem o day de trang quan tri noi duoc ra thanh loi.
 *
 * Loi o day KHONG duoc lam hong viec ghi nhan: nuot lai va di tiep.
 */
async function ghiMaLa(rc, code) {
  try {
    const t = rc.store.now();
    await rc.store.run(
      `INSERT INTO ref_ma_la (ma, so_lan, landing_url, lan_dau, lan_cuoi)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(ma) DO UPDATE SET
         so_lan      = ref_ma_la.so_lan + 1,
         lan_cuoi    = excluded.lan_cuoi,
         landing_url = COALESCE(ref_ma_la.landing_url, excluded.landing_url)`,
      [code, String(rc.body?.landing_url || '').slice(0, 500), t, t],
    );

    // Ghi luon PHIEN da bam. Day moi la thu cho phep tra lai luot cho dung
    // nguoi ve sau: dong `sessions` giu nguon dau tien nen no khong nho gi ve
    // cu bam nay, con day thi nho chinh xac.
    await rc.store.run(
      `INSERT INTO ref_ma_la_phien (ma, session_id, created_at) VALUES (?,?,?)
       ON CONFLICT(ma, session_id) DO NOTHING`,
      [code, rc.sid, t],
    );
  } catch (err) {
    console.warn('[ref] khong ghi duoc ma la', code, err?.message);
  }
}

/**
 * POST /api/ref  Body: { code, landing_url, referrer }
 * Goi khi trang duoc mo voi ?ref=MA. Ghi 1 luot bam va dat cookie 60 ngay.
 */
export async function trackRef(rc) {
  const limit = await rateLimit(rc, `ref:${rc.ip}`, 60, 60 * 1000);
  if (!limit.allowed) return json({ ok: true, throttled: true }, 202);

  const code = String(rc.body?.code || '').toUpperCase().slice(0, 20);
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    return apiError(400, 'bad_code', 'Mã giới thiệu không hợp lệ');
  }

  // getByCodeOrMapped: ma la DA duoc gan cho mot cong tac vien that thi luot bam
  // nay ve thang cho ho, khong cho admin vao gan tay lan nua.
  const affiliate = await rc.affiliates.getByCodeOrMapped(code);
  if (!affiliate || affiliate.status !== 'active') {
    await ghiMaLa(rc, code);
    return json({ ok: true, valid: false });
  }
  // Van dem luot cho ma cu, de trang quan tri con thay link nao dang duoc rai.
  if (affiliate.code !== code) await ghiMaLa(rc, code);

  await rc.store.upsertSession(rc.sid, {
    ip: rc.ip, userAgent: rc.userAgent, attribution: rc.body?.attribution,
  });
  const click = await rc.affiliates.recordClick(affiliate, {
    session_id: rc.sid,
    landing_url: rc.body?.landing_url,
    referrer: rc.body?.referrer,
    ip: rc.ip,
    user_agent: rc.userAgent,
  });

  setCookie(rc, REF_COOKIE, affiliate.code, {
    maxAge: rc.cfg.affiliate.cookieDays * 24 * 60 * 60,
  });

  return json({ ok: true, valid: true, counted: click.counted, referrer_name: affiliate.full_name });
}

async function portalPayload(rc, affiliate) {
  const { cfg, store, rewards, affiliates } = rc;
  const link = affiliates.links(affiliate, rc.origin);
  const [stats, referrals, commissions, rank, board] = await Promise.all([
    affiliates.stats(affiliate.id),
    affiliates.listReferrals(affiliate.id, 100),
    store.all('SELECT * FROM commissions WHERE affiliate_id = ? ORDER BY id DESC LIMIT 50',
      [affiliate.id]),
    affiliates.rankOf(affiliate.id),
    affiliates.leaderboard(rewards.CONTEST.top),
  ]);

  const validCount = stats.referrals;
  const rate = Number(affiliate.commission_rate);

  return {
    affiliate: {
      code: affiliate.code,
      full_name: affiliate.full_name,
      status: affiliate.status,
      level: Number(affiliate.unlocked_level) || 1,
      unlocked_at: affiliate.unlocked_at,
      hide_from_leaderboard: !!Number(affiliate.hide_from_leaderboard),
      commission_rate: rate,
      commission_rate_text: `${Math.round(rate * 100)}%`,
      created_at: affiliate.created_at,
    },
    links: link,
    share: { url: link.share_url, messages: rewards.shareMessages(link.share_url) },
    // Tuyen 1: mo khoa phan thuong theo so nguoi gioi thieu duoc
    progress: rewards.progress(validCount),
    tiers: rewards.tierStatus(validCount),
    tiers_configured: rewards.tiersConfigured,
    next_tier: rewards.nextTier(validCount),
    // Tuyen 2: cuoc dua top
    contest: rewards.contestInfo(),
    rank,
    leaderboard: board,
    // Tuyen 3: hoa hong ban ve
    product: {
      name: cfg.product.name,
      price: cfg.product.price,
      price_text: cfg.formatPrice(cfg.product.price),
      commission_per_sale: Math.round(cfg.product.price * rate),
      commission_per_sale_text: cfg.formatPrice(Math.round(cfg.product.price * rate)),
    },
    stats: {
      ...stats,
      revenue_text: cfg.formatPrice(stats.revenue),
      commission_total_text: cfg.formatPrice(stats.commission_total),
      commission_paid_text: cfg.formatPrice(stats.commission_paid),
      commission_pending_text: cfg.formatPrice(stats.commission_pending),
    },
    referrals: referrals.map((r) => ({
      name: affiliates.maskName(r.full_name), // che bot ten de bao mat khach hang
      created_at: r.created_at,
      valid: !!Number(r.referral_valid),
      pending_reason: Number(r.referral_valid) ? null : 'đang chờ xác minh',
      order_status: r.order_status || null,
      paid_amount: r.paid_amount || 0,
    })),
    commissions: commissions.map((c) => ({
      order_code: c.order_code,
      amount: c.amount,
      amount_text: cfg.formatPrice(c.amount),
      status: c.status,
      created_at: c.created_at,
      paid_at: c.paid_at,
    })),
    zalo_url: cfg.zalo.supportUrl,
    zalo_group_url: cfg.zalo.groupUrl || null,
  };
}

/**
 * Tim affiliate tu token tren URL, hoac tu nguoi dang xem ("me").
 *
 * "me" phai thu TAI KHOAN DANG NHAP truoc. Ban cu chi tra theo cookie phien
 * cua trang ban hang (getLeadBySession) - ma hoc vien dang nhap vao app thi
 * khong he co cookie do, nen trang Affiliate cua ho luon nhan 404 va khong
 * hien duoc link gioi thieu, hoa hong hay gi ca.
 *
 * Van giu duong cu lam duong lui: nguoi vua dien form o funnel (chua co tai
 * khoan) van xem duoc portal ngay o trang xac nhan.
 */
const last8 = (v) => String(v || '').replace(/\D/g, '').slice(-8);

export async function affiliateOfUser(rc, user) {
  // 1. Noi thang qua lead cu - chac chan nhat
  if (user.legacy_lead_id) {
    const byLead = await rc.affiliates.getByLead(user.legacy_lead_id);
    if (byLead) return byLead;
  }
  // 2. Theo email
  const email = String(user.email || '').toLowerCase();
  if (email) {
    const row = await rc.store.get(
      'SELECT * FROM affiliates WHERE lower(email) = ? LIMIT 1', [email]);
    if (row) return row;
  }
  // 3. Theo 8 chu so cuoi cua so dien thoai (hai ben luu khac dinh dang)
  //
  // CHI `phone_e164`, TUYET DOI KHONG `phone`.
  //
  // `users.phone` la o ho so, ai cung tu sua duoc qua PATCH /api/auth/me va
  // KHONG he duoc xac minh. Truoc day ham nay nhan ca hai, nen mot tai khoan
  // moi bat ky chi can dat `phone` bang so cua mot dai ly la
  // GET /api/affiliate/me tra ve nguyen cong cua nguoi ta: danh sach nguoi da
  // gioi thieu, doanh thu, hoa hong, va `affiliate.token` - token dung duoc
  // mai qua /api/affiliate/:token. Cung ham nay con dem `min_referrals` khi doi
  // qua, nen con mo khoa duoc qua bang luot moi cua nguoi khac.
  //
  // `phone_e164` thi khac: no chi duoc ghi mot lan trong auth/invite.js luc tao
  // tai khoan tu don hang that, khong nam trong danh sach `writable` cua entity
  // User, va khong duong nao cho nguoi dung dat lai. Nen no van dung de khop.
  const tail = last8(user.phone_e164);
  if (tail.length === 8) {
    const row = await rc.store.get(
      "SELECT * FROM affiliates WHERE phone IS NOT NULL"
      + " AND substr(replace(replace(phone,'+',''),' ',''), -8) = ? LIMIT 1", [tail]);
    if (row) return row;
  }
  return null;
}

async function resolveAffiliate(rc, { capNeuChua = false } = {}) {
  const token = String(rc.params.token || '');
  if (token === 'me') {
    const user = await loadUser(rc).catch(() => null);
    if (user) {
      const mine = await affiliateOfUser(rc, user);
      if (mine) return mine;
      // Chua co thi CAP LUON. Hoc vien dang nhap bang Google chua bao gio di
      // qua form o trang ban hang, ma do la cho duy nhat tung sinh ra affiliate
      // - nen tab Dai ly cua ho bao "can dang ky Challenge truoc" mai mai.
      if (capNeuChua && rc.cfg.affiliate.autoEnroll) {
        const moi = await rc.affiliates.ensureForUser(user).catch(() => null);
        if (moi) return moi;
      }
    }
    const lead = await rc.store.getLeadBySession(rc.sid);
    return lead ? rc.affiliates.getByLead(lead.id) : null;
  }
  if (/^[a-f0-9]{32}$/.test(token)) return rc.affiliates.getByToken(token);
  return null;
}

/**
 * GET /api/affiliate/:token   - trang thong ke rieng cua nguoi gioi thieu
 * GET /api/affiliate/me       - lay theo phien hien tai (vua dang ky xong)
 */
export async function getPortal(rc) {
  const affiliate = await resolveAffiliate(rc, { capNeuChua: true });
  if (!affiliate) {
    return apiError(404, 'affiliate_not_found',
      'Không tìm thấy link giới thiệu. Bạn cần đăng ký Challenge trước để nhận link.');
  }
  return json({ ok: true, ...(await portalPayload(rc, affiliate)) });
}

/**
 * POST /api/affiliate/:token/settings  Body: { hide_from_leaderboard: bool }
 */
export async function updateSettings(rc) {
  const affiliate = await resolveAffiliate(rc);
  if (!affiliate) return apiError(404, 'affiliate_not_found', 'Không tìm thấy link giới thiệu.');

  if (typeof rc.body?.hide_from_leaderboard !== 'boolean') {
    return apiError(400, 'bad_request', 'Thiếu tham số hide_from_leaderboard');
  }
  const updated = await rc.affiliates.setLeaderboardVisibility(
    affiliate.id, rc.body.hide_from_leaderboard);

  return json({ ok: true, hide_from_leaderboard: !!Number(updated.hide_from_leaderboard) });
}

/** GET /api/leaderboard - cong khai, hien tren trang xac nhan va trang dai ly. */
export async function getLeaderboard(rc) {
  const raw = parseInt(rc.url.searchParams.get('limit') || '10', 10) || 10;
  const limit = Math.min(20, Math.max(3, raw));
  const board = await rc.affiliates.leaderboard(limit);

  // Neu nguoi xem cung la mot cong tac vien thi kem luon vi tri cua ho
  let me = null;
  const lead = await rc.store.getLeadBySession(rc.sid);
  if (lead) {
    const mine = await rc.affiliates.getByLead(lead.id);
    if (mine) me = await rc.affiliates.rankOf(mine.id);
  }

  return json({ ok: true, contest: rc.rewards.contestInfo(), items: board, me });
}
