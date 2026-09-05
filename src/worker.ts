import { Hono } from 'hono';
import type { Env, HonoEnv } from './types';
import { attribution } from './lib/affiliate/attribution';
import { publicRoutes } from './routes/public';
import { checkoutRoutes } from './routes/checkout';
import { webhookRoutes } from './routes/webhook-sepay';
import { runDailyJobs } from './lib/jobs/daily';

const app = new Hono<HonoEnv>();

/**
 * Webhook đăng ký TRƯỚC middleware attribution: nó không phải request của
 * người dùng, không có cookie, và không được phép tốn một lượt ghi click.
 */
app.route('/', webhookRoutes);

app.use('*', attribution);

app.route('/', publicRoutes);
app.route('/', checkoutRoutes);

/** Trang quản trị và portal CTV không bao giờ được index. */
app.use('/admin/*', async (c, next) => { c.header('X-Robots-Tag', 'noindex, nofollow'); await next(); });
app.use('/aff/*',   async (c, next) => { c.header('X-Robots-Tag', 'noindex, nofollow'); await next(); });

/**
 * Trang thanh toán mang mã đơn trên đường dẫn nên khách mở lại được bất cứ lúc
 * nào. Bản build tĩnh dùng chung; JS trên trang đọc mã từ URL rồi gọi API.
 */
app.get('/thanh-toan/:code', async (c) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  return c.env.ASSETS.fetch(new Request(new URL('/thanh-toan.html', c.req.url)));
});

app.get('/cam-on/:code', async (c) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  return c.env.ASSETS.fetch(new Request(new URL('/cam-on.html', c.req.url)));
});

// Mọi đường dẫn còn lại rơi về file tĩnh do `npm run build:pages` sinh ra.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,

  /** 03:00 giờ Việt Nam mỗi ngày. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyJobs(env));
  },
} satisfies ExportedHandler<Env>;
