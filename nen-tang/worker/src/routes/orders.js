import { json, apiError } from '../lib/respond.js';
import { thieuCauHinhTien } from '../config.js';
import { rateLimit } from '../lib/http.js';
import { transferInfo } from '../lib/vietqr.js';
import { bankSafe, validatePhone } from '../lib/validate.js';
import { notifyAsync } from '../lib/notify.js';
import { loadUser } from '../auth/guard.js';

// Bo ky tu de nham khi go tay: khong co 0/O, 1/I.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

async function newOrderCode(store, tienTo) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    let code = tienTo;
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
    if (!(await store.getOrderByCode(code))) return code;
  }
  throw new Error('khong sinh duoc ma don');
}

export function orderPayload(cfg, order) {
  const transfer = transferInfo(cfg, { amount: order.amount, content: order.transfer_content });
  return {
    code: order.code,
    status: order.status,
    product: order.product_name,
    amount: order.amount,
    amount_text: cfg.formatPrice(order.amount),
    list_price: cfg.product.listPrice,
    list_price_text: cfg.formatPrice(cfg.product.listPrice),
    currency: order.currency,
    // KHONG tra ten/sdt/email khach o day: endpoint nay cong khai (trang thanh
    // toan poll bang ma don), lo ra la ro ri thong tin ca nhan.
    transfer,
    transfer_content_display: order.transfer_content,
    zalo_url: cfg.zalo.supportUrl,
    zalo_phone: cfg.zalo.supportPhone,
    paid_at: order.paid_at,
    created_at: order.created_at,
  };
}

/**
 * `lead_id` la so tu tang, va truoc day route nay nhan thang no tu trinh duyet
 * roi lay ban ghi ra dung. Nghia la bat ky ai cung goi duoc voi lead_id = 1, 2,
 * 3... de tao don MANG TEN NGUOI KHAC - va noi dung chuyen khoan tra ve trong
 * phan hoi co dang "VIP<ma> <ho ten that>", nen do id la ra ten hoc vien. Kem
 * theo la mot dong don "cho thanh toan" rac trong trang Doanh thu cua chi Thanh.
 *
 * Gio chi nhan lead_id khi nguoi goi that su la chu no: cung phien trinh duyet,
 * hoac dang dang nhap bang chinh tai khoan da noi voi lead do.
 */
async function laChuLead(rc, lead) {
  if (rc.sid && lead.session_id === rc.sid) return true;
  const user = await loadUser(rc).catch(() => null);
  if (!user) return false;
  if (Number(user.legacy_lead_id) === Number(lead.id)) return true;
  return !!user.email && !!lead.email
    && String(user.email).toLowerCase() === String(lead.email).toLowerCase();
}

/**
 * POST /api/orders
 * Body: { lead_id?, full_name?, phone?, email? }
 * Neu phien da co lead (tu buoc form) thi tu lay thong tin, khong bat nhap lai.
 */
export async function createOrder(rc) {
  const { cfg, store } = rc;

  const limit = await rateLimit(rc, `order:${rc.ip}`, cfg.limits.orderPerHour, 60 * 60 * 1000);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Bạn thao tác quá nhanh, thử lại sau ít phút.',
      { retry_after: limit.retryAfter });
  }

  // Chua khai tai khoan nhan tien thi DUNG LAI o day. Ban cu co gia tri mac
  // dinh la tai khoan cua mot khach cu, nen quen cau hinh khong he gay loi -
  // no chi lang le in ma QR tra tien cho nguoi khac. Tha khong ban duoc con
  // hon ban ho nguoi ta.
  const thieu = thieuCauHinhTien(cfg);
  if (thieu.length) {
    console.error(`[orders] tu choi tao don: thieu cau hinh ${thieu.join(', ')}`);
    return apiError(503, 'chua_cau_hinh_thanh_toan',
      'Cổng thanh toán chưa được cấu hình xong. Bạn nhắn giúp admin qua Zalo nhé.');
  }

  const body = rc.body || {};
  let lead = null;
  if (Number.isInteger(body.lead_id)) {
    const xin = await store.getLeadById(body.lead_id);
    if (xin && await laChuLead(rc, xin)) lead = xin;
  }
  if (!lead && rc.sid) lead = await store.getLeadBySession(rc.sid);
  if (!lead && body.phone) {
    const parsed = validatePhone(body.phone, body.country_code || '+84');
    if (parsed.value) lead = await store.getLeadByPhone(parsed.value.e164);
  }

  if (!lead) {
    return apiError(409, 'lead_required',
      'Chưa tìm thấy thông tin đăng ký. Vui lòng điền form đăng ký trước khi đặt vé VIP.',
      { next: '/dang-ky' });
  }

  // San pham: mac dinh la ve chinh cua chuong trinh; gian hang trong khu vuc
  // thanh vien gui them `product_sku` de ban thu khac.
  //
  // KHONG CO GIA TRI MAC DINH cho gia. SKU la khac cai mac dinh thi PHAI co
  // trong bang `products` va dang bat; khong tim thay thi tu choi, tuyet doi
  // khong roi ve gia cua ve chinh. Ban nham gia la mot loai loi khong ai phat
  // hien duoc cho den khi doi soat cuoi thang.
  let sp = {
    sku: cfg.product.sku,
    name: cfg.product.name,
    price: cfg.product.price,
    currency: cfg.product.currency,
  };
  const skuXin = String(body.product_sku || '').trim();
  if (skuXin && skuXin !== cfg.product.sku) {
    const row = await store.get(
      'SELECT sku, name, price, currency, is_active FROM products WHERE sku = ?', [skuXin]);
    if (!row || !Number(row.is_active)) {
      return apiError(404, 'san_pham_khong_ban', 'Sản phẩm này hiện không bán.');
    }
    if (!Number.isFinite(Number(row.price)) || Number(row.price) <= 0) {
      console.error(`[orders] san pham ${skuXin} chua dat gia - tu choi tao don`);
      return apiError(503, 'chua_cau_hinh_thanh_toan', 'Sản phẩm này chưa đặt giá.');
    }
    sp = {
      sku: row.sku, name: row.name, price: Number(row.price), currency: row.currency || 'VND',
    };
  }

  // Da co don dang cho CHO CHINH SAN PHAM DO, VA DUNG GIA HIEN TAI -> tra lai
  // don cu, khong tao trung.
  //
  // Loc theo sku: truoc day chi loc theo lead, nen ai dang cho tra tien mot mon
  // se nhan lai dung don cu khi bam mua mon khac - va tra tien cho nham thu.
  //
  // Loc them theo GIA: chi Thanh ha gia mot san pham tu 1.000.000d xuong
  // 999.000d, nhung nguoi dang co don cho van nhan lai don cu - ma QR va so
  // tien trong don cu da dong bang tu luc tao. Ho nhin thay 999.000d tren the
  // san pham roi quet ma QR ghi 1.000.000d. Gia lech thi phai la don MOI; don
  // cu de nguyen do, vi neu ai da chuyen tien theo no thi webhook van khop.
  const pending = await store.getPendingOrderByLead(lead.id);
  if (pending && pending.product_sku === sp.sku && Number(pending.amount) === sp.price) {
    return json({ ok: true, reused: true, order: orderPayload(cfg, pending) });
  }

  const code = await newOrderCode(store, cfg.product.orderPrefix);
  // Ma don da co tien to VIP, them ten de doi soat thu cong cho de.
  //
  // TIEN TO NGAN HANG di TRUOC ma don: VietinBank chi bao giao dich sang SePay
  // khi noi dung bat dau bang SEVQR (xem cfg.bank.memoPrefix). Ma don van nam
  // trong noi dung nen webhook doc duoc nhu cu - extractCode tim "VIP" + 6 ky
  // tu o BAT KY dau trong chuoi, khong doi no dung o dau.
  const tienTo = cfg.bank.memoPrefix ? `${cfg.bank.memoPrefix} ` : '';
  const content = bankSafe(`${tienTo}${code} ${lead.full_name}`, 50);

  const order = await store.insertOrder({
    code,
    lead_id: lead.id,
    session_id: rc.sid,
    product_sku: sp.sku,
    product_name: sp.name,
    amount: sp.price,
    currency: sp.currency,
    transfer_content: content,
    customer_name: lead.full_name,
    customer_phone: lead.phone,
    customer_email: lead.email,
  });

  await store.insertEvent({
    session_id: rc.sid,
    lead_id: lead.id,
    type: 'checkout_view',
    page: 'checkout',
    meta: { code, amount: order.amount },
    ip: rc.ip,
  });

  notifyAsync(rc, 'order.created', `Đơn VIP mới ${code} - ${lead.full_name} (${lead.phone})`, {
    code, amount: order.amount, lead_id: lead.id, segment: lead.segment, score: lead.score,
  });

  return json({ ok: true, reused: false, order: orderPayload(cfg, order) }, 201);
}

/** GET /api/orders/:code - trang thanh toan poll de biet da xac nhan chua. */
export async function getOrder(rc) {
  // Chan do ma don: 60 luot tra cuu / phut / IP
  const limit = await rateLimit(rc, `order-get:${rc.ip}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Bạn tra cứu quá nhanh, thử lại sau ít phút.');
  }
  const code = String(rc.params.code || '').toUpperCase();
  const order = await rc.store.getOrderByCode(code);
  if (!order) return apiError(404, 'order_not_found', 'Không tìm thấy đơn hàng');
  return json({ ok: true, order: orderPayload(rc.cfg, order) });
}
