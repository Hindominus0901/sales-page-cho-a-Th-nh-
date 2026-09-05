import type { Env, VisitorContext } from '../../types';
import { uuid, shortCode } from '../util/id';
import { now } from '../util/datetime';
import { scoreLead, mergeScore, type ScoreInput, type ScoreResult } from '../scoring/rules';
import { toPhoneNorm, isValidVnPhone } from '../validation/phone';

export interface LeadRow {
  id: string;
  code: string;
  full_name: string;
  phone_norm: string;
  score: number;
  score_band: string;
  score_breakdown: string;
  scoring_version: number;
  affiliate_id: string | null;
  source: string;
  created_at: number;
}

export interface UpsertLeadInput {
  fullName: string;
  phone: string;
  email?: string | null;
  facebookUrl?: string | null;
  source: 'workshop' | 'ban_do' | 'consult' | 'checkout' | 'manual' | 'import';
  sourcePage?: string | null;
  answers: Record<string, unknown>;
  scoring: Omit<ScoreInput, 'phoneValid' | 'email' | 'facebookUrl' | 'duplicateWithin24h' | 'viaAffiliate'>;
  visitor: VisitorContext;
}

/**
 * Tạo hoặc cập nhật lead theo số điện thoại chuẩn hoá.
 *
 * Hai bất biến quan trọng:
 *  1. `affiliate_id` chỉ được ghi MỘT LẦN, lúc lead ra đời. Mọi lần gọi sau
 *     không đụng tới nó — kể cả khi khách quay lại qua link của CTV khác.
 *     Chặn ở đây chứ không chỉ là quy ước, để không ai vô tình ghi đè.
 *  2. Điểm chỉ được TĂNG. Form workshop ngắn không được phép hạ điểm của một
 *     lead đã điền form tư vấn đầy đủ.
 */
export async function upsertLead(
  env: Env,
  input: UpsertLeadInput,
): Promise<{ lead: LeadRow; created: boolean; score: ScoreResult }> {
  const phoneNorm = toPhoneNorm(input.phone);
  const emailNorm = input.email?.trim().toLowerCase() || null;
  const ts = now();

  const existing = await env.DB
    .prepare(`SELECT * FROM leads WHERE phone_norm = ? LIMIT 1`)
    .bind(phoneNorm)
    .first<LeadRow & { answers_json: string; email: string | null }>();

  const duplicateWithin24h = Boolean(existing && ts - existing.created_at < 86400);

  // Đã dự workshop = tệp ấm nhất. Tra theo chính số điện thoại này.
  const attended = await env.DB
    .prepare(`SELECT 1 FROM workshop_registrations WHERE phone_norm = ? LIMIT 1`)
    .bind(phoneNorm)
    .first();

  const score = scoreLead({
    ...input.scoring,
    attendedWorkshop: Boolean(attended),
    viaAffiliate: Boolean(input.visitor.affiliateId),
    phoneValid: isValidVnPhone(input.phone.replace(/[^\d+]/g, '').replace(/^\+84/, '0')),
    email: emailNorm,
    facebookUrl: input.facebookUrl ?? null,
    duplicateWithin24h,
  });

  if (existing) {
    const previous: ScoreResult = {
      score: existing.score,
      band: existing.score_band as ScoreResult['band'],
      breakdown: safeParse(existing.score_breakdown),
      version: existing.scoring_version,
    };
    const merged = mergeScore(previous, score);

    // answers_json gộp lại: form sau bổ sung thông tin, không xoá thông tin cũ.
    const mergedAnswers = { ...safeParseObj(existing.answers_json), ...input.answers };

    await env.DB.prepare(
      `UPDATE leads SET
         full_name = ?, email = COALESCE(?, email), email_norm = COALESCE(?, email_norm),
         facebook_url = COALESCE(?, facebook_url),
         answers_json = ?, score = ?, score_band = ?, score_breakdown = ?,
         scoring_version = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      input.fullName, input.email ?? null, emailNorm, input.facebookUrl ?? null,
      JSON.stringify(mergedAnswers), merged.score, merged.band,
      JSON.stringify(merged.breakdown), merged.version, ts, existing.id,
    ).run();

    return {
      lead: { ...existing, full_name: input.fullName, score: merged.score, score_band: merged.band },
      created: false,
      score: merged,
    };
  }

  const id = uuid();
  const code = 'LD' + shortCode(6);
  await env.DB.prepare(
    `INSERT INTO leads
       (id, code, full_name, phone, phone_norm, email, email_norm, facebook_url,
        source, source_page, answers_json, score, score_band, score_breakdown,
        scoring_version, status, affiliate_id, visitor_id,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        referer, ip_hash, user_agent, consent_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, code, input.fullName, input.phone, phoneNorm, input.email ?? null, emailNorm,
    input.facebookUrl ?? null, input.source, input.sourcePage ?? null,
    JSON.stringify(input.answers), score.score, score.band,
    JSON.stringify(score.breakdown), score.version,
    input.visitor.affiliateId, input.visitor.visitorId,
    input.visitor.utm.utm_source, input.visitor.utm.utm_medium,
    input.visitor.utm.utm_campaign, input.visitor.utm.utm_content,
    input.visitor.utm.utm_term,
    input.visitor.referer, input.visitor.ipHash, input.visitor.userAgent,
    ts, ts, ts,
  ).run();

  return {
    lead: {
      id, code, full_name: input.fullName, phone_norm: phoneNorm,
      score: score.score, score_band: score.band,
      score_breakdown: JSON.stringify(score.breakdown),
      scoring_version: score.version,
      affiliate_id: input.visitor.affiliateId, source: input.source, created_at: ts,
    },
    created: true,
    score,
  };
}

function safeParse(json: string): ScoreResult['breakdown'] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function safeParseObj(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
