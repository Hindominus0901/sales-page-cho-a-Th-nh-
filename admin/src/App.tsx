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

const NAV: [string, string][] = [
  ['/',           'Tổng quan'],
  ['/leads',      'Lead'],
  ['/don-hang',   'Đơn hàng'],
  ['/thanh-toan', 'Giao dịch chưa khớp'],
  ['/hoc-vien',   'Học viên'],
  ['/workshop',   'Workshop'],
  ['/ctv',        'Cộng tác viên'],
  ['/hoa-hong',   'Hoa hồng'],
  ['/chi-tra',    'Chi trả'],
  ['/cai-dat',    'Cài đặt'],
  ['/nhat-ky',    'Nhật ký'],
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
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
        {NAV.map(([href, label]) => (
          <a key={href} href={`#${href}`}
             className={path === href || (href !== '/' && path.startsWith(href)) ? 'on' : ''}>
            {label}
          </a>
        ))}
        <div className="side-foot">
          <div className="who">{me.user.name}</div>
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
  if (path === '/nhat-ky') return <AuditLog />;
  return <div className="card card-pad">Không có trang này. <a href="#/">Về tổng quan</a></div>;
}
