import { api, vnd, relativeTime, displayPhone } from '../api';
import { Stat, ScoreBadge, LeadStatus, Loading, ErrorBox, useLoad } from '../ui';

interface Stats {
  totals: Record<string, number | null>;
  todo: Record<string, number>;
  funnel: { stat_date: string; page_key: string; views: number; leads: number; orders: number; paid_orders: number; revenue: number }[];
  bands: { score_band: string; n: number }[];
  sources: { source: string; n: number; won: number }[];
  recentLeads: { id: string; code: string; full_name: string; phone: string; source: string; score: number; score_band: string; status: string; created_at: number }[];
}

const SOURCE_LABEL: Record<string, string> = {
  workshop: 'Workshop', ban_do: 'Bản Đồ 21 Ngày', consult: 'Đăng ký tư vấn',
  checkout: 'Điền form mua', manual: 'Nhập tay', import: 'Nhập từ file',
};

/**
 * Việc cần người xử lý đứng TRÊN mọi biểu đồ. Biểu đồ để hiểu xu hướng; những
 * dòng này là tiền đang kẹt và khách đang chờ.
 */
const TODO: { key: string; label: string; href: string }[] = [
  { key: 'unmatched_payments', label: 'giao dịch chưa khớp đơn',        href: '#/thanh-toan' },
  { key: 'hot_uncontacted',    label: 'lead NÓNG chưa ai gọi',          href: '#/leads?band=hot&status=new' },
  { key: 'overpaid_orders',    label: 'đơn khách chuyển thừa tiền',     href: '#/don-hang?status=overpaid' },
  { key: 'partial_orders',     label: 'đơn khách mới chuyển một phần',  href: '#/don-hang?status=partially_paid' },
  { key: 'held_commissions',   label: 'hoa hồng đang bị treo',          href: '#/hoa-hong?status=held' },
  { key: 'pending_payouts',    label: 'yêu cầu rút tiền chờ duyệt',     href: '#/chi-tra' },
  { key: 'pending_affiliates', label: 'cộng tác viên chờ duyệt',        href: '#/ctv' },
];

export default function Dashboard() {
  const { data, error, loading } = useLoad<Stats>(() => api.get<Stats>('/api/admin/stats?days=30'));
  if (loading) return <Loading what="bảng điều khiển" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const t = data.totals;
  const todo = TODO.filter((x) => (data.todo[x.key] ?? 0) > 0);
  const band = (b: string) => data.bands.find((x) => x.score_band === b)?.n ?? 0;

  // Gộp phễu 30 ngày để ra tỉ lệ chuyển đổi — con số nói được phễu rò ở đâu.
  const sum = data.funnel.reduce(
    (a, r) => ({
      views: a.views + r.views, leads: a.leads + r.leads,
      orders: a.orders + r.orders, paid: a.paid + r.paid_orders, revenue: a.revenue + r.revenue,
    }),
    { views: 0, leads: 0, orders: 0, paid: 0, revenue: 0 },
  );
  const pct = (num: number, den: number) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

  return (
    <div className="stack">
      {todo.length > 0 && (
        <div className="card card-pad" style={{ borderColor: 'rgba(185,28,28,.28)' }}>
          <h2 style={{ marginBottom: 10 }}>Cần anh xử lý</h2>
          <div className="stack" style={{ gap: 8 }}>
            {todo.map((x) => (
              <a key={x.key} href={x.href} className="spread"
                 style={{ textDecoration: 'none', color: 'inherit', padding: '8px 12px',
                          background: 'var(--danger-bg)', borderRadius: 10 }}>
                <span><b style={{ color: 'var(--danger)' }}>{data.todo[x.key]}</b> {x.label}</span>
                <span className="muted">xem →</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-4">
        <Stat tone="accent" value={t.seatsLeft ?? '—'}
              label={`chỗ còn lại / ${t.seatsTotal ?? '—'}`} />
        <Stat tone="good" value={vnd(t.revenue ?? 0)} label="doanh thu đã xác nhận" />
        <Stat value={t.paid_orders ?? 0} label="đơn đã thanh toán" />
        <Stat value={t.students ?? 0} label="học viên" />
      </div>

      <div className="grid grid-4">
        <Stat value={t.leads ?? 0} label="tổng số lead" />
        <Stat value={band('hot')} label="lead nóng đang mở" />
        <Stat value={t.pending_orders ?? 0} label="đơn chờ chuyển khoản" />
        <Stat value={vnd(t.commission_owed ?? 0)} label="hoa hồng còn nợ CTV" />
      </div>

      <div className="card card-pad">
        <h2 style={{ marginBottom: 4 }}>Phễu 30 ngày</h2>
        <p className="note" style={{ margin: '0 0 14px' }}>
          Tỉ lệ tính trên bước liền trước, để thấy phễu rò ở đâu.
        </p>
        <div className="grid grid-4">
          <Stat value={sum.views} label="lượt xem trang" />
          <Stat value={`${sum.leads} · ${pct(sum.leads, sum.views)}`} label="lead thu được" />
          <Stat value={`${sum.orders} · ${pct(sum.orders, sum.leads)}`} label="đơn được tạo" />
          <Stat value={`${sum.paid} · ${pct(sum.paid, sum.orders)}`} label="đơn trả tiền" />
        </div>
        {sum.views === 0 && (
          <p className="note" style={{ marginTop: 12 }}>
            Chưa có lượt xem nào được ghi nhận — số liệu sẽ xuất hiện sau khi trang chạy thật.
          </p>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Lead theo nguồn</h2>
          {data.sources.length === 0 ? <p className="note">Chưa có lead nào.</p> : (
            <table>
              <thead><tr><th>Nguồn</th><th className="right">Lead</th><th className="right">Đã chốt</th><th className="right">Tỉ lệ</th></tr></thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source}>
                    <td>{SOURCE_LABEL[s.source] ?? s.source}</td>
                    <td className="right">{s.n}</td>
                    <td className="right">{s.won}</td>
                    <td className="right">{pct(s.won, s.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Lead mới nhất</h2>
          {data.recentLeads.length === 0 ? <p className="note">Chưa có lead nào.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Họ tên</th><th>Điểm</th><th>Trạng thái</th><th>Lúc</th></tr></thead>
                <tbody>
                  {data.recentLeads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <a href={`#/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.full_name}</a>
                        <div className="muted mono" style={{ fontSize: 12 }}>{displayPhone(l.phone)}</div>
                      </td>
                      <td><ScoreBadge score={l.score} band={l.score_band} /></td>
                      <td><LeadStatus value={l.status} /></td>
                      <td className="muted" style={{ fontSize: 13 }}>{relativeTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
