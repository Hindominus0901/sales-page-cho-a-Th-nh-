import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, HonoEnv, UtmParams, VisitorContext } from '../../types';
import { uuid } from '../util/id';
import { now, ictDate } from '../util/datetime';
import { hashIp } from '../security/hash';

export const COOKIE_VISITOR = 'gc_vid';
export const COOKIE_REF = 'gc_ref';

// Trình duyệt (và Hono) chặn cookie quá 400 ngày, nên 395 là mức tối đa dùng được.
const VISITOR_MAX_AGE = 395 * 86400;
const MAX_COOKIE_DAYS = 395;

/**
 * Gắn danh tính khách và quy kết cộng tác viên vào mọi request công khai.
 *
 * Mô hình quy kết: CHẠM ĐẦU TIÊN, cửa sổ 90 ngày.
 *
 * Vì sao không phải chạm cuối: tệp này mua theo nội dung — CTV làm video giới
 * thiệu anh Thành cho người lạ, người đó cân nhắc vài tuần rồi mới quyết. Nếu
 * tính chạm cuối thì bất kỳ ai chạy retarget từ khoá thương hiệu cũng gặt được
 * công của người giới thiệu đầu tiên, và mọi tranh chấp trở nên không phân xử
 * được. Chạm đầu cũng dễ giải thích với CTV hơn.
 */
export const attribution: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const cookies: string[] = [];
  try {
    await applyAttribution(c, cookies);
  } catch (err) {
    // Quy kết hỏng chỉ làm mất số liệu. Trang bán hàng vẫn phải hiện ra.
    console.error('[attribution] bỏ qua lỗi:', err);
    if (!c.get('visitor')) c.set('visitor', anonymousVisitor(c.req.header('user-agent') ?? null));
  }

  await next();

  /**
   * Gắn cookie lên response CUỐI CÙNG, không phải lên c.header() trước next().
   *
   * Handler bắt-tất-cả trả về một Response mới lấy từ ASSETS; mọi header đặt
   * trước đó bị bỏ lại cùng response cũ. Đặt ở đây thì cookie sống sót qua cả
   * trang tĩnh — nếu không, khách vào bằng link CTV rồi mở trang tĩnh là mất
   * quy kết, và hoa hồng không bao giờ được ghi nhận.
   */
  if (cookies.length > 0) {
    const res = new Response(c.res.body, c.res);
    for (const cookie of cookies) res.headers.append('set-cookie', cookie);
    c.res = res;
  }
};

async function applyAttribution(c: Context<HonoEnv>, cookies: string[]): Promise<void> {
  const env = c.env;
  const url = new URL(c.req.url);

  let visitorId = getCookie(c, COOKIE_VISITOR);
  if (!visitorId || visitorId.length < 10) {
    visitorId = uuid();
    cookies.push(buildCookie(COOKIE_VISITOR, visitorId, VISITOR_MAX_AGE, url));
  }

  const ip = c.req.header('cf-connecting-ip') ?? null;
  const ipHash = await hashIp(env, ip);
  const userAgent = c.req.header('user-agent') ?? null;

  const visitor: VisitorContext = {
    visitorId,
    affiliateId: parseRefCookie(getCookie(c, COOKIE_REF)),
    ipHash,
    userAgent,
    utm: readUtm(url),
    referer: c.req.header('referer') ?? null,
    country: c.req.header('cf-ipcountry') ?? null,
    device: guessDevice(userAgent),
  };

  const refCode = url.searchParams.get('ref') ?? url.searchParams.get('aff');
  if (refCode) {
    const resolved = await recordClick(c, refCode, visitor, url.pathname);
    // Chỉ nhận CTV mới khi khách CHƯA được quy kết cho ai. Đã có rồi thì giữ.
    if (resolved && !visitor.affiliateId) {
      visitor.affiliateId = resolved;
      const refDays = Math.min(Number(env.AFFILIATE_COOKIE_DAYS || 90), MAX_COOKIE_DAYS);
      cookies.push(buildCookie(COOKIE_REF, `${resolved}|${now()}`, refDays * 86400, url));
    }
  }

  c.set('visitor', visitor);
}

function buildCookie(name: string, value: string, maxAge: number, url: URL): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`,
  ];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

function anonymousVisitor(userAgent: string | null): VisitorContext {
  return {
    visitorId: 'anon', affiliateId: null, ipHash: null, userAgent,
    utm: { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null },
    referer: null, country: null, device: null,
  };
}

/** Cookie dạng "<affiliateId>|<unix ts>". Hết hạn thì coi như chưa quy kết. */
function parseRefCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, ts] = raw.split('|');
  if (!id) return null;
  const stamp = Number(ts);
  if (!Number.isFinite(stamp)) return null;
  return id;
}

/**
 * Ghi nhận click và trả về id CTV nếu mã hợp lệ.
 *
 * `is_first_touch = 0` khi khách đã thuộc về CTV khác: CTV thứ hai vẫn thấy
 * traffic mình mang lại trong dashboard, nhưng hoa hồng không đổi chủ. Minh
 * bạch hơn là im lặng bỏ qua click.
 */
async function recordClick(
  c: Context<HonoEnv>,
  code: string,
  visitor: VisitorContext,
  path: string,
): Promise<string | null> {
  const clean = code.trim().toUpperCase().slice(0, 40);
  if (!clean) return null;

  const row = await c.env.DB
    .prepare(`SELECT id FROM affiliates WHERE code = ? AND status = 'active'`)
    .bind(clean)
    .first<{ id: string }>();
  if (!row) return null;

  const isFirstTouch = visitor.affiliateId ? 0 : 1;
  try {
    await c.env.DB.prepare(
      `INSERT INTO affiliate_clicks
         (id, affiliate_id, visitor_id, click_date, landing_path, referer,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          country, device, ip_hash, user_agent, is_first_touch, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(affiliate_id, visitor_id, click_date) DO NOTHING`,
    ).bind(
      uuid(), row.id, visitor.visitorId, ictDate(), path, visitor.referer,
      visitor.utm.utm_source, visitor.utm.utm_medium, visitor.utm.utm_campaign,
      visitor.utm.utm_content, visitor.utm.utm_term,
      visitor.country, visitor.device, visitor.ipHash, visitor.userAgent,
      isFirstTouch, now(),
    ).run();
  } catch (err) {
    // Ghi click hỏng không được phép làm hỏng việc xem trang.
    console.error('[attribution] không ghi được click:', err);
  }
  return row.id;
}

function readUtm(url: URL): UtmParams {
  const g = (k: string) => {
    const v = url.searchParams.get(k);
    return v ? v.slice(0, 120) : null;
  };
  return {
    utm_source: g('utm_source'),
    utm_medium: g('utm_medium'),
    utm_campaign: g('utm_campaign'),
    utm_content: g('utm_content'),
    utm_term: g('utm_term'),
  };
}

function guessDevice(ua: string | null): 'mobile' | 'tablet' | 'desktop' | null {
  if (!ua) return null;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Đích cho /r/:code — chỉ cho phép path nội bộ, chặn open redirect. */
export function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.slice(0, 200);
}
