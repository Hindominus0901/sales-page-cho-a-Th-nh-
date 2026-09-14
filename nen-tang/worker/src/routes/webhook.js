import { json, apiError } from '../lib/respond.js';
import { safeEqual } from '../lib/http.js';
import { notifyAsync } from '../lib/notify.js';
import { syncToKitAsync } from '../mail/kit.js';
import { guiThuDaThanhToan } from '../auth/invite.js';
import { fulfilOrder } from '../commerce/fulfil.js';

/**
 * Duong di cua TIEN - sua o day phai het suc than trong.
 *
 * Ba lop chan tinh tien hai lan:
 *   1. chi muc unique (provider, external_id) tren bang bank_txns
 *   2. cau lenh UPDATE co "AND status <> 'paid'"
 *   3. cot order_id UNIQUE tren bang commissions
 */

/**
 * Ma don nam trong noi dung chuyen khoan, vd "VIP 7KD2QA NGUYEN VAN A".
 *
 * Tien to phai lay tu cau hinh chu khong viet cung: orders.js sinh ma don theo
 * ORDER_PREFIX. Neu o day van do cung "VIP" thi doi tien to la webhook khong
 * nhan ra ma don nua - tien ve tai khoan that nhung don khong bao gio tu xac
 * nhan, va khong mot dong log nao noi vi sao.
 */
const ALPHABET_RE = '[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}';

export function extractCode(content, tienTo = 'DH') {
  const tt = String(tienTo).toUpperCase().replace(/[^A-Z]/g, '');
  if (!tt) return null;
  const re = new RegExp(`${tt}\\s*(${ALPHABET_RE})`, 'i');
  // Ngan hang hay lam meo noi dung; doi ky tu la thanh khoang trang truoc khi do.
  const m = re.exec(String(content || '').replace(/[^0-9A-Za-z ]/g, ' '));
  return m ? `${tt}${m[1].toUpperCase()}` : null;
}

/** Chuan hoa payload cua SePay / Casso / generic ve cung mot dang. */
export function parseTxns(body) {
  // SePay: { id, gateway, transactionDate, accountNumber, content, transferType, transferAmount, referenceCode }
  if (body && body.transferAmount !== undefined) {
    return [{
      provider: 'sepay',
      external_id: body.id ?? body.referenceCode,
      amount: Number(body.transferAmount) || 0,
      content: body.content || body.description || '',
      account: body.accountNumber || '',
      occurred_at: body.transactionDate || null,
      direction: (body.transferType || 'in') === 'in' ? 'in' : 'out',
      raw: body,
    }];
  }

  // Casso: { error, data: [ { id, tid, description, amount, when, subAccId } ] }
  if (body && Array.isArray(body.data)) {
    return body.data.map((tx) => ({
      provider: 'casso',
      external_id: tx.id ?? tx.tid,
      amount: Number(tx.amount) || 0,
      content: tx.description || '',
      account: tx.subAccId || tx.bankSubAccId || '',
      occurred_at: tx.when || null,
      direction: Number(tx.amount) >= 0 ? 'in' : 'out',
      raw: tx,
    }));
  }

  // Generic: { id, amount, content, account, occurred_at }
  if (body && body.amount !== undefined) {
    return [{
      provider: String(body.provider || 'generic'),
      external_id: body.id ?? null,
      amount: Number(body.amount) || 0,
      content: body.content || body.description || '',
      account: body.account || '',
      occurred_at: body.occurred_at || null,
      direction: Number(body.amount) >= 0 ? 'in' : 'out',
      raw: body,
    }];
  }

  return [];
}

/** Chua cau hinh secret = tu choi tat ca (dong chu khong mo). */
function authorized(rc) {
  const secret = rc.cfg.webhook.bankSecret;
  if (!secret) return false;
  const auth = rc.request.headers.get('authorization') || '';
  const apikey = auth.replace(/^Apikey\s+/i, '').replace(/^Bearer\s+/i, '');
  const header = rc.request.headers.get('x-webhook-secret') || '';
  return (apikey && safeEqual(apikey, secret)) || (header && safeEqual(header, secret));
}

/**
 * Ghi lai LAN GOI GAN NHAT vao webhook, ke ca lan bi tu choi.
 *
 * Vi sao can: mot cu goi sai khoa tra 401 va khong de lai dau vet nao - nhin tu
 * co so du lieu thi no giong het "chua ai goi bao gio". Hai chuyen do doi hoi
 * hai cach sua hoan toan khac nhau (sai khoa, hay chua noi duoc ngan hang), ma
 * suot ca tuan khong co gi de phan biet.
 *
 * De trong KV chu khong trong D1: day la mot o nho bi ghi de lien tuc, khong
 * phai du lieu can giu. Hong thi thoi, khong duoc lam vo duong nhan tien.
 */
async function ghiDauChan(rc, ket) {
  // Cong cu doi soat sao ke cung goi vao day. Neu no cung ghi dau chan thi
  // trang Doanh thu se bao "webhook nhan duoc binh thuong" - trong khi that ra
  // do la chinh minh vua goi, con SePay van im. Mot dau chan noi doi con te hon
  // khong co dau chan nao.
  if (rc.request.headers.get('x-doi-soat')) return;
  try {
    await rc.env.CACHE?.put('webhook:bank:lan-cuoi', JSON.stringify({
      luc: new Date().toISOString(),
      ket,
      ip: rc.ip || '',
      ua: (rc.request.headers.get('user-agent') || '').slice(0, 120),
    }));
  } catch { /* mot o ghi nho hong khong duoc lam hong duong nhan tien */ }
}

/**
 * POST /api/webhooks/bank
 * Nhan bien dong so du tu SePay / Casso -> tu dong xac nhan don.
 * Luon tra 200 kem trang thai tung giao dich, de nha cung cap khong ban lai lien tuc.
 */
export async function bankWebhook(rc) {
  if (!authorized(rc)) {
    // In ra log de con truy duoc bang `wrangler tail`, va ghi dau chan de trang
    // Doanh thu noi duoc "co nguoi goi toi nhung sai khoa" thay vi im lang.
    console.warn('[webhook] bi tu choi: sai secret hoac thieu header', rc.ip);
    await ghiDauChan(rc, 'sai_khoa');
    return apiError(401, 'unauthorized', 'Sai secret webhook');
  }
  await ghiDauChan(rc, 'nhan_duoc');

  const txns = parseTxns(rc.body);
  if (!txns.length) return apiError(400, 'bad_payload', 'Không đọc được dữ liệu giao dịch');

  const { store, affiliates, cfg } = rc;
  const results = [];

  for (const txn of txns) {
    if (txn.direction !== 'in' || txn.amount <= 0) {
      await store.insertBankTxn({ ...txn, status: 'ignored_outgoing' });
      results.push({ external_id: txn.external_id, status: 'ignored' });
      continue;
    }

    const code = extractCode(txn.content, cfg.product.orderPrefix);
    const order = code ? await store.getOrderByCode(code) : null;

    if (!order) {
      const saved = await store.insertBankTxn({ ...txn, matched_order: code, status: 'unmatched' });
      results.push({
        external_id: txn.external_id,
        status: saved.duplicate ? 'duplicate' : 'unmatched',
        code,
      });
      if (!saved.duplicate) {
        notifyAsync(rc, 'bank.unmatched',
          `Có tiền vào chưa khớp đơn: ${txn.amount} - "${txn.content}"`, txn);
      }
      continue;
    }

    if (order.status === 'paid') {
      await store.insertBankTxn({ ...txn, matched_order: order.code, status: 'already_paid' });
      // Van thu tao hoa hong: co the lan truoc da danh dau tra tien xong nhung
      // chet giua chung truoc khi kip sinh hoa hong. createCommission idempotent
      // (order_id la UNIQUE) nen goi lai khong bao gio tao hai ban.
      await affiliates.createCommission(order).catch(() => null);
      results.push({ external_id: txn.external_id, status: 'already_paid', code: order.code });
      continue;
    }

    // Cho phep lech nho (phi/lam tron), nhung phai du it nhat 98% so tien.
    const enough = txn.amount >= Math.floor(order.amount * 0.98);

    if (!enough) {
      const saved = await store.insertBankTxn({
        ...txn, matched_order: order.code, status: 'underpaid',
      });
      if (saved.duplicate) {
        results.push({ external_id: txn.external_id, status: 'duplicate', code: order.code });
        continue;
      }
      notifyAsync(rc, 'bank.underpaid',
        `Đơn ${order.code} chuyển thiếu: nhận ${txn.amount}/${order.amount}`, txn);
      results.push({ external_id: txn.external_id, status: 'underpaid', code: order.code });
      continue;
    }

    // THU TU O DAY RAT QUAN TRONG: danh dau don da tra tien TRUOC, ghi giao dich
    // SAU. Neu lam nguoc lai (nhu ban dau), mot su co giua hai buoc se khien lan
    // ngan hang gui lai bi coi la "trung" va bo qua - khach da chuyen tien ma
    // don ket o trang thai cho mai mai, khong co gi bao dong.
    //
    // Lam theo thu tu nay thi lan gui lai se roi vao nhanh "order.status ===
    // 'paid'" o tren va van sinh duoc hoa hong con thieu.
    const { changed } = await store.markOrderPaid(order.code, {
      amount: txn.amount,
      ref: String(txn.external_id || ''),
      note: `auto: ${txn.provider}`,
    });

    await store.insertBankTxn({ ...txn, matched_order: order.code, status: 'matched' });

    if (!changed) {
      // Don da huy (markOrderPaid khong dong toi don huy) hoac vua duoc mot lan
      // gui khac xu ly xong.
      results.push({ external_id: txn.external_id, status: 'not_applied', code: order.code });
      notifyAsync(rc, 'bank.unmatched',
        `Có tiền vào cho đơn ${order.code} nhưng đơn không ở trạng thái chờ (có thể đã huỷ)`, txn);
      continue;
    }

    await store.insertEvent({
      session_id: order.session_id,
      lead_id: order.lead_id,
      type: 'checkout_copy',
      page: 'checkout',
      meta: { paid: true, code: order.code, via: txn.provider },
      ip: rc.ip,
    });

    // Lay lai don sau khi cap nhat, de hoa hong tinh tren SO TIEN THUC NHAN
    // chu khong phai so tien niem yet (co dung sai 2%).
    const paidOrder = (await store.getOrderByCode(order.code)) || order;

    // Mo quyen truy cap cho nguoi mua. Truoc day buoc nay khong co: tra tien
    // xong khoa hoc van khoa cho den khi admin nho mo tay.
    const moQuyen = await fulfilOrder(rc, paidOrder).catch((err) => {
      console.warn('[webhook] khong mo duoc quyen cho', order.code, err?.message || err);
      return null;
    });

    // Bao cho khach biet tien da ve. Khong await: SePay cho phan hoi trong vai
    // giay, va no COI TIMEOUT LA THAT BAI roi gui lai - mot buc thu cham lam ca
    // lan gui hong thi khong dang. Loi trong day da duoc nuot san.
    rc.waitUntil(guiThuDaThanhToan(rc, paidOrder, moQuyen?.userId || null).catch(() => {}));

    const commission = await affiliates.createCommission(paidOrder);
    if (commission) {
      notifyAsync(rc, 'commission.created',
        `Hoa hong ${commission.amount} cho affiliate #${commission.affiliate_id} tu don ${order.code}`,
        { order_code: order.code, amount: commission.amount });
    }
    if (order.customer_email) {
      syncToKitAsync(rc, {
        email: order.customer_email,
        name: order.customer_name,
        tagKeys: ['kit_tag_customer'],
        boTagKeys: ['kit_tag_lead'],
        sequenceKey: 'kit_sequence_customer',
        fields: { ma_don: order.code, san_pham: order.product_sku || '' },
      });
    }

    notifyAsync(rc, 'order.paid',
      `ĐÃ THANH TOÁN ${order.code} - ${order.customer_name} (${order.customer_phone}) - ${txn.amount}`,
      { code: order.code, amount: txn.amount, provider: txn.provider });
    results.push({ external_id: txn.external_id, status: 'paid', code: order.code });
  }

  return json({ ok: true, success: true, results });
}
