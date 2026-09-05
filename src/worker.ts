import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, HonoEnv } from './types';
import { attribution } from './lib/affiliate/attribution';
import { publicRoutes } from './routes/public';
import { checkoutRoutes } from './routes/checkout';
import { webhookRoutes } from './routes/webhook-sepay';
import { adminAuthRoutes } from './routes/admin/auth';
import { adminDashboardRoutes } from './routes/admin/dashboard';
import { adminLeadRoutes } from './routes/admin/leads';
import { adminOrderRoutes } from './routes/admin/orders';
import { adminAffiliateRoutes } from './routes/admin/affiliates';
import { adminContentRoutes } from './routes/admin/content';
import { adminGameRoutes } from './routes/admin/game';
import { affiliateRoutes } from './routes/affiliate/portal';
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

/**
 * Đăng nhập/đăng xuất đứng TRƯỚC các route có guard: chúng phải gọi được khi
 * chưa có phiên. Các route quản trị còn lại tự gắn requireAdmin bên trong.
 */
app.route('/', adminAuthRoutes);
app.route('/', adminDashboardRoutes);
app.route('/', adminLeadRoutes);
app.route('/', adminOrderRoutes);
app.route('/', adminAffiliateRoutes);
app.route('/', adminContentRoutes);
app.route('/', adminGameRoutes);
app.route('/', affiliateRoutes);

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

/**
 * SPA quản trị và portal CTV: đường dẫn ĐIỀU HƯỚNG trả về index.html để router
 * phía trình duyệt tự xử lý.
 *
 * Loại trừ /assets/ và mọi đường dẫn có phần mở rộng file: nếu không, chính
 * file .js và .css của SPA cũng bị trả về index.html, trình duyệt nhận HTML
 * thay cho JavaScript và trang trắng hoàn toàn — không có lỗi mạng nào để lần.
 */
const spaShell = (mount: 'admin' | 'aff') => (c: Context<HonoEnv>) => {
  const path = new URL(c.req.url).pathname;
  const isFile = path.startsWith(`/${mount}/assets/`) || /\.[a-z0-9]{2,5}$/i.test(path);
  if (isFile) return c.env.ASSETS.fetch(c.req.raw);
  return c.env.ASSETS.fetch(new Request(new URL(`/${mount}/index.html`, c.req.url)));
};

app.get('/admin',   spaShell('admin'));
app.get('/admin/*', spaShell('admin'));
app.get('/aff',     spaShell('aff'));
app.get('/aff/*',   spaShell('aff'));

// Mọi đường dẫn còn lại rơi về file tĩnh do `npm run build:pages` sinh ra.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,

  /** 03:00 giờ Việt Nam mỗi ngày. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyJobs(env));
  },
} satisfies ExportedHandler<Env>;
