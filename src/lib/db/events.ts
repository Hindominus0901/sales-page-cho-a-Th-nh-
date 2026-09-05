import type { Env, VisitorContext } from '../../types';
import { uuid } from '../util/id';
import { now, ictDate } from '../util/datetime';

export type EventName =
  | 'page_view' | 'cta_click' | 'form_start' | 'lead_created'
  | 'checkout_started' | 'qr_shown' | 'order_paid' | 'video_play';

/** Ghi sự kiện. Không bao giờ được phép ném lỗi ra ngoài — theo dõi hỏng thì
 *  chỉ mất số liệu, không được làm hỏng việc đăng ký của khách. */
export async function track(
  env: Env,
  name: EventName,
  visitor: VisitorContext | null,
  extra: {
    pageKey?: string; path?: string; leadId?: string; orderId?: string;
    affiliateId?: string | null; value?: number; props?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO events
         (id, event_name, visitor_id, page_key, path, lead_id, order_id, affiliate_id,
          utm_source, utm_medium, utm_campaign, device, country, value, props_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      uuid(), name, visitor?.visitorId ?? null, extra.pageKey ?? null, extra.path ?? null,
      extra.leadId ?? null, extra.orderId ?? null,
      extra.affiliateId ?? visitor?.affiliateId ?? null,
      visitor?.utm.utm_source ?? null, visitor?.utm.utm_medium ?? null,
      visitor?.utm.utm_campaign ?? null, visitor?.device ?? null, visitor?.country ?? null,
      extra.value ?? null, JSON.stringify(extra.props ?? {}), now(),
    ).run();
  } catch (err) {
    console.error('[track] không ghi được sự kiện', name, err);
  }
}

/** Cộng dồn vào bảng tổng hợp ngày để dashboard không phải quét bảng events. */
export async function bumpDailyStats(
  env: Env,
  pageKey: string,
  affiliateId: string | null,
  delta: Partial<Record<'views' | 'uniques' | 'leads' | 'orders' | 'paid_orders' | 'revenue', number>>,
): Promise<void> {
  const cols = ['views', 'uniques', 'leads', 'orders', 'paid_orders', 'revenue'] as const;
  const values = cols.map((c) => delta[c] ?? 0);
  try {
    await env.DB.prepare(
      `INSERT INTO daily_stats (stat_date, page_key, affiliate_id, views, uniques, leads, orders, paid_orders, revenue)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(stat_date, page_key, affiliate_id) DO UPDATE SET
         views       = views       + excluded.views,
         uniques     = uniques     + excluded.uniques,
         leads       = leads       + excluded.leads,
         orders      = orders      + excluded.orders,
         paid_orders = paid_orders + excluded.paid_orders,
         revenue     = revenue     + excluded.revenue`,
    ).bind(ictDate(), pageKey, affiliateId ?? '', ...values).run();
  } catch (err) {
    console.error('[daily_stats] không cộng được', err);
  }
}
