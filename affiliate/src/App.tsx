import { useEffect, useState } from 'react';
import { api, setCsrf, vnd } from './api';
import { Badge, Stat, Loading, ErrorBox, Empty, useLoad, useToast } from './ui';

interface Me {
  affiliate: {
    id: string; code: string; name: string; email: string; ratePercent: number;
    bank_name: string | null; bank_account_no: string | null; bank_account_name: string | null;
    payout_threshold: number; phone: string | null;
  };
  csrfToken: string | null;
  baseUrl: string;
}

const NAV: [string, string][] = [
  ['/', 'Tổng quan'], ['/links', 'Link giới thiệu'],
  ['/hoa-hong', 'Hoa hồng & rút tiền'], ['/tai-khoan', 'Tài khoản'],
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  async function loadMe() {
    try { const m = await api.get<Me>('/api/aff/me'); setCsrf(m.csrfToken); setMe(m); }
    catch { setMe(null); }
    finally { setReady(true); }
  }
  useEffect(() => { loadMe(); }, []);

  if (!ready) return <div className="center-screen muted">Đang tải…</div>;
  if (!me) return <Login onDone={loadMe} />;

  async function logout() {
    await api.post('/api/aff/logout').catch(() => {});
    setCsrf(null); setMe(null);
  }

  return (
    <div className="shell">
      <nav className="side">
        <div className="side-brand">Cộng tác viên</div>
        {NAV.map(([href, label]) => (
          <a key={href} href={`#${href}`} className={hash === href ? 'on' : ''}>{label}</a>
        ))}
        <div className="side-foot">
          <div className="who">{me.affiliate.name} · {me.affiliate.code}</div>
          <button className="btn sm" style={{ width: '100%' }} onClick={logout}>Đăng xuất</button>
        </div>
      </nav>
      <main className="main">
        {hash === '/' && <Overview />}
        {hash === '/links' && <Links />}
        {hash === '/hoa-hong' && <Commissions threshold={me.affiliate.payout_threshold} />}
        {hash === '/tai-khoan' && <Account me={me} onSaved={loadMe} />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/api/aff/login', { email, password }); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="center-screen">
      <form className="card card-pad" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <h1 style={{ marginBottom: 4 }}>Cộng tác viên</h1>
        <p className="note" style={{ margin: '0 0 20px' }}>Góc Creator</p>
        {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="field">
          <label htmlFor="em">Email</label>
          <input id="em" className="input" type="email" required autoComplete="username"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Mật khẩu</label>
          <input id="pw" className="input" type="password" required autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Đang kiểm tra…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}

interface Stats {
  totals: Record<string, number>;
  orders: {
    order_code: string; status: string; amount_total: number; created_at: number;
    commission_amount: number | null; commission_status: string | null;
    commissionStatusLabel: string | null; holdReasonLabel: string | null;
    buyer_masked: string;
  }[];
  clicksByDay: { click_date: string; n: number }[];
}

function Overview() {
  const { data, error, loading } = useLoad<Stats>(() => api.get('/api/aff/stats'));
  if (loading) return <Loading what="số liệu" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const t = data.totals;

  return (
    <>
      <div className="head">
        <div>
          <h1>Tổng quan</h1>
          <p>
            Hoa hồng tính theo lần chạm <b>đầu tiên</b> và giữ trong 90 ngày: khách bấm link
            của anh chị trước thì dù sau đó bấm link người khác, hoa hồng vẫn thuộc về anh chị.
          </p>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat tone="good" value={vnd(t.available_amount ?? 0)} label="có thể rút ngay" />
        <Stat value={vnd(t.pending_amount ?? 0)} label="đang chờ đủ điều kiện" />
        <Stat value={vnd(t.paid_amount ?? 0)} label="đã nhận" />
        <Stat tone="accent" value={t.paid_orders ?? 0} label="đơn đã thanh toán" />
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <Stat value={t.clicks ?? 0} label="lượt bấm link" />
        <Stat value={t.leads ?? 0} label="người để lại thông tin" />
        <Stat value={t.orders ?? 0} label="đơn được tạo" />
      </div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 12 }}>Đơn hàng từ link của anh chị</h2>
        {data.orders.length === 0 ? (
          <p className="note">
            Chưa có đơn nào. Anh chị lấy link ở mục "Link giới thiệu" và chia sẻ để bắt đầu.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Đơn</th><th>Khách</th><th className="right">Giá trị</th>
                    <th className="right">Hoa hồng</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.order_code}>
                    <td className="mono">{o.order_code}</td>
                    <td className="muted">{o.buyer_masked}</td>
                    <td className="right">{vnd(o.amount_total)}</td>
                    <td className="right"><b>{vnd(o.commission_amount)}</b></td>
                    <td>
                      {o.commissionStatusLabel
                        ? <Badge kind={o.commission_status === 'paid' ? 'ok'
                            : o.commission_status === 'held' ? 'warm' : 'mute'}>
                            {o.commissionStatusLabel}
                          </Badge>
                        : <span className="muted">chưa thanh toán</span>}
                      {o.holdReasonLabel && (
                        <div className="note" style={{ color: 'var(--warm)' }}>{o.holdReasonLabel}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note" style={{ marginTop: 12 }}>
          Tên khách được che bớt — anh chị không cần biết thông tin liên hệ đầy đủ của họ.
        </p>
      </div>
    </>
  );
}

function Links() {
  const toast = useToast();
  const { data, error, loading } = useLoad<{
    code: string; links: { label: string; url: string }[]; note: string;
  }>(() => api.get('/api/aff/links'));

  if (loading) return <Loading what="link" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Link giới thiệu</h1>
          <p>{data.note}</p>
        </div>
      </div>
      <div className="stack">
        {data.links.map((l) => (
          <div className="card card-pad" key={l.url}>
            <div className="note" style={{ fontWeight: 600, marginBottom: 6 }}>{l.label}</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input mono" readOnly value={l.url}
                     onFocus={(e) => e.currentTarget.select()} />
              <button className="btn" onClick={() => {
                navigator.clipboard?.writeText(l.url)
                  .then(() => toast.show('Đã sao chép link.'))
                  .catch(() => toast.fail('Trình duyệt không cho sao chép, anh chị chọn rồi copy tay giúp em.'));
              }}>Sao chép</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Commissions({ threshold }: { threshold: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const stats = useLoad<Stats>(() => api.get('/api/aff/stats'));
  const payouts = useLoad<{
    payouts: { id: string; payout_code: string; amount: number; item_count: number;
               status: string; statusLabel: string; requestedAtText: string;
               payment_reference: string | null; rejected_reason: string | null }[];
  }>(() => api.get('/api/aff/payouts'));

  async function request() {
    setBusy(true);
    try {
      const r = await api.post<{ amount: number; payoutCode: string }>('/api/aff/payouts');
      toast.show(`Đã gửi yêu cầu rút ${vnd(r.amount)} (${r.payoutCode}).`);
      stats.reload(); payouts.reload();
    } catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(false); }
  }

  const available = stats.data?.totals.available_amount ?? 0;

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Hoa hồng &amp; rút tiền</h1>
          <p>
            Hoa hồng được duyệt sau khi qua cửa sổ hoàn tiền của khách. Rút được khi số dư
            đã duyệt đạt tối thiểu <b>{vnd(threshold)}</b>.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="spread">
          <div>
            <div className="note">Có thể rút ngay</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{vnd(available)}</div>
          </div>
          <button className="btn primary" disabled={busy || available < threshold} onClick={request}>
            {busy ? 'Đang gửi…' : 'Yêu cầu rút tiền'}
          </button>
        </div>
        {available < threshold && (
          <p className="note" style={{ marginTop: 10 }}>
            Còn thiếu {vnd(threshold - available)} nữa là rút được.
          </p>
        )}
      </div>

      <h2 style={{ marginBottom: 12 }}>Lịch sử rút tiền</h2>
      {payouts.loading && <Loading what="lịch sử" />}
      {payouts.data?.payouts.length === 0 && <Empty>Anh chị chưa có yêu cầu rút tiền nào.</Empty>}
      {payouts.data && payouts.data.payouts.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Mã đợt</th><th className="right">Số tiền</th><th>Trạng thái</th>
                       <th>Yêu cầu lúc</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {payouts.data.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.payout_code}</td>
                  <td className="right"><b>{vnd(p.amount)}</b></td>
                  <td><Badge kind={p.status === 'paid' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warm'}>
                    {p.statusLabel}</Badge></td>
                  <td className="muted" style={{ fontSize: 13 }}>{p.requestedAtText}</td>
                  <td className="note">
                    {p.payment_reference && <>Mã giao dịch: <span className="mono">{p.payment_reference}</span></>}
                    {p.rejected_reason && <span style={{ color: 'var(--danger)' }}>{p.rejected_reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Account({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const toast = useToast();
  const a = me.affiliate;
  const [bank, setBank] = useState({
    bankName: a.bank_name ?? '', accountNo: a.bank_account_no ?? '',
    accountName: a.bank_account_name ?? '', phone: a.phone ?? '',
  });
  const [pw, setPw] = useState({ current: '', next: '' });

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    try { await api.patch('/api/aff/bank', bank); toast.show('Đã lưu tài khoản ngân hàng.'); onSaved(); }
    catch (err) { toast.fail((err as Error).message); }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/aff/password', pw);
      setPw({ current: '', next: '' });
      toast.show('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.');
    } catch (err) { toast.fail((err as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Tài khoản</h1>
          <p>Tỉ lệ hoa hồng của anh chị: <b>{a.ratePercent}%</b> · mã giới thiệu{' '}
             <span className="mono">{a.code}</span></p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card card-pad" onSubmit={saveBank}>
          <h2 style={{ marginBottom: 4 }}>Tài khoản nhận tiền</h2>
          <p className="note" style={{ margin: '0 0 14px' }}>
            Phải điền đủ trước khi yêu cầu rút. Tên chủ tài khoản viết hoa không dấu, đúng như
            trên ứng dụng ngân hàng.
          </p>
          <div className="field">
            <label>Ngân hàng</label>
            <input className="input" required placeholder="Techcombank" value={bank.bankName}
                   onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
          </div>
          <div className="field">
            <label>Số tài khoản</label>
            <input className="input mono" required value={bank.accountNo}
                   onChange={(e) => setBank({ ...bank, accountNo: e.target.value })} />
          </div>
          <div className="field">
            <label>Tên chủ tài khoản</label>
            <input className="input" required placeholder="NGUYEN VAN A" value={bank.accountName}
                   onChange={(e) => setBank({ ...bank, accountName: e.target.value.toUpperCase() })} />
          </div>
          <div className="field">
            <label>Số điện thoại</label>
            <input className="input" value={bank.phone}
                   onChange={(e) => setBank({ ...bank, phone: e.target.value })} />
          </div>
          <button type="submit" className="btn primary">Lưu</button>
        </form>

        <form className="card card-pad" onSubmit={savePw}>
          <h2 style={{ marginBottom: 14 }}>Đổi mật khẩu</h2>
          <div className="field">
            <label>Mật khẩu hiện tại</label>
            <input className="input" type="password" required autoComplete="current-password"
                   value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div className="field">
            <label>Mật khẩu mới (ít nhất 8 ký tự)</label>
            <input className="input" type="password" required minLength={8} autoComplete="new-password"
                   value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <button type="submit" className="btn primary">Đổi mật khẩu</button>
          <p className="note" style={{ marginTop: 10 }}>
            Đổi xong, mọi thiết bị khác đang đăng nhập sẽ bị đăng xuất.
          </p>
        </form>
      </div>
    </>
  );
}
