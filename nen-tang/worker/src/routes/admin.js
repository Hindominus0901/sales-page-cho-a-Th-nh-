import { json, apiError, SECURITY_HEADERS, PRIVATE_HEADERS } from '../lib/respond.js';
import { rateLimit } from '../lib/http.js';
import { ensureCsrfCookie, checkCsrf } from '../lib/csrf.js';
import * as adminAuth from '../lib/adminauth.js';
import { QUESTIONS, flattenAnswers } from '../questions.js';
import { notifyAsync } from '../lib/notify.js';
import { loadUser } from '../auth/guard.js';
import { kitStatus, kitLists, kitTest, kitBackfill } from './admin-kit.js';
import { fulfilOrder } from '../commerce/fulfil.js';
import { traoThuongTheoLuot } from '../commerce/thuong-gioi-thieu.js';
import { guiLaiThuMoi } from '../auth/invite.js';

/**
 * Mot dong du lieu hong (vd tu dot di tru) khong duoc lam sap ca trang danh
 * sach lan file CSV xuat ra.
 */
function safeAnswers(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const int = (value) => Number(value) || 0;

const intParam = (url, key, fallback, max) => {
  const v = parseInt(url.searchParams.get(key) || '', 10);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return max ? Math.min(v, max) : v;
};

/** Chua dat ADMIN_PASSWORD_HASH va cung khong co tai khoan admin nao. */
const notConfigured = (rc) => !rc.cfg.admin.passwordHash;

/**
 * Ba duong vao khu vuc quan tri, deu dan toi cung mot noi:
 *
 *   1. Tai khoan nen tang co role='admin'  - duong chinh, dung tu nay tro di
 *   2. Cookie quan tri rieng cua trang funnel cu  - giu de /admin.html con chay
 *   3. Header X-Admin-Token  - cho script va CI
 *
 * Truoc day (1) va (2) la hai he tach roi: dang nhap vao cong dong voi quyen
 * admin van bi tu choi o /api/admin/*, nen trang Doanh thu va Affiliate trong
 * cong quan tri moi luon bao loi 401.
 *
 * @returns null neu duoc phep di tiep, hoac Response loi.
 */
async function requireAdmin(rc) {
  const limit = await rateLimit(rc, `admin:${rc.ip}`, 120, 60 * 1000);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Quá nhiều yêu cầu');

  // (1) Tai khoan nen tang
  const user = await loadUser(rc);
  if (user?.role === 'admin') {
    const bad = checkCsrf(rc);
    if (bad) return apiError(403, 'csrf_failed', bad);
    return null;
  }

  // (2) va (3) - he cu cua trang funnel
  if (notConfigured(rc)) {
    return apiError(503, 'admin_not_configured',
      'Chưa có tài khoản quản trị. Đăng nhập bằng tài khoản có quyền admin, hoặc đặt '
      + 'ADMIN_PASSWORD_HASH bằng lệnh: wrangler secret put ADMIN_PASSWORD_HASH');
  }
  const auth = await adminAuth.authenticate(rc);
  if (!auth.ok) return apiError(401, 'unauthorized', 'Bạn cần đăng nhập lại.');

  // Chi kiem CSRF khi quyen den TU COOKIE. Nguoi goi bang X-Admin-Token
  // (script, CI) khong co cookie nao de trang web khac loi dung, nen kiem o
  // day la vo nghia.
  if (auth.via === 'session') {
    const bad = checkCsrf(rc);
    if (bad) return apiError(403, 'csrf_failed', bad);
  }
  return null;
}

// --- phien dang nhap --------------------------------------------------------
/** POST /api/admin/login  Body: { username, password } */
async function login(rc) {
  const limit = await rateLimit(rc, `login:${rc.ip}`, 8, 15 * 60 * 1000);
  if (!limit.allowed) {
    return apiError(429, 'too_many_attempts',
      'Sai quá nhiều lần. Thử lại sau ít phút.', { retry_after: limit.retryAfter });
  }
  if (notConfigured(rc)) {
    return apiError(503, 'admin_not_configured', 'Chưa đặt mật khẩu quản trị (ADMIN_PASSWORD_HASH).');
  }

  const username = String(rc.body?.username || '').slice(0, 60);
  const result = await adminAuth.checkCredentials(rc.cfg, username, String(rc.body?.password || ''));
  if (!result.ok) {
    await rc.store.audit('admin.login_failed', username, { ip: rc.ip }, rc.ip).catch(() => {});
    return apiError(401, 'invalid_credentials', 'Sai tài khoản hoặc mật khẩu.');
  }

  await adminAuth.loginSession(rc, rc.cfg.admin.user);
  await rc.store.audit('admin.login', rc.cfg.admin.user, null, rc.ip).catch(() => {});
  return json({ ok: true, user: rc.cfg.admin.user, expires_in_hours: rc.cfg.admin.sessionHours });
}

async function logout(rc) {
  adminAuth.clearSession(rc);
  return json({ ok: true });
}

/** GET /api/admin/me - trang admin goi luc mo de biet con phien hay khong. */
async function me(rc) {
  // Trang quan tri goi day luc mo -> nhan tien cap ma chong CSRF cho cac lan sau.
  ensureCsrfCookie(rc);
  const auth = await adminAuth.authenticate(rc);
  // Tai khoan nen tang co quyen admin cung duoc tinh la da dang nhap - neu
  // khong, cong quan tri moi se bao "chua dang nhap" du nguoi dung dang o trong.
  const user = await loadUser(rc);
  const viaPlatform = user?.role === 'admin';
  return json({
    ok: true,
    authenticated: auth.ok || viaPlatform,
    user: auth.user || (viaPlatform ? user.full_name || user.email : null),
    via: viaPlatform ? 'platform' : (auth.via || null),
    configured: !notConfigured(rc),
    starter_password: false, // khong con mat khau khoi tao trong ma nguon
    storage: 'd1',
  });
}

// --- tong quan --------------------------------------------------------------
async function stats(rc) {
  const { store, cfg, rewards } = rc;

  const [sessionRow, leadRow, orderRow, paidRow, pendingRow] = await Promise.all([
    store.get('SELECT COUNT(*) AS n FROM sessions'),
    store.get('SELECT COUNT(*) AS n FROM leads'),
    store.get('SELECT COUNT(*) AS n FROM orders'),
    store.get(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(paid_amount, amount)),0) AS revenue
               FROM orders WHERE status='paid'`),
    store.get("SELECT COUNT(*) AS n FROM orders WHERE status='pending'"),
  ]);

  const [affRow2, commRow, unlockedRow, sharerRow] = await Promise.all([
    store.get("SELECT COUNT(*) AS n FROM affiliates WHERE status = 'active'"),
    // Bo khoan da huy ra khoi ca hai o - xem chu thich trong affiliates.js:
    // `status <> 'paid'` gom luon `void`, nen o quan tri va o cua dai ly deu
    // dem tien se khong bao gio duoc tra.
    store.get(`SELECT COALESCE(SUM(CASE WHEN status <> 'void' THEN amount ELSE 0 END),0) AS total,
                 COALESCE(SUM(CASE WHEN status NOT IN ('paid','void') THEN amount ELSE 0 END),0)
                   AS pending,
                 COUNT(*) AS n FROM commissions WHERE status <> 'void'`),
    store.get('SELECT COUNT(*) AS n FROM affiliates WHERE unlocked_level > 1'),
    store.get(`SELECT COUNT(DISTINCT referred_by) AS n FROM leads
               WHERE referred_by IS NOT NULL AND referral_valid = 1`),
  ]);

  const [segments, byDay, topSources, events, suspiciousIps] = await Promise.all([
    store.all('SELECT segment, COUNT(*) AS n FROM leads GROUP BY segment'),
    store.all(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS leads
               FROM leads GROUP BY substr(created_at,1,10) ORDER BY day DESC LIMIT 14`),
    store.all(`SELECT COALESCE(NULLIF(utm_source,''),'(direct)') AS source, COUNT(*) AS n
               FROM leads GROUP BY COALESCE(NULLIF(utm_source,''),'(direct)')
               ORDER BY n DESC LIMIT 10`),
    store.all('SELECT type, COUNT(*) AS n FROM events GROUP BY type ORDER BY n DESC'),
    // Nhieu don "cho thanh toan" tu cung mot IP thuong la don ao/test hon la
    // khach that. Chi de ra soat tay, khong tu dong chan ai ca.
    store.all(`SELECT l.ip AS ip, COUNT(*) AS pending_orders
               FROM orders o JOIN leads l ON l.id = o.lead_id
               WHERE o.status = 'pending' AND l.ip IS NOT NULL AND l.ip <> ''
               GROUP BY l.ip HAVING COUNT(*) >= 2 ORDER BY pending_orders DESC LIMIT 20`),
  ]);

  const sessions = int(sessionRow?.n);
  const leads = int(leadRow?.n);
  const orders = int(orderRow?.n);
  const paid = int(paidRow?.n);
  const revenue = int(paidRow?.revenue);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  return json({
    ok: true,
    storage: 'd1',
    funnel: {
      sessions,
      leads,
      orders,
      paid,
      pending: int(pendingRow?.n),
      cr_session_to_lead: pct(leads, sessions),
      cr_lead_to_order: pct(orders, leads),
      cr_order_to_paid: pct(paid, orders),
    },
    revenue: {
      total: revenue,
      total_text: cfg.formatPrice(revenue),
      aov: paid ? Math.round(revenue / paid) : 0,
    },
    affiliate: {
      active: int(affRow2?.n),
      commission_count: int(commRow?.n),
      commission_total: int(commRow?.total),
      commission_total_text: cfg.formatPrice(int(commRow?.total)),
      commission_pending: int(commRow?.pending),
      commission_pending_text: cfg.formatPrice(int(commRow?.pending)),
      default_rate_text: `${Math.round(cfg.affiliate.rate * 100)}%`,
      unlocked: int(unlockedRow?.n),
      sharers: int(sharerRow?.n),
      share_rate: leads ? Math.round((int(sharerRow?.n) / leads) * 1000) / 10 : 0,
      first_target: rewards.TIERS.length ? rewards.TIERS[0].target : 0,
    },
    segments: segments.map((s) => ({ segment: s.segment, n: int(s.n) })),
    by_day: byDay.map((d) => ({ day: d.day, leads: int(d.leads) })),
    top_sources: topSources.map((s) => ({ source: s.source, n: int(s.n) })),
    events: events.map((e) => ({ type: e.type, n: int(e.n) })),
    risk: {
      suspicious_ips: suspiciousIps.map((r) => ({ ip: r.ip, pending_orders: int(r.pending_orders) })),
    },
  });
}

// --- lead -------------------------------------------------------------------
async function listLeads(rc) {
  const { store, url } = rc;
  const limit = intParam(url, 'limit', 50, 500);
  const offset = intParam(url, 'offset', 0);
  const segment = url.searchParams.get('segment');
  const search = (url.searchParams.get('q') || '').trim();

  const where = [];
  const args = [];
  if (segment && ['hot', 'warm', 'cold'].includes(segment)) {
    where.push('segment = ?');
    args.push(segment);
  }
  if (search) {
    where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR phone_e164 LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await store.get(`SELECT COUNT(*) AS n FROM leads ${clause}`, args);
  const rows = await store.all(
    `SELECT * FROM leads ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);

  const ids = rows.map((r) => r.id);
  const orders = ids.length
    ? await store.all(
      `SELECT lead_id, code, status, amount FROM orders
       WHERE lead_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`, ids)
    : [];
  const orderByLead = new Map();
  for (const o of orders) orderByLead.set(o.lead_id, o); // don moi nhat ghi de don cu

  const items = rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    score: row.score,
    segment: row.segment,
    status: row.status,
    submissions: row.submissions,
    utm_source: row.utm_source,
    created_at: row.created_at,
    answers: flattenAnswers(safeAnswers(row.answers_json)),
    order: orderByLead.get(row.id) || null,
  }));

  return json({
    ok: true,
    total: int(totalRow?.n),
    limit,
    offset,
    items,
    questions: QUESTIONS.map((q) => ({ key: q.key, label: q.label })),
  });
}

// --- don hang ---------------------------------------------------------------
async function listOrders(rc) {
  const { store, url } = rc;
  const limit = intParam(url, 'limit', 50, 500);
  const offset = intParam(url, 'offset', 0);
  const status = url.searchParams.get('status');
  const filtered = status && ['pending', 'paid', 'cancelled'].includes(status);
  const clause = filtered ? 'WHERE status = ?' : '';
  const args = filtered ? [status] : [];

  const totalRow = await store.get(`SELECT COUNT(*) AS n FROM orders ${clause}`, args);
  const items = await store.all(
    `SELECT * FROM orders ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);

  return json({ ok: true, total: int(totalRow?.n), limit, offset, items });
}

async function markPaid(rc) {
  const code = String(rc.params.code || '').toUpperCase();
  const order = await rc.store.getOrderByCode(code);
  if (!order) return apiError(404, 'order_not_found', 'Không tìm thấy đơn');

  const { changed } = await rc.store.markOrderPaid(code, {
    amount: Number(rc.body?.amount) || order.amount,
    ref: String(rc.body?.ref || 'manual'),
    note: rc.body?.note ? String(rc.body.note).slice(0, 300) : 'xác nhận thủ công',
    // Chi admin bam tay moi duoc hoi sinh don da huy; webhook thi khong.
    allowCancelled: true,
  });
  if (changed) {
    await rc.affiliates.createCommission(order);
    // Xac nhan tay cung phai mo quyen y het webhook, khong thi don xac nhan tay
    // se la mot loai don "da tra tien nhung khong xem duoc gi".
    await fulfilOrder(rc, (await rc.store.getOrderByCode(code)) || order)
      .catch((err) => console.warn('[admin] khong mo duoc quyen', code, err?.message || err));
  }
  await rc.store.audit('order.mark_paid', code, { changed, by: 'admin' }, rc.ip);
  if (changed) {
    notifyAsync(rc, 'order.paid', `Xác nhận thủ công ${code} - ${order.customer_name}`, { code });
  }

  return json({ ok: true, changed, order: await rc.store.getOrderByCode(code) });
}

async function cancel(rc) {
  const code = String(rc.params.code || '').toUpperCase();
  const reason = rc.body?.reason ? String(rc.body.reason).slice(0, 200) : 'huỷ bởi admin';
  const { changed, order } = await rc.store.cancelOrder(code, reason);
  if (!order) return apiError(404, 'order_not_found', 'Không tìm thấy đơn');
  await rc.store.audit('order.cancel', code, { changed, reason }, rc.ip);
  return json({ ok: true, changed, order });
}

/**
 * POST /api/admin/resend-invites  Body: { limit }
 *
 * Gui lai thu moi vao lop cho nhung nguoi CHUA BAO GIO nhan duoc.
 *
 * Cung mot viec voi nut "Gui lai" trong trang Hoc vien, nhung o duong admin cua
 * funnel nen goi duoc bang X-Admin-Token - tuc la chay duoc tu script, khong
 * phai ngoi bam tung dot 25 nguoi trong trinh duyet.
 *
 * Dieu kien "chua vao duoc" gom ba ve, thieu ve nao cung sai: chua co lan gui
 * nao thanh cong, chua tung dat mat khau, chua tung dang nhap Google. Ai da vao
 * lop bang duong khac ma nhan them link dat mat khau se tuong co ke dang nghich
 * tai khoan minh.
 */
async function resendInvites(rc) {
  const tran = Math.min(Math.max(Number(rc.body?.limit) || 25, 1), 200);

  // Chua cau hinh email thi dung ngay - xem chu thich cung o
  // guiLaiThuMoiHangLoat trong worker/src/functions/index.js. Hai duong nay lam
  // cung mot viec nen phai tu choi giong nhau, khong thi bit mot cho ma cho kia
  // van im lang chay het danh sach.
  if (!rc.env.RESEND_API_KEY) {
    return apiError(503, 'email_chua_cau_hinh',
      'Chưa bật gửi email nên không gửi được thư mời nào. '
      + 'Cần nạp RESEND_API_KEY: npx wrangler secret put RESEND_API_KEY');
  }

  const rows = await rc.store.all(
    `SELECT u.id, u.email, u.full_name, u.legacy_lead_id
       FROM users u
      WHERE u.status = 'active' AND u.role = 'member' AND u.email IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM emails_sent e
                         WHERE e.to_addr = u.email AND e.template = 'invite_app'
                           AND e.status = 'sent')
        AND NOT EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM oauth_accounts o WHERE o.user_id = u.id)
      ORDER BY u.created_date`);

  let daGui = 0;
  let hong = 0;
  let dungVi = null;
  const chiTiet = [];

  for (const u of rows.slice(0, tran)) {
    const ket = await guiLaiThuMoi(rc, u);
    chiTiet.push({ email: u.email, ten: u.full_name, ok: !!ket.ok, ly_do: ket.reason || null });
    if (ket.ok) { daGui += 1; continue; }
    hong += 1;
    // Het han muc thi DUNG NGAY: gui tiep chi to ban ghi that bai chu khong
    // den duoc ai.
    if (/quota|rate|limit/i.test(String(ket.reason || ''))) { dungVi = 'het_han_muc'; break; }
  }

  await rc.store.audit('admin.resend_invites', String(daGui),
    { hong, con_lai: Math.max(0, rows.length - daGui) }, rc.ip);

  return json({
    ok: true,
    tong_thieu: rows.length,
    da_gui: daGui,
    hong,
    con_lai: Math.max(0, rows.length - daGui),
    dung_vi: dungVi,
    chi_tiet: chiTiet,
  });
}

async function listTxns(rc) {
  const limit = intParam(rc.url, 'limit', 100, 500);
  const items = await rc.store.all('SELECT * FROM bank_txns ORDER BY id DESC LIMIT ?', [limit]);

  // Dau chan cua lan goi gan nhat (xem ghiDauChan trong routes/webhook.js).
  // Bang giao dich trong co the co hai nghia rat khac nhau: nha cung cap chua
  // he goi toi, hay co goi ma sai khoa. Khong co dong nay thi khong phan biet
  // duoc, va nguoi ta di sua nham cho.
  let webhook = null;
  try {
    const raw = await rc.env.CACHE?.get('webhook:bank:lan-cuoi');
    if (raw) webhook = JSON.parse(raw);
  } catch { /* thieu dau chan khong phai loi */ }

  // Da tung co giao dich THAT tu nha cung cap chua? Dau chan trong KV la bo nho
  // tam - no het han, bi xoa, hoac chua kip ghi la trang bao "chua ai goi lan
  // nao", trong khi tien da chay qua webhook tu lau. Bang bank_txns moi la bang
  // chung. Cac dong 'saoke-' khong tinh: do la cong cu doi soat, khong phai
  // nha cung cap goi toi.
  const thatSu = await rc.store.get(
    "SELECT COUNT(*) AS n FROM bank_txns WHERE external_id NOT LIKE 'saoke-%'");
  const daTungNhan = Number(thatSu?.n || 0) > 0;

  return json({ ok: true, items, webhook, da_tung_nhan: daTungNhan });
}

// --- affiliate --------------------------------------------------------------
const affRow = (cfg, a) => ({
  id: a.id,
  code: a.code,
  full_name: a.full_name,
  phone: a.phone,
  email: a.email,
  status: a.status,
  commission_rate: Number(a.commission_rate),
  rate_text: `${Math.round(Number(a.commission_rate) * 100)}%`,
  clicks: int(a.clicks),
  referrals: int(a.referrals),
  pending_referrals: int(a.pending_referrals),
  level: int(a.unlocked_level) || 1,
  unlocked_at: a.unlocked_at,
  hidden_from_leaderboard: !!int(a.hide_from_leaderboard),
  paid_orders: int(a.paid_orders),
  revenue: int(a.revenue),
  revenue_text: cfg.formatPrice(int(a.revenue)),
  commission_total: int(a.commission_total),
  commission_total_text: cfg.formatPrice(int(a.commission_total)),
  commission_pending: int(a.commission_pending),
  commission_pending_text: cfg.formatPrice(int(a.commission_pending)),
  created_at: a.created_at,
});

async function listAffiliates(rc) {
  const { cfg, url, affiliates } = rc;
  const limit = intParam(url, 'limit', 100, 500);
  const offset = intParam(url, 'offset', 0);
  const search = (url.searchParams.get('q') || '').trim();

  const [rows, totalRow] = await Promise.all([
    affiliates.listAll({ limit, offset, search }),
    affiliates.countAll(),
  ]);
  const items = rows.map((a) => affRow(cfg, a));

  return json({
    ok: true,
    total: int(totalRow?.n),
    limit,
    offset,
    items,
    summary: {
      active: items.filter((a) => a.status === 'active').length,
      with_sales: items.filter((a) => a.paid_orders > 0).length,
      revenue: items.reduce((sum, a) => sum + a.revenue, 0),
      commission_pending: items.reduce((sum, a) => sum + a.commission_pending, 0),
    },
    default_rate: cfg.affiliate.rate,
  });
}

async function listCommissions(rc) {
  const status = rc.url.searchParams.get('status') || '';
  const rows = await rc.affiliates.listCommissions({
    status, limit: intParam(rc.url, 'limit', 200, 500),
  });
  return json({
    ok: true,
    items: rows.map((c) => ({
      id: c.id,
      order_code: c.order_code,
      affiliate_code: c.affiliate_code,
      affiliate_name: c.affiliate_name,
      affiliate_phone: c.affiliate_phone,
      order_amount: int(c.order_amount),
      rate_text: `${Math.round(Number(c.rate) * 100)}%`,
      amount: int(c.amount),
      amount_text: rc.cfg.formatPrice(int(c.amount)),
      status: c.status,
      created_at: c.created_at,
      paid_at: c.paid_at,
    })),
  });
}

async function payCommission(rc) {
  const id = Number(rc.params.id);
  const { changed, commission } = await rc.affiliates.setCommissionStatus(id, 'paid',
    rc.body?.note ? String(rc.body.note).slice(0, 200) : 'đã chuyển hoa hồng');
  if (!commission) return apiError(404, 'commission_not_found', 'Không tìm thấy hoa hồng');
  await rc.store.audit('commission.paid', String(id), { changed }, rc.ip);
  return json({ ok: true, changed, commission });
}

/**
 * POST /api/admin/commissions/:id/void
 * Huy mot khoan hoa hong nghi gian lan. Truoc day khong co duong nao lam viec
 * nay: mot khoan da sinh ra la nam mai trong hang doi cho tra, trong y het cac
 * khoan that.
 */
async function voidCommission(rc) {
  const id = Number(rc.params.id);
  const existing = await rc.store.get('SELECT status FROM commissions WHERE id = ?', [id]);
  if (!existing) return apiError(404, 'commission_not_found', 'Không tìm thấy hoa hồng');
  if (existing.status === 'paid') {
    return apiError(409, 'already_paid',
      'Hoa hồng này đã chuyển tiền rồi, không huỷ được. Cần xử lý ngoài hệ thống.');
  }
  const reason = rc.body?.reason ? String(rc.body.reason).slice(0, 200) : 'huỷ bởi admin';
  const { changed, commission } = await rc.affiliates.setCommissionStatus(id, 'void', reason);
  await rc.store.audit('commission.void', String(id), { changed, reason }, rc.ip);
  return json({ ok: true, changed, commission });
}

async function updateAffiliate(rc) {
  const code = String(rc.params.code || '').toUpperCase();
  const body = rc.body || {};
  let result = null;

  if (body.status && ['active', 'blocked'].includes(body.status)) {
    result = await rc.affiliates.setStatus(code, body.status);
  }
  if (body.rate !== undefined) {
    const rate = Math.max(0, Math.min(100, Number(body.rate))) / 100;
    result = await rc.affiliates.setRate(code, rate);
  }
  if (!result) return apiError(400, 'nothing_to_update', 'Cần truyền status hoặc rate');
  if (!result.affiliate) return apiError(404, 'affiliate_not_found', 'Không tìm thấy cộng tác viên');

  await rc.store.audit('affiliate.update', code, body, rc.ip);
  return json({ ok: true, affiliate: affRow(rc.cfg, result.affiliate) });
}

/**
 * POST /api/admin/purge-test-data
 * Xoa du lieu do bo test tu dong tao ra (email @smoketest.local). Chi dung dung
 * nhung ban ghi cua bo test, khong dong toi du lieu khach that.
 */
async function purgeTestData(rc) {
  const { store } = rc;
  const MARK = '%@smoketest.local';
  const leadFilter = 'SELECT id FROM leads WHERE email LIKE ?';
  const affFilter = `SELECT id FROM affiliates WHERE lead_id IN (${leadFilter})`;

  const before = await store.get('SELECT COUNT(*) AS n FROM leads WHERE email LIKE ?', [MARK]);

  await store.run(
    `DELETE FROM commissions WHERE lead_id IN (${leadFilter}) OR affiliate_id IN (${affFilter})`,
    [MARK, MARK]);
  await store.run(`DELETE FROM referral_clicks WHERE affiliate_id IN (${affFilter})`, [MARK]);
  await store.run(`DELETE FROM bank_txns WHERE matched_order IN
    (SELECT code FROM orders WHERE lead_id IN (${leadFilter}))`, [MARK]);
  await store.run(`DELETE FROM orders WHERE lead_id IN (${leadFilter})`, [MARK]);
  await store.run(`DELETE FROM affiliates WHERE lead_id IN (${leadFilter})`, [MARK]);
  await store.run(`DELETE FROM events WHERE lead_id IN (${leadFilter})`, [MARK]);
  const removed = await store.run('DELETE FROM leads WHERE email LIKE ?', [MARK]);

  // Xoa luon bo dem gioi han so lan goi. Bo dem nay gio nam trong D1 (dung
  // chung ca he thong) nen neu khong xoa thi chay bo test lan hai se bi chan.
  await store.run('DELETE FROM rate_limits');

  rc.affiliates.clearLeaderboardCache();
  await store.audit('admin.purge_test_data', null, { leads: int(before?.n) }, rc.ip);
  return json({ ok: true, removed_leads: removed.changes, found: int(before?.n) });
}

/**
 * POST /api/admin/leads/:id/forget
 * "Quyen duoc quen": xoa thong tin ca nhan cua mot nguoi theo yeu cau, nhung
 * GIU LAI ban ghi (id, don hang, hoa hong) de so lieu doanh thu khong sai lech.
 */
async function forgetLead(rc) {
  const id = Number(rc.params.id);
  const lead = await rc.store.get('SELECT id FROM leads WHERE id = ?', [id]);
  if (!lead) return apiError(404, 'lead_not_found', 'Không tìm thấy lead');

  const anonName = 'Đã xoá theo yêu cầu';
  const anonEmail = `da-xoa-${id}@redacted.local`;
  const anonPhone = `DAXOA${id}`;

  await rc.store.batch([
    rc.store.prepare(
      `UPDATE leads SET full_name = ?, email = ?, phone = ?, phone_e164 = ?, ip = NULL,
       user_agent = NULL, answers_json = '{}', note = NULL WHERE id = ?`,
      [anonName, anonEmail, anonPhone, anonPhone, id]),
    rc.store.prepare(
      'UPDATE orders SET customer_name = ?, customer_phone = ?, customer_email = ? WHERE lead_id = ?',
      [anonName, anonPhone, anonEmail, id]),
    rc.store.prepare(
      `UPDATE affiliates SET full_name = ?, phone = ?, email = ?, hide_from_leaderboard = 1
       WHERE lead_id = ?`,
      [anonName, anonPhone, anonEmail, id]),
  ]);

  rc.affiliates.clearLeaderboardCache();
  await rc.store.audit('admin.forget_lead', String(id), null, rc.ip);
  return json({ ok: true, id });
}

async function setReferral(rc) {
  const leadId = Number(rc.params.id);
  const valid = rc.params.action === 'valid';
  // Cong nhan MUON van phai ra tien: hoa hong duoc sinh o luc don chuyen sang
  // da thanh toan, ma luc do luot nay con dang bi giu. setReferralValid tu bu
  // (xem buHoaHong trong affiliates.js) - o day khong lam lai nua.
  const { changed, lead, level, hoaHongBu = 0 } = await rc.affiliates.setReferralValid(
    leadId, valid, rc.body?.reason ? String(rc.body.reason).slice(0, 200) : null);

  if (!changed) return apiError(404, 'referral_not_found', 'Lead này không có người giới thiệu');

  await rc.store.audit(valid ? 'referral.restore' : 'referral.void', String(leadId),
    { level, hoa_hong_bu: hoaHongBu }, rc.ip);
  return json({ ok: true, lead, level, hoa_hong_bu: hoaHongBu });
}

// --- ma gioi thieu la -------------------------------------------------------
/**
 * Nhung nguoi da dang ky qua mot ma la va hien khong duoc tinh cho ai.
 *
 * Tim theo `sessions.landing_url` chu khong theo cookie: cookie ref chi duoc dat
 * khi ma HOP LE, nen voi ma la no khong ton tai. Nhung dia chi trang dap vao
 * thi luon duoc luu, va no con nguyen ?ref=MA - do la manh giay duy nhat con lai.
 *
 * Hai mau LIKE de "ABC" khong nuot mat nguoi cua "ABCDEF": ma hoac nam o cuoi
 * dia chi, hoac dung ngay truoc mot dau &.
 */
const LOC_MA_LA = `FROM leads l JOIN sessions s ON s.id = l.session_id
   WHERE l.referred_by IS NULL
     AND (l.session_id IN (SELECT session_id FROM ref_ma_la_phien WHERE ma = ?)
          OR s.landing_url LIKE ? OR s.landing_url LIKE ?
          OR s.referrer LIKE ? OR s.referrer LIKE ?)`;

/**
 * Phai tim CA `referrer`, khong chi `landing_url`.
 *
 * Nguoi mo link ?ref=MA roi bam tiep sang mot trang khac truoc khi dien form thi
 * dong `sessions` cua ho co landing_url la trang THU HAI (khong con ?ref=), con
 * dia chi mang ma nam o `referrer`. Doi chieu that: mot cong tac vien mat 4 luot
 * ma tim theo landing_url chi ra 0 - ho khong he lot khoi luoi, chi la luoi
 * quang sai cho.
 */
const mauMaLa = (ma) => [ma, `%ref=${ma}`, `%ref=${ma}&%`, `%ref=${ma}`, `%ref=${ma}&%`];

const leadsCuaMaLa = (store, ma) =>
  store.all(`SELECT l.* ${LOC_MA_LA} ORDER BY l.id`, mauMaLa(ma));

const demLeadsCuaMaLa = async (store, ma) =>
  Number((await store.get(`SELECT COUNT(*) AS n ${LOC_MA_LA}`, mauMaLa(ma)))?.n) || 0;

/** GET /api/admin/ref-ma-la - cac ma khong ton tai ma van co nguoi bam vao. */
async function listMaLa(rc) {
  const rows = await rc.store.all(
    `SELECT ma, so_lan, landing_url, gan_cho, gan_luc, lan_dau, lan_cuoi
       FROM ref_ma_la ORDER BY lan_cuoi DESC LIMIT ?`,
    [intParam(rc.url, 'limit', 50, 200)]);

  const items = [];
  for (const r of rows) {
    items.push({ ...r, so_nguoi_mat: await demLeadsCuaMaLa(rc.store, r.ma) });
  }
  return json({ ok: true, items });
}

/**
 * POST /api/admin/ref-ma-la/:ma/gan  Body: { code }
 * Gan tat ca nguoi da dang ky qua mot ma la ve cho mot cong tac vien co that.
 *
 * CHI GAN NGUOI CHUA CO AI: ghi de nguoi gioi thieu cu la cuop hoa hong cua ho,
 * va khong ai phat hien ra vi cot cu bi thay the im lang. `leadsCuaMaLa` da loc
 * `referred_by IS NULL`, va creditReferral tu chan tu-gioi-thieu.
 */
async function ganMaLa(rc) {
  const ma = String(rc.params.ma || '').toUpperCase();
  const code = String(rc.body?.code || '').trim().toUpperCase();
  if (!code) return apiError(422, 'thieu_ma', 'Chọn cộng tác viên nhận các lượt này.');

  const nguoiGioiThieu = await rc.affiliates.getByCode(code);
  if (!nguoiGioiThieu || nguoiGioiThieu.status !== 'active') {
    return apiError(404, 'affiliate_not_found', 'Không tìm thấy cộng tác viên đang hoạt động với mã này.');
  }

  const leads = await leadsCuaMaLa(rc.store, ma);
  // Canh bao khi nguoi duoc chon CHINH LA mot trong nhung nguoi den tu ma nay:
  // gan nhu chac chan la chon nham chu thuc su cua ma. Da xay ra that voi ma
  // IHMMIP56 - nguoi duoc gan lai la nguoi buoc vao tu chinh ma do, nen ho nhan
  // het luot cua nguoi khac con minh thi mai khong co nguoi gioi thieu.
  const laKhachCuaMaNay = leads.some((l) => l.id === nguoiGioiThieu.lead_id);
  let daGan = 0;
  let hoaHongBu = 0;
  const boQua = [];
  for (const lead of leads) {
    // Di qua dung duong ghi nhan thuong ngay: no cap nhat bac, xoa cache bang
    // xep hang, chan tu-gioi-thieu, va bu hoa hong cho don da thanh toan tu
    // truoc. Viet UPDATE tay o day la bo mat ca bon.
    const kq = await rc.affiliates.creditReferral(lead, nguoiGioiThieu, { ip: lead.ip });
    if (kq.credited) { daGan += 1; hoaHongBu += kq.hoaHongBu || 0; } else boQua.push({ lead_id: lead.id, ly_do: kq.reason });
  }

  await rc.store.run(
    'UPDATE ref_ma_la SET gan_cho = ?, gan_luc = ? WHERE ma = ?',
    [code, rc.store.now(), ma]);
  await rc.store.audit('ref.ma_la.gan', ma, { code, da_gan: daGan, hoa_hong_bu: hoaHongBu }, rc.ip);

  return json({
    ok: true,
    da_gan: daGan,
    bo_qua: boQua,
    hoa_hong_bu: hoaHongBu,
    canh_bao: laKhachCuaMaNay
      ? `${nguoiGioiThieu.full_name} cũng đăng ký qua chính mã ${ma} - kiểm lại xem có chọn nhầm người không.`
      : null,
  });
}

/**
 * POST /api/admin/trao-thuong-bu
 *
 * Trao cho NHUNG NGUOI DA DU DIEU KIEN TU TRUOC. Tu gio tro di viec nay tu dong
 * (xem refreshLevel), nhung 28 nguoi da moi du 2 ban truoc khi co co che nay thi
 * khong co gi danh thuc ho day - va ho la nhung nguoi da lam viec that roi.
 *
 * Chay lai bao nhieu lan cung duoc: da trao roi thi bo qua.
 */
async function traoThuongBu(rc) {
  const ds = await rc.store.all(`
    SELECT a.*, (SELECT COUNT(*) FROM leads l
                  WHERE l.referred_by = a.id AND l.referral_valid = 1) AS so_luot
      FROM affiliates a WHERE a.status = 'active'`);

  let soNguoi = 0;
  let soQua = 0;
  let soVeVip = 0;
  for (const a of ds) {
    if (!Number(a.so_luot)) continue;
    /* eslint-disable no-await-in-loop */
    const kq = await traoThuongTheoLuot({ store: rc.store, cfg: rc.cfg }, a, Number(a.so_luot))
      .catch(() => null);
    /* eslint-enable no-await-in-loop */
    if (!kq) continue;
    if (kq.qua.length || kq.ve_vip) soNguoi += 1;
    soQua += kq.qua.length;
    if (kq.ve_vip) soVeVip += 1;
  }

  await rc.store.audit('thuong.trao_bu', String(ds.length),
    { so_nguoi: soNguoi, so_qua: soQua, so_ve_vip: soVeVip }, rc.ip);
  return json({ ok: true, da_xet: ds.length, so_nguoi: soNguoi, so_qua: soQua, so_ve_vip: soVeVip });
}

/** GET /api/admin/leaderboard - bang xep hang day du de trao giai. */
async function adminLeaderboard(rc) {
  const limit = intParam(rc.url, 'limit', 50, 200);
  const items = await rc.affiliates.leaderboard(limit);
  return json({ ok: true, contest: rc.rewards.contestInfo(), tiers: rc.rewards.TIERS, items });
}

/** GET /api/admin/referrals/pending - cac luot dang cho duyet (nghi gian lan). */
async function pendingReferrals(rc) {
  const items = await rc.store.all(`
    SELECT l.id, l.full_name, l.phone, l.email, l.created_at, l.ip, l.referral_void_reason,
           a.code AS affiliate_code, a.full_name AS affiliate_name
    FROM leads l JOIN affiliates a ON a.id = l.referred_by
    WHERE l.referral_valid = 0
    ORDER BY l.id DESC LIMIT ?`, [intParam(rc.url, 'limit', 100, 500)]);
  return json({ ok: true, items });
}

// --- xuat file --------------------------------------------------------------
const csvCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BOM o dau de Excel tren Windows doc dung tieng Viet.
const csvRows = (rows) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const download = (body, filename, type) => new Response(body, {
  status: 200,
  headers: {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename}"`,
    ...SECURITY_HEADERS,
    ...PRIVATE_HEADERS,
  },
});

async function exportLeads(rc) {
  const rows = await rc.store.all('SELECT * FROM leads ORDER BY id');
  const header = ['id', 'created_at', 'full_name', 'email', 'phone', 'score', 'segment', 'status',
    'utm_source', 'utm_campaign', ...QUESTIONS.map((q) => `${q.key}. ${q.label}`)];
  const body = rows.map((row) => {
    const flat = flattenAnswers(safeAnswers(row.answers_json));
    return [row.id, row.created_at, row.full_name, row.email, row.phone, row.score, row.segment,
      row.status, row.utm_source, row.utm_campaign, ...QUESTIONS.map((q) => flat[q.key])];
  });
  return download(csvRows([header, ...body]), 'leads.csv', 'text/csv; charset=utf-8');
}

async function exportOrders(rc) {
  const rows = await rc.store.all('SELECT * FROM orders ORDER BY id');
  const header = ['code', 'created_at', 'status', 'amount', 'paid_amount', 'paid_at',
    'customer_name', 'customer_phone', 'customer_email', 'transfer_content', 'payment_ref'];
  const body = rows.map((r) => header.map((k) => r[k]));
  return download(csvRows([header, ...body]), 'orders.csv', 'text/csv; charset=utf-8');
}

/**
 * GET /api/admin/export/members.csv
 *
 * Danh sach hoc vien cua NEN TANG (bang users), khac han leads.csv la nguoi
 * dien form o trang ban hang. Truoc day khong co duong nao lay du lieu nay ra
 * ngoai: muon diem danh tay, chia nhom, hay gui thu cho ca lop deu phai mo
 * database.
 *
 * Co ca cot "da dang nhap chua" - do la con so noi ro nhat ai dang bi ket ngoai
 * cua, thu ma nhin trong trang quan tri khong thay duoc.
 */
async function exportMembers(rc) {
  const rows = await rc.store.all(`
    SELECT u.id, u.full_name, u.email, u.phone_e164, u.role, u.status,
           t.name AS team_name, u.total_xp, u.total_coin, u.current_streak,
           u.longest_streak, u.created_date,
           (SELECT COUNT(*) FROM credentials c WHERE c.user_id = u.id) AS co_mat_khau,
           (SELECT COUNT(*) FROM oauth_accounts o WHERE o.user_id = u.id) AS co_google
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
     ORDER BY u.created_date`);

  const header = ['ho_ten', 'email', 'dien_thoai', 'vai_tro', 'trang_thai', 'nhom',
    'xp', 'xu', 'chuoi_ngay', 'chuoi_dai_nhat', 'da_dang_nhap', 'ngay_tham_gia'];
  const body = rows.map((u) => [
    u.full_name, u.email, u.phone_e164, u.role, u.status, u.team_name || '',
    u.total_xp, u.total_coin, u.current_streak, u.longest_streak,
    (Number(u.co_mat_khau) || Number(u.co_google)) ? 'roi' : 'chua',
    u.created_date,
  ]);
  return download(csvRows([header, ...body]), 'members.csv', 'text/csv; charset=utf-8');
}

async function exportAffiliates(rc) {
  const rows = await rc.affiliates.listAll({ limit: 5000 });
  const header = ['code', 'full_name', 'phone', 'email', 'status', 'level', 'unlocked_at', 'rate',
    'clicks', 'referrals', 'pending_referrals', 'paid_orders', 'revenue', 'commission_total',
    'commission_pending', 'created_at'];
  const body = rows.map((a) => [a.code, a.full_name, a.phone, a.email, a.status,
    int(a.unlocked_level) || 1, a.unlocked_at || '', `${Math.round(Number(a.commission_rate) * 100)}%`,
    int(a.clicks), int(a.referrals), int(a.pending_referrals), int(a.paid_orders),
    int(a.revenue), int(a.commission_total), int(a.commission_pending), a.created_at]);
  return download(csvRows([header, ...body]), 'affiliates.csv', 'text/csv; charset=utf-8');
}

/**
 * GET /api/admin/export/backup.json
 * Ban sao ngoai he thong. D1 co Time Travel (khoi phuc 30 ngay) nen day chi la
 * lop du phong them, dung khi can mot ban de tay hoac chuyen sang ha tang khac.
 */
async function exportBackup(rc) {
  const { store } = rc;
  const [leads, orders, affiliateRows, commissions, bankTxns, referralClicks] = await Promise.all([
    store.all('SELECT * FROM leads ORDER BY id'),
    store.all('SELECT * FROM orders ORDER BY id'),
    store.all('SELECT * FROM affiliates ORDER BY id'),
    store.all('SELECT * FROM commissions ORDER BY id'),
    store.all('SELECT * FROM bank_txns ORDER BY id'),
    store.all('SELECT * FROM referral_clicks ORDER BY id'),
  ]);
  await store.audit('admin.export_backup', null,
    { leads: leads.length, orders: orders.length }, rc.ip);

  const payload = {
    exported_at: new Date().toISOString(),
    storage: 'd1',
    leads,
    orders,
    affiliates: affiliateRows,
    commissions,
    bank_txns: bankTxns,
    referral_clicks: referralClicks,
  };
  return download(JSON.stringify(payload),
    `backup-${payload.exported_at.slice(0, 10)}.json`, 'application/json; charset=utf-8');
}

// --- router con -------------------------------------------------------------
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/admin/login', handler: login },
  { method: 'POST', path: '/api/admin/logout', handler: logout },
  { method: 'GET', path: '/api/admin/me', handler: me },
];

const ROUTES = [
  { method: 'GET', pattern: /^\/api\/admin\/stats$/, handler: stats },
  { method: 'GET', pattern: /^\/api\/admin\/affiliates$/, handler: listAffiliates },
  { method: 'GET', pattern: /^\/api\/admin\/commissions$/, handler: listCommissions },
  { method: 'GET', pattern: /^\/api\/admin\/leaderboard$/, handler: adminLeaderboard },
  { method: 'GET', pattern: /^\/api\/admin\/referrals\/pending$/, handler: pendingReferrals },
  { method: 'GET', pattern: /^\/api\/admin\/ref-ma-la$/, handler: listMaLa },
  { method: 'POST', pattern: /^\/api\/admin\/trao-thuong-bu$/, handler: traoThuongBu },
  { method: 'POST', pattern: /^\/api\/admin\/ref-ma-la\/([A-Z0-9]+)\/gan$/i, handler: ganMaLa, params: ['ma'] },
  { method: 'POST', pattern: /^\/api\/admin\/referrals\/(\d+)\/(void|valid)$/, handler: setReferral, params: ['id', 'action'] },
  { method: 'GET', pattern: /^\/api\/admin\/export\/affiliates\.csv$/, handler: exportAffiliates },
  { method: 'POST', pattern: /^\/api\/admin\/commissions\/(\d+)\/paid$/, handler: payCommission, params: ['id'] },
  { method: 'POST', pattern: /^\/api\/admin\/commissions\/(\d+)\/void$/, handler: voidCommission, params: ['id'] },
  { method: 'POST', pattern: /^\/api\/admin\/affiliates\/([A-Z0-9]+)$/i, handler: updateAffiliate, params: ['code'] },
  { method: 'POST', pattern: /^\/api\/admin\/purge-test-data$/, handler: purgeTestData },
  { method: 'POST', pattern: /^\/api\/admin\/resend-invites$/, handler: resendInvites },
  { method: 'GET', pattern: /^\/api\/admin\/leads$/, handler: listLeads },
  { method: 'GET', pattern: /^\/api\/admin\/orders$/, handler: listOrders },
  { method: 'GET', pattern: /^\/api\/admin\/bank-txns$/, handler: listTxns },
  { method: 'GET', pattern: /^\/api\/admin\/export\/leads\.csv$/, handler: exportLeads },
  { method: 'GET', pattern: /^\/api\/admin\/export\/orders\.csv$/, handler: exportOrders },
  { method: 'GET', pattern: /^\/api\/admin\/export\/members\.csv$/, handler: exportMembers },
  { method: 'GET', pattern: /^\/api\/admin\/export\/backup\.json$/, handler: exportBackup },
  { method: 'POST', pattern: /^\/api\/admin\/orders\/([A-Z0-9]+)\/paid$/i, handler: markPaid, params: ['code'] },
  { method: 'POST', pattern: /^\/api\/admin\/orders\/([A-Z0-9]+)\/cancel$/i, handler: cancel, params: ['code'] },
  { method: 'POST', pattern: /^\/api\/admin\/leads\/(\d+)\/forget$/, handler: forgetLead, params: ['id'] },
  { method: 'GET',  pattern: /^\/api\/admin\/kit\/status$/, handler: kitStatus },
  { method: 'GET',  pattern: /^\/api\/admin\/kit\/lists$/, handler: kitLists },
  { method: 'POST', pattern: /^\/api\/admin\/kit\/test$/, handler: kitTest },
  { method: 'POST', pattern: /^\/api\/admin\/kit\/backfill$/, handler: kitBackfill },
];

/** @returns Response neu request nay thuoc ve admin, null neu khong phai. */
export async function handleAdmin(rc) {
  const method = rc.request.method;
  const path = rc.url.pathname;

  for (const route of PUBLIC_ROUTES) {
    if (route.method === method && route.path === path) return route.handler(rc);
  }

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(path);
    if (!m) continue;
    // Kiem tra quyen o DUNG MOT CHO nay cho moi endpoint quan tri.
    const denied = await requireAdmin(rc);
    if (denied) return denied;
    rc.params = {};
    (route.params || []).forEach((name, i) => { rc.params[name] = m[i + 1]; });
    return route.handler(rc);
  }

  return null;
}
