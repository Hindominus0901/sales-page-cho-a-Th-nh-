import { useEffect, useState } from 'react';
import { api, setCsrf } from './api';
import Login from './Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Payments from './pages/Payments';
import Affiliates from './pages/Affiliates';
import Commissions from './pages/Commissions';
import Payouts from './pages/Payouts';
import Workshops from './pages/Workshops';
import Students from './pages/Students';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';
import Staff from './pages/Staff';
import Submissions from './pages/Submissions';
import Leaderboard from './pages/Leaderboard';
import Rewards from './pages/Rewards';
import Mechanics from './pages/Mechanics';
import { Icon } from './icons';

interface Me { user: { id: string; name: string; email: string; role: string }; csrfToken: string | null }

/**
 * Router dựa trên hash. Đủ cho một trang quản trị nội bộ, và tránh phải kéo
 * thêm thư viện định tuyến vào bundle.
 */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const [path, qs] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? '') };
}

interface NavItem { href: string; label: string; icon: string; badge?: string }

/**
 * Chia nhóm theo việc: bán hàng, học viên, cộng tác viên, hệ thống.
 * Danh sách phẳng mười một mục thì phải đọc hết mới tìm được thứ cần.
 */
const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Bán hàng', items: [
    { href: '/',           label: 'Tổng quan',  icon: 'overview' },
    { href: '/leads',      label: 'Lead',       icon: 'leads' },
    { href: '/don-hang',   label: 'Đơn hàng',   icon: 'orders' },
    { href: '/thanh-toan', label: 'Giao dịch chưa khớp', icon: 'payments', badge: 'unmatched_payments' },
    { href: '/workshop',   label: 'Workshop',   icon: 'workshop' },
  ]},
  { section: 'Học viên', items: [
    { href: '/hoc-vien',   label: 'Học viên',   icon: 'students' },
    { href: '/duyet-bai',  label: 'Duyệt bài',  icon: 'approval', badge: 'pending_submissions' },
    { href: '/xep-hang',   label: 'Bảng xếp hạng', icon: 'rank' },
    { href: '/qua-tang',   label: 'Quà tặng',   icon: 'rewards', badge: 'pending_redemptions' },
  ]},
  { section: 'Cộng tác viên', items: [
    { href: '/ctv',        label: 'Cộng tác viên', icon: 'affiliate', badge: 'pending_affiliates' },
    { href: '/hoa-hong',   label: 'Hoa hồng',   icon: 'commission', badge: 'held_commissions' },
    { href: '/chi-tra',    label: 'Chi trả',    icon: 'payouts', badge: 'pending_payouts' },
  ]},
  { section: 'Hệ thống', items: [
    { href: '/co-che',     label: 'Cơ chế',     icon: 'mechanics' },
    { href: '/cai-dat',    label: 'Cài đặt',    icon: 'settings' },
    { href: '/nhan-su',    label: 'Nhân sự',    icon: 'staff' },
    { href: '/nhat-ky',    label: 'Nhật ký',    icon: 'audit' },
  ]},
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const { path, query } = useHashRoute();

  async function loadMe() {
    try {
      const m = await api.get<Me>('/api/admin/me');
      setCsrf(m.csrfToken);
      setMe(m);
    } catch { setMe(null); }
    finally { setReady(true); }
  }
  useEffect(() => { loadMe(); }, []);

  /**
   * Số việc tồn hiện thẳng trên sidebar. Làm mới mỗi phút và sau mỗi lần đổi
   * màn hình, để anh Thành không phải tải lại trang mới thấy có bài mới nộp.
   */
  useEffect(() => {
    if (!me) return;
    let live = true;
    const tick = () => {
      api.get<{ todo: Record<string, number> }>('/api/admin/stats?days=7')
        .then((s) => { if (live) setBadges(s.todo ?? {}); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { live = false; clearInterval(t); };
  }, [me, path]);

  if (!ready) return <div className="center-screen muted">Đang tải…</div>;
  if (!me) return <Login onDone={loadMe} />;

  async function logout() {
    await api.post('/api/admin/logout').catch(() => {});
    setCsrf(null); setMe(null);
  }

  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">Góc Creator</div>
        {NAV.map((group) => (
          <div key={group.section} style={{ display: 'contents' }}>
            <div className="side-sec">{group.section}</div>
            {group.items.map((item) => {
              const on = path === item.href || (item.href !== '/' && path.startsWith(item.href));
              const n = item.badge ? badges[item.badge] ?? 0 : 0;
              return (
                <a key={item.href} href={`#${item.href}`} className={`navitem ${on ? 'on' : ''}`}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {n > 0 && <span className="badge-n">{n}</span>}
                </a>
              );
            })}
          </div>
        ))}
        <div className="side-foot">
          <div className="who note" style={{ marginBottom: 9 }}>{me.user.name}</div>
          <button className="btn sm" style={{ width: '100%' }} onClick={logout}>Đăng xuất</button>
        </div>
      </nav>

      <main className="main">
        <Route path={path} query={query} />
      </main>
    </div>
  );
}

function Route({ path, query }: { path: string; query: URLSearchParams }) {
  if (path === '/') return <Dashboard />;
  if (path === '/leads') return <Leads query={query} />;
  if (path.startsWith('/leads/')) return <LeadDetail id={path.slice(7)} />;
  if (path === '/don-hang') return <Orders query={query} />;
  if (path.startsWith('/don-hang/')) return <OrderDetail code={path.slice(10)} />;
  if (path === '/thanh-toan') return <Payments />;
  if (path === '/hoc-vien') return <Students />;
  if (path === '/workshop') return <Workshops />;
  if (path === '/ctv') return <Affiliates />;
  if (path === '/hoa-hong') return <Commissions query={query} />;
  if (path === '/chi-tra') return <Payouts />;
  if (path === '/cai-dat') return <Settings />;
  if (path === '/duyet-bai') return <Submissions />;
  if (path === '/xep-hang') return <Leaderboard />;
  if (path === '/qua-tang') return <Rewards />;
  if (path === '/co-che') return <Mechanics />;
  if (path === '/nhan-su') return <Staff />;
  if (path === '/nhat-ky') return <AuditLog />;
  return <div className="card card-pad">Không có trang này. <a href="#/">Về tổng quan</a></div>;
}
