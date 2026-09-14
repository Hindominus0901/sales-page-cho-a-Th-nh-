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
