import type { Env } from '../../types';
import { uuid } from '../util/id';
import { now } from '../util/datetime';

/**
 * Nhật ký thao tác. Mọi thay đổi tiền bạc (duyệt hoa hồng, đánh dấu đã chi,
 * gán tay giao dịch) BẮT BUỘC đi qua đây — đó là thứ duy nhất trả lời được
 * "ai đã đổi cái này, lúc nào, từ giá trị gì".
 */
export async function audit(
  env: Env,
  entry: {
    actorType: 'admin' | 'affiliate' | 'student' | 'system' | 'webhook';
    actorId?: string | null;
    actorLabel?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ipHash?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log
         (id, actor_type, actor_id, actor_label, action, entity_type, entity_id,
          before_json, after_json, ip_hash, user_agent, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      uuid(), entry.actorType, entry.actorId ?? null, entry.actorLabel ?? null,
      entry.action, entry.entityType, entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ipHash ?? null, entry.userAgent ?? null, now(),
    ).run();
  } catch (err) {
    console.error('[audit] không ghi được nhật ký', entry.action, err);
  }
}

/** Câu lệnh audit dạng D1PreparedStatement để nhét vào db.batch() atomic. */
export function auditStmt(
  env: Env,
  entry: Parameters<typeof audit>[1],
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log
       (id, actor_type, actor_id, actor_label, action, entity_type, entity_id,
        before_json, after_json, ip_hash, user_agent, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    uuid(), entry.actorType, entry.actorId ?? null, entry.actorLabel ?? null,
    entry.action, entry.entityType, entry.entityId ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    entry.ipHash ?? null, entry.userAgent ?? null, now(),
  );
}
