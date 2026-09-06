import type { Env } from '../../types';
import { now } from '../util/datetime';
import { auditStmt } from '../db/audit';

export type CommissionStatus =
  | 'pending' | 'held' | 'approved' | 'payout_requested' | 'paid' | 'void' | 'rejected';

/**
 * Máy trạng thái hoa hồng. Mọi chuyển trạng thái phải đi qua đây.
 *
 * Chuyển thẳng từ 'pending' sang 'paid' mà bỏ qua duyệt, hay trả lại tiền cho
 * một hoa hồng đã chi, là những lỗi mất tiền thật. Liệt kê tường minh các bước
 * hợp lệ khiến bước sai bị từ chối ở tầng dữ liệu chứ không phụ thuộc vào việc
 * người viết route có nhớ kiểm tra hay không.
 */
const ALLOWED: Record<CommissionStatus, CommissionStatus[]> = {
  pending:          ['held', 'approved', 'void', 'rejected'],
  held:             ['pending', 'approved', 'rejected', 'void'],
  approved:         ['payout_requested', 'void', 'held'],
  payout_requested: ['paid', 'approved'],   // quay lại 'approved' khi huỷ đợt chi
  paid:             [],                     // đã chi là chốt sổ
  void:             [],
  rejected:         [],
};

export function canTransition(from: CommissionStatus, to: CommissionStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export interface TransitionResult { ok: boolean; error?: string }

/**
 * Câu lệnh chuyển một hoa hồng, để gom nhiều cái vào cùng một db.batch().
 *
 * Tách ra khỏi transitionCommission() vì cùng một phép chuyển nhưng khác cách
 * gửi đi: một cái thì gọi thẳng, nhiều cái thì phải gộp.
 */
function transitionStmts(
  env: Env,
  row: { id: string; status: CommissionStatus },
  to: CommissionStatus,
  actor: { type: 'admin' | 'system'; id?: string | null; label?: string | null },
  extra: { reason?: string; payoutId?: string | null },
  ts: number,
): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      `UPDATE commissions SET
         status = ?,
         approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
         approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
         paid_at     = CASE WHEN ? = 'paid'     THEN ? ELSE paid_at END,
         payout_id   = COALESCE(?, payout_id),
         hold_reason = CASE WHEN ? = 'held' THEN ? ELSE hold_reason END,
         void_reason = CASE WHEN ? IN ('void','rejected') THEN ? ELSE void_reason END,
         updated_at  = ?
       WHERE id = ? AND status = ?`,
    ).bind(
      to, to, ts, to, actor.id ?? null, to, ts,
      extra.payoutId ?? null,
      to, extra.reason ?? null,
      to, extra.reason ?? null,
      ts, row.id, row.status,
    ),
    auditStmt(env, {
      actorType: actor.type, actorId: actor.id, actorLabel: actor.label,
      action: 'commission.' + to, entityType: 'commission', entityId: row.id,
      before: { status: row.status }, after: { status: to, reason: extra.reason ?? null },
    }),
  ];
}

/**
 * Chuyển NHIỀU hoa hồng trong một lượt.
 *
 * Lý do tồn tại là hạn mức của nền tảng, không phải chuyện gọn mã. Workers gói
 * Free cho 50 subrequest mỗi lần chạy, và mỗi lời gọi D1 tính một cái. Duyệt
 * một đợt chi bằng vòng lặp gọi transitionCommission() là 2 subrequest cho mỗi
 * hoa hồng — quá 23 cái là ném giữa chừng, và ném giữa chừng ở đây nghĩa là đợt
 * chi đã ghi 'paid' trong khi vài hoa hồng còn nằm ở 'payout_requested', tức là
 * lần sau chúng được gom vào đợt chi mới và CTV được trả tiền HAI LẦN.
 *
 * Gộp lại còn đúng 2 subrequest cho cả đợt, và cả đợt vào cùng một batch nên
 * hoặc tất cả cùng chuyển, hoặc không cái nào chuyển.
 */
export async function transitionCommissions(
  env: Env,
  ids: string[],
  to: CommissionStatus,
  actor: { type: 'admin' | 'system'; id?: string | null; label?: string | null },
  extra: { reason?: string; payoutId?: string | null } = {},
): Promise<{ changed: number; skipped: number }> {
  if (ids.length === 0) return { changed: 0, skipped: 0 };

  // D1 chặn ở 100 tham số buộc cho mỗi câu lệnh. Chia lô 90 cho chắc.
  const CHUNK = 90;
  let changed = 0;
  let skipped = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const lo = ids.slice(i, i + CHUNK);
    const rows = await env.DB.prepare(
      `SELECT id, status FROM commissions WHERE id IN (${lo.map(() => '?').join(',')})`,
    ).bind(...lo).all<{ id: string; status: CommissionStatus }>();

    const ts = now();
    const stmts: D1PreparedStatement[] = [];
    for (const row of rows.results ?? []) {
      // Đã ở đúng trạng thái, hoặc bước chuyển không hợp lệ: bỏ qua trong im
      // lặng, y như transitionCommission() làm với một cái.
      if (row.status === to || !canTransition(row.status, to)) { skipped++; continue; }
      stmts.push(...transitionStmts(env, row, to, actor, extra, ts));
      changed++;
    }
    if (stmts.length) await env.DB.batch(stmts);
  }

  return { changed, skipped };
}

export async function transitionCommission(
  env: Env,
  commissionId: string,
  to: CommissionStatus,
  actor: { type: 'admin' | 'system'; id?: string | null; label?: string | null },
  extra: { reason?: string; payoutId?: string | null } = {},
): Promise<TransitionResult> {
  const row = await env.DB.prepare(`SELECT id, status, amount FROM commissions WHERE id = ?`)
    .bind(commissionId).first<{ id: string; status: CommissionStatus; amount: number }>();
  if (!row) return { ok: false, error: 'Không tìm thấy hoa hồng.' };

  if (row.status === to) return { ok: true };
  if (!canTransition(row.status, to)) {
    return { ok: false, error: `Không thể chuyển hoa hồng từ "${row.status}" sang "${to}".` };
  }

  const ts = now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE commissions SET
         status = ?,
         approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
         approved_by = CASE WHEN ? = 'approved' THEN ? ELSE approved_by END,
         paid_at     = CASE WHEN ? = 'paid'     THEN ? ELSE paid_at END,
         payout_id   = COALESCE(?, payout_id),
         hold_reason = CASE WHEN ? = 'held' THEN ? ELSE hold_reason END,
         void_reason = CASE WHEN ? IN ('void','rejected') THEN ? ELSE void_reason END,
         updated_at  = ?
       WHERE id = ? AND status = ?`,
    ).bind(
      to, to, ts, to, actor.id ?? null, to, ts,
      extra.payoutId ?? null,
      to, extra.reason ?? null,
      to, extra.reason ?? null,
      ts, commissionId, row.status,
    ),
    auditStmt(env, {
      actorType: actor.type, actorId: actor.id, actorLabel: actor.label,
      action: 'commission.' + to, entityType: 'commission', entityId: commissionId,
      before: { status: row.status }, after: { status: to, reason: extra.reason ?? null },
    }),
  ]);

  return { ok: true };
}

export const COMMISSION_LABEL: Record<CommissionStatus, string> = {
  pending:          'Chờ qua kỳ soát đơn',
  held:             'Đang treo — cần xem lại',
  approved:         'Đã duyệt, chờ CTV yêu cầu rút',
  payout_requested: 'Đang trong đợt chi',
  paid:             'Đã chi',
  void:             'Đã huỷ',
  rejected:         'Bị từ chối',
};

export const HOLD_REASON_LABEL: Record<string, string> = {
  self_referral_same_phone: 'Trùng số điện thoại của chính CTV',
  self_referral_same_email: 'Trùng email của chính CTV',
  same_ip_as_affiliate_login: 'Cùng IP với lần CTV đăng nhập gần đây',
  same_device_as_affiliate: 'Cùng thiết bị với CTV',
  buyer_name_matches_affiliate_bank_account: 'Tên người mua trùng tên tài khoản ngân hàng của CTV',
  many_orders_same_ip_24h: 'Nhiều đơn cùng một IP trong 24 giờ',
};
