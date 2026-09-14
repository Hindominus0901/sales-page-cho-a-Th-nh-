/**
 * Lop tuong thich cho trang ban hang cu cua Goc Creator.
 *
 * Trang ban hang cua anh Thanh da hoan thien va da qua kiem thu: loi van chot
 * xong, 18 o video, bang gia, FAQ. Viet lai no theo ban thiet ke .dc.html cua
 * template la vut di mot thu dang chay tot. Nen thay vi sua trang, dung hai
 * duong dan cu ngay trong Worker:
 *
 *   POST /api/register     -> tao lead + don, tra ve DUNG hinh dang cu
 *   GET  /api/order/:ma    -> tra cuu don, tra ve DUNG hinh dang cu
 *
 * Nho vay `build/partials/dang-ky.js` va `thanh-toan.js` KHONG phai sua mot
 * chu nao - it rui ro hon han viec dich tay hai file JS sang hop dong API moi.
 *
 * Hai ham nay KHONG tu lam lay viec. Chung goi thang createLead/createOrder
 * cua nen tang roi dich lai phan hoi: moi lop bao ve (chan toc do, kiem cau
 * hinh tai khoan nhan tien, chong tao don trung, sinh ma don) deu chay nguyen
 * ven, khong co ban sao nao de lech nhau ve sau.
 */
import { createOrder, getOrder } from './orders.js';
import { createLead } from './leads.js';
import { json } from '../lib/respond.js';
import { validatePhone } from '../lib/validate.js';
import { rateLimit } from '../lib/http.js';
import { randomToken, sha256Hex } from '../lib/crypto.js';

/** Doc than mot Response JSON do route khac tra ve. */
async function docJson(res) {
  try { return await res.clone().json(); } catch { return {}; }
}

/**
 * Doi hinh dang `transfer` cua nen tang (snake_case) sang hinh dang `payment`
 * ma trang cu doc (camelCase). Lech mot ten khoa la trang thanh toan hien o
 * trong, khong bao loi gi.
 */
function doiSangPaymentCu(transfer) {
  if (!transfer) return null;
  return {
    bankName: transfer.bank_name,
    bankCode: transfer.bank_bin,
    accountNo: transfer.account_number,
    accountName: transfer.account_name,
    amount: transfer.amount,
    description: transfer.content,
    qrUrl: transfer.qr_url,
  };
}

/**
 * POST /api/register — hop dong cu: mot lan goi vua tao lead vua tao don.
 *
 * Form cu chi hoi ten/sdt/email/nganh nghe/ghi chu, KHONG co bo 8 cau hoi cua
 * template. Hai o tu do do duoc cat vao answers_json de trang quan tri van doc
 * duoc, chu khong nhet bua vao bo cau hoi - nhet bua thi diem lead sai, ma
 * diem sai thi con te hon khong co diem.
 */
export async function dangKyTuongThich(rc) {
  const body = rc.body || {};

  // Bay mat ong: truong an, nguoi that khong bao gio dien. Tra loi mo ho y
  // nhu ban cu, khong noi cho bot biet no bi bat o dau.
  if (String(body.website || '').trim()) {
    return json({ ok: false, error: 'Không gửi được, anh chị thử lại giúp em.' }, 400);
  }

  // Form cu chi hoi ten/sdt/email/nganh nghe/ghi chu - khong co bo 8 cau hoi.
  // Hai o tu do duoc cat vao `answers` dang van ban de trang quan tri van doc
  // duoc, chu KHONG nhet bua vao bo cau hoi: nhet bua thi diem lead sai, ma
  // diem sai con te hon khong co diem.
  rc.body = {
    full_name: body.name,
    email: body.email,
    phone: body.phone,
    country_code: '+84',
    answers: {},
    ghi_chu_tu_do: {
      nganh_nghe: String(body.field || '').slice(0, 200),
      ghi_chu: String(body.note || '').slice(0, 2000),
    },
  };

  const leadRes = await createLead(rc);
  const lead = await docJson(leadRes);
  if (!lead.ok) {
    // Hop dong cu: loi tung o nam trong `errors`, khoa la ten o tren form cu.
    const f = lead.error?.fields || {};
    const errors = {};
    if (f.full_name) errors.name = f.full_name;
    if (f.email) errors.email = f.email;
    if (f.phone) errors.phone = f.phone;
    if (Object.keys(errors).length) return json({ ok: false, errors }, 400);
    return json({ ok: false, error: lead.error?.message || 'Không gửi được đăng ký.' },
      leadRes.status);
  }

  // Tao don: createOrder tu tim lead theo phien vua duoc gan o tren.
  rc.body = {};
  const donRes = await createOrder(rc);
  const don = await docJson(donRes);
  if (!don.ok) {
    // Giu nguyen ma trang thai that (429, 503...) de trang cu hien dung thong
    // diep, chi doi ten khoa loi sang `error` nhu hop dong cu.
    return json({ ok: false, error: don.error?.message || 'Không tạo được đơn hàng.' },
      donRes.status);
  }

  return json({
    ok: true,
    order: {
      code: don.order.code,
      amount: don.order.amount,
      status: don.order.status,
    },
    payment: doiSangPaymentCu(don.order.transfer),
  });
}

/**
 * GET /api/order/:ma — trang thanh toan goi lien tuc de biet tien da ve chua.
 */
export async function xemDonTuongThich(rc) {
  const res = await getOrder(rc);
  const b = await docJson(res);
  if (!b.ok) return json({ ok: false, error: 'Không tìm thấy đơn.' }, res.status);

  const o = b.order;
  const daTra = o.status === 'paid' ? o.amount : 0;
  return json({
    ok: true,
    order: {
      code: o.code,
      // KHONG tra ho ten: duong dan nay cong khai, ai co ma don la doc duoc.
      // Ban cu tra ten o day; giu nguyen la buoc lui ve mot lo ri da duoc vá.
      name: null,
      status: o.status,
      amount: o.amount,
      amountPaid: daTra,
      remaining: Math.max(0, o.amount - daTra),
      paidAt: o.paid_at,
      expiresAt: null,
    },
    payment: o.status === 'paid' ? null : doiSangPaymentCu(o.transfer),
  });
}

/** So ngay song cua link dat mat khau - trung voi auth/invite.js. */
const NGAY_LINK = 7;

/**
 * POST /api/order/:ma/confirm — khach tu bao "em chuyen khoan roi".
 *
 * CHI de ghi nhan, KHONG doi trang thai don. Tien ve hay chua la do webhook
 * ngan hang noi, khong phai do khach noi. Ban cu cung lam dung nhu vay.
 */
export async function xacNhanDaChuyenTuongThich(rc) {
  const code = String(rc.params.code || '').toUpperCase();
  const order = await rc.store.getOrderByCode(code);
  if (!order) return json({ ok: false, error: 'Không tìm thấy đơn.' }, 404);
  console.log(`[tuong-thich] khach tu bao da chuyen khoan cho don ${code}`);
  return json({ ok: true, status: order.status });
}

/**
 * POST /api/order/:ma/vao-lop — LUOI DO cua viec giao hang.
 *
 * Khach tra tien xong, he thong tao tai khoan va cap quyen, roi gui thu moi
 * kem link dat mat khau. Nhung CHUA DAT RESEND_API_KEY thi buc thu do that bai
 * lang le (bang emails_sent ghi "chua dat RESEND_API_KEY") - va khach vua tra
 * 2 trieu khong co mot duong nao vao lop. Duong dan nay cap thang link do ngay
 * tren trang thanh toan, khong phu thuoc email.
 *
 * HOI LAI SO DIEN THOAI chu khong chi dua vao ma don: ma don la ma DOI SOAT,
 * no nam trong noi dung chuyen khoan va trong sao ke ngan hang. Cap link lop
 * hoc cho bat cu ai biet ma la mo lop cho nguoi la.
 */
export async function vaoLopTuongThich(rc) {
  const gioiHan = await rateLimit(rc, `vaolop:${rc.ip}`, 8, 10 * 60 * 1000);
  if (!gioiHan.allowed) {
    return json({ ok: false, error: 'Anh chị thử hơi nhiều lần rồi. Đợi ít phút giúp em nhé.' }, 429);
  }

  const sdt = validatePhone(rc.body?.phone, '+84');
  if (sdt.error) {
    return json({ ok: false, error: 'Số điện thoại chưa đúng. Anh chị nhập lại giúp em.' }, 400);
  }

  const code = String(rc.params.code || '').toUpperCase();
  const order = await rc.store.getOrderByCode(code);

  // MOT cau tra loi duy nhat cho moi truong hop that bai: sai so dien thoai,
  // don chua tra tien, don khong ton tai. Khac nhau la bien cho nay thanh cong
  // cu do xem so nao da mua hang.
  const tuChoi = () => json({
    ok: false,
    error: 'Chưa tìm thấy lớp học ứng với mã đơn và số điện thoại này. '
      + 'Anh chị kiểm tra lại số, hoặc nhắn Zalo để bên Thành mở giúp.',
  }, 404);

  if (!order || (order.status !== 'paid' && order.status !== 'overpaid')) return tuChoi();

  const lead = order.lead_id ? await rc.store.getLeadById(order.lead_id) : null;
  if (!lead || lead.phone_e164 !== sdt.value.e164) return tuChoi();

  const user = await rc.store.get(
    'SELECT id, email FROM users WHERE legacy_lead_id = ? LIMIT 1', [lead.id]);
  if (!user) return tuChoi();

  // Mat khau KHONG nam trong bang users - no o bang `credentials` rieng. Hoi
  // nham bang la D1 nem "no such column: password_hash" va ca duong nay tra 500.
  const cred = await rc.store.get(
    'SELECT password_hash FROM credentials WHERE user_id = ?', [user.id]);

  // Da dat mat khau roi thi khong cap link dat lai - ho dang nhap binh thuong.
  if (cred && cred.password_hash) {
    return json({ ok: true, link: '/login', email: user.email, daDatMatKhau: true });
  }

  const token = randomToken();
  const hetHan = new Date(Date.now() + NGAY_LINK * 24 * 60 * 60 * 1000).toISOString();
  await rc.store.run(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), user.id, await sha256Hex(token), hetHan, rc.ip, new Date().toISOString()]);

  return json({
    ok: true,
    link: `/reset-password?token=${token}&moi=1`,
    email: user.email,
    daDatMatKhau: false,
  });
}

/**
 * POST /api/tra-cuu — nguoi da chuyen khoan roi dong tab, tim lai don bang SDT.
 *
 * Tra ve CANG IT CANG TOT: ma don, so tien, trang thai. KHONG tra ho ten va
 * KHONG tra link vao lop. So dien thoai la thu nua cong khai; ai go bua mot so
 * la chi biet so do co don hay khong, chu khong biet cua ai.
 */
export async function traCuuTuongThich(rc) {
  const gioiHan = await rateLimit(rc, `tracuu:${rc.ip}`, 5, 10 * 60 * 1000);
  if (!gioiHan.allowed) {
    return json({ ok: false, error: 'Anh chị tra cứu hơi nhiều lần. Đợi ít phút giúp em nhé.' }, 429);
  }

  const sdt = validatePhone(rc.body?.phone, '+84');
  if (sdt.error) {
    return json({ ok: false, error: 'Số điện thoại chưa đúng. Anh chị nhập lại giúp em.' }, 400);
  }

  const rows = await rc.store.all(
    `SELECT o.code, o.status, o.amount, o.paid_at, o.created_at
       FROM orders o JOIN leads l ON l.id = o.lead_id
      WHERE l.phone_e164 = ?
      ORDER BY o.id DESC LIMIT 10`, [sdt.value.e164]);

  return json({
    ok: true,
    orders: (rows || []).map((o) => ({
      code: o.code,
      status: o.status,
      amount: o.amount,
      amount_text: rc.cfg.formatPrice(o.amount),
      paidAt: o.paid_at,
      createdAt: o.created_at,
    })),
  });
}
