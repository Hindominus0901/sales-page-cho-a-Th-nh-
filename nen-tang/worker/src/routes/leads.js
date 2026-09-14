import { json, apiError } from '../lib/respond.js';
import { rateLimit } from '../lib/http.js';
import { validateName, validateEmail, validatePhone, COUNTRY_CODES } from '../lib/validate.js';
import { normalizeAnswers, scoreLead, flattenAnswers } from '../questions.js';
import { notifyAsync } from '../lib/notify.js';
import { syncToKitAsync } from '../mail/kit.js';
import { refCodeFromRequest, refCodeFromSession } from './affiliate.js';
import { inviteLeadToApp, guiLaiThuMoi } from '../auth/invite.js';

/**
 * Dien lai form ma van chua vao duoc lop -> gui lai thu moi.
 *
 * Ba ve, thieu ve nao cung sai:
 *   - da co tai khoan       (chua co thi inviteLeadToApp lo, khong phai ham nay)
 *   - CHUA tung dat mat khau
 *   - CHUA tung dang nhap Google
 *
 * Hai ve sau la ranh gioi bao mat: ai da vao lop binh thuong ma nhan them mot
 * link dat mat khau se tuong co ke dang nghich tai khoan minh - va bat ky ai
 * biet so dien thoai cua ho deu bam ra duoc link do bang cach dien lai form.
 */
async function guiLaiNeuChuaVaoDuoc(rc, lead) {
  const email = String(lead?.email || '').trim().toLowerCase();
  if (!email) return;

  // Toi da 3 lan moi gio CHO MOI DIA CHI - giong het gioi han cua "Quen mat
  // khau". Khong co no thi bat ky ai biet so dien thoai cua mot hoc vien deu
  // dung form dang ky lam may doi thu vao hop thu nguoi do. Gioi han theo IP o
  // dau handler khong du: doi mang la vong qua duoc, con dia chi nhan thi
  // khong doi duoc.
  const chan = await rateLimit(rc, `moi-lai:${email}`, 3, 60 * 60 * 1000);
  if (!chan.allowed) return;

  const u = await rc.store.get(
    'SELECT id, email, full_name FROM users WHERE lower(email) = ?', [email]);
  if (!u) return;

  const [mk, gg] = await Promise.all([
    rc.store.get('SELECT 1 x FROM credentials WHERE user_id = ?', [u.id]),
    rc.store.get('SELECT 1 x FROM oauth_accounts WHERE user_id = ?', [u.id]),
  ]);
  if (mk || gg) return;

  await guiLaiThuMoi(rc, u);
}


/**
 * POST /api/leads
 * Body: {
 *   full_name, email, phone, country_code,
 *   answers: { q1..q8 },            // text dap an nguoi dung chon
 *   answers_schema: 'canonical'|'html',
 *   attribution: { utm_source, utm_medium, ... }
 * }
 */
export async function createLead(rc) {
  const { cfg, store, affiliates } = rc;

  const limit = await rateLimit(rc, `lead:${rc.ip}`, cfg.limits.leadPerHour, 60 * 60 * 1000);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited',
      'Bạn gửi quá nhiều lần. Vui lòng thử lại sau ít phút.', { retry_after: limit.retryAfter });
  }

  const body = rc.body || {};
  const fields = {};
  const errors = {};

  const name = validateName(body.full_name ?? body.name);
  if (name.error) errors.full_name = name.error; else fields.full_name = name.value;

  const email = validateEmail(body.email);
  if (email.error) errors.email = email.error; else fields.email = email.value;

  const cc = COUNTRY_CODES.includes(body.country_code) ? body.country_code : '+84';
  const phone = validatePhone(body.phone, cc);
  if (phone.error) errors.phone = phone.error; else Object.assign(fields, phone.value);

  const schema = body.answers_schema === 'html' ? 'html' : 'canonical';
  const { answers, missing } = normalizeAnswers(body.answers || {}, schema);
  if (missing.length) errors.answers = `Còn thiếu câu trả lời: ${missing.join(', ')}`;

  if (Object.keys(errors).length) {
    return apiError(422, 'validation_failed', 'Thông tin chưa hợp lệ', { fields: errors });
  }

  const { score, segment } = scoreLead(answers);

  await store.upsertSession(rc.sid, {
    ip: rc.ip, userAgent: rc.userAgent, attribution: body.attribution,
  });
  const session = (await store.getSession(rc.sid)) || {};

  // Nguoi gioi thieu (neu khach vao bang link ?ref=MA).
  //
  // Cookie truoc, roi den dia chi trang ma phien nay dap vao. Chi doc moi cookie
  // la du - cho den khi POST /api/ref khong kip chay xong (nguoi ta bam tiep
  // sang trang dang ky ngay), luc do khong con gi giu lai ma nua va nguoi gioi
  // thieu mat luot ma khong ai biet. Xem refCodeFromSession.
  let referrer = null;
  const refCode = refCodeFromRequest(rc) || refCodeFromSession(session);
  if (refCode) {
    // OrMapped: link cua he thong cu van con duoc rai; ma nao da duoc gan cho
    // mot cong tac vien that thi luot nay ve cho ho.
    const found = await affiliates.getByCodeOrMapped(refCode);
    if (found && found.status === 'active') referrer = found;
  }

  const { lead, created, sessionMatched } = await store.upsertLead({
    session_id: rc.sid,
    full_name: fields.full_name,
    email: fields.email,
    phone: fields.phone,
    phone_e164: fields.e164,
    country_code: fields.countryCode,
    answers_json: JSON.stringify(answers),
    score,
    segment,
    utm_source: session.utm_source || '',
    utm_campaign: session.utm_campaign || '',
    ip: rc.ip,
    user_agent: rc.userAgent,
  });

  // Chi lead MOI moi tinh them luot cho nguoi gioi thieu; dang ky lai khong tinh.
  let referralResult = null;
  if (referrer && created) {
    referralResult = await affiliates.creditReferral(lead, referrer, { ip: rc.ip });
    if (referralResult.level?.changed && referralResult.level.up) {
      notifyAsync(rc, 'affiliate.unlocked',
        `${referrer.full_name} (${referrer.code}) vua mo khoa bac ${referralResult.level.level}`,
        {
          code: referrer.code,
          level: referralResult.level.level,
          referrals: referralResult.level.count,
        });
    }
  }

  // Moi nguoi dang ky deu duoc cap link gioi thieu rieng. Nhung neu day la mot
  // PHIEN KHAC gui trung so dien thoai cua lead da co (khong phai chinh chu),
  // KHONG duoc lay/tra ve affiliate that cua ho - do so dien thoai nguoi khac
  // se lo ra token bi mat. Xem ghi chu trong db.js#upsertLead.
  const affiliate = cfg.affiliate.autoEnroll && sessionMatched
    ? await affiliates.ensureForLead(lead)
    : null;

  await store.insertEvent({
    session_id: rc.sid,
    lead_id: lead.id,
    type: created ? 'lead_created' : (sessionMatched ? 'lead_updated' : 'lead_claim_blocked'),
    page: 'form',
    meta: { score, segment },
    ip: rc.ip,
  });

  // Lead cu quay lai bang link nguoi khac -> giu nguyen nguoi gioi thieu ban dau
  if (referrer && !created) referrer = null;

  if (sessionMatched) {
    // Sang Kit de chi Thanh nuoi duong tiep. Kit hong khong duoc lam hong form.
    syncToKitAsync(rc, {
      email: lead.email,
      name: lead.full_name,
      tagKeys: ['kit_tag_lead'],
      sequenceKey: 'kit_sequence_lead',
      fields: {
        phone: lead.phone || '',
        nguon: session.utm_source || '',
        phan_khuc: segment,
        diem: String(score),
      },
    });

    // Lead MOI -> tao san tai khoan va gui link dat mat khau. Chi lam voi lead
    // moi: nguoi dien lai form lan hai da co tai khoan roi, gui them link chi
    // lam ho tuong bi ai do nghich tai khoan.
    //
    // Cho xong roi moi tra loi form, khong day sang waitUntil: day la buc thu
    // DUY NHAT cho ho duong vao webapp. Mat im lang la mat luon nguoi do, ma
    // khong ai biet de sua. Ham nay tu nuot moi loi ben trong nen no khong bao
    // gio lam hong viec ghi lead.
    if (created) {
      await inviteLeadToApp(rc, lead);
    } else {
      // DIEN LAI FORM = XIN GUI LAI THU. Truoc day chi gui khi dong lead moi
      // duoc tao, ma upsertLead nhan ra nguoi cu theo SO DIEN THOAI - nen ai
      // mat thu moi, dien lai form bang cung so, se nhan duoc dung mot su im
      // lang. Ho khong biet phai lam gi tiep, va chi Thanh nghe "em dang ky lai
      // ma khong thay mail".
      //
      // Chi gui lai cho nguoi THAT SU chua vao duoc: chua co mat khau va chua
      // tung dang nhap Google. Gui link dat mat khau cho nguoi dang dung binh
      // thuong la mo mot duong chiem tai khoan cho bat ky ai doc duoc hop thu.
      await guiLaiNeuChuaVaoDuoc(rc, lead).catch(() => {});
    }

    notifyAsync(rc, created ? 'lead.created' : 'lead.updated',
      `${lead.full_name} (${lead.phone}) - ${segment.toUpperCase()} ${score}/100`, {
        lead_id: lead.id,
        email: lead.email,
        phone: lead.phone,
        score,
        segment,
        utm_source: session.utm_source || '',
        referred_by: referrer ? `${referrer.full_name} (${referrer.code})` : null,
        answers: flattenAnswers(answers),
      });
  } else {
    // Nguoi khac vua thu dang ky bang dung so dien thoai cua lead da co san.
    // Khong ghi de du lieu that, chi bao de ra soat (co the ho doi thiet bi,
    // cung co the ai do do so cua nguoi khac).
    notifyAsync(rc, 'lead.claim_mismatch',
      `Có người thử đăng ký lại bằng số điện thoại đã tồn tại (${lead.phone}) từ thiết bị khác`, {
        lead_id: lead.id,
        ip: rc.ip,
        submitted_name: fields.full_name,
        submitted_email: fields.email,
      });
  }

  // Phien khac claim trung so dien thoai: khong echo lai du lieu that cua chu
  // so (ten/email/diem) - chi tra lai dung nhung gi nguoi goi vua gui len.
  const leadOut = sessionMatched
    ? {
      id: lead.id, full_name: lead.full_name, email: lead.email, phone: lead.phone,
      score: lead.score, segment: lead.segment, status: lead.status,
    }
    : {
      id: lead.id, full_name: fields.full_name, email: fields.email, phone: fields.phone,
      score, segment, status: lead.status,
    };

  return json({
    ok: true,
    created,
    lead: leadOut,
    next: '/xac-nhan',
    zalo_group_url: cfg.zalo.groupUrl || null,
    affiliate: affiliate
      ? {
        code: affiliate.code,
        commission_rate_text: `${Math.round(Number(affiliate.commission_rate) * 100)}%`,
        commission_per_sale_text: cfg.formatPrice(
          Math.round(cfg.product.price * Number(affiliate.commission_rate))),
        ...affiliates.links(affiliate, rc.origin),
      }
      : null,
  }, created ? 201 : 200);
}
