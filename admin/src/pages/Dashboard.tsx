import { api, vnd, relativeTime, displayPhone } from '../api';
import { Kpi, Bars, ScoreBadge, LeadStatus, Loading, ErrorBox, useLoad } from '../ui';

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
  { key: 'unmatched_payments',  label: 'giao dịch chưa khớp đơn',       href: '#/thanh-toan' },
  { key: 'pending_submissions', label: 'bài nộp chờ duyệt',             href: '#/duyet-bai' },
  { key: 'pending_redemptions', label: 'yêu cầu đổi quà chờ duyệt',     href: '#/qua-tang' },
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
  const tongLead = data.sources.reduce((a, s) => a + s.n, 0);
  const leadWon = data.sources.reduce((a, s) => a + s.won, 0);

  // Gộp phễu 30 ngày để ra tỉ lệ chuyển đổi — con số nói được phễu rò ở đâu.
  const sum = data.funnel.reduce(
    (a, r) => ({
      views: a.views + r.views, leads: a.leads + r.leads,
      orders: a.orders + r.orders, paid: a.paid + r.paid_orders, revenue: a.revenue + r.revenue,
    }),
    { views: 0, leads: 0, orders: 0, paid: 0, revenue: 0 },
  );
  const pct = (num: number, den: number) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

  // Gom doanh thu theo tuần: 30 cột ngày quá dày để đọc ra xu hướng.
  const tuan: { label: string; value: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const from = data.funnel.length - (8 - i) * 7;
    const slice = data.funnel.slice(Math.max(0, from), Math.max(0, from + 7));
    tuan.push({
      label: `T${i + 1}`,
      value: slice.reduce((a, r) => a + r.revenue, 0),
    });
  }

  return (
    <div className="stack">
      {todo.length > 0 && (
        <div className="card card-pad" style={{ borderColor: 'rgba(185,28,28,.28)' }}>
          <h2 style={{ marginBottom: 10 }}>Cần anh xử lý</h2>
          <div className="stack" style={{ gap: 8 }}>
            {todo.map((x) => (
              <a key={x.key} href={x.href} className="spread"
                 style={{ textDecoration: 'none', color: 'inherit', padding: '8px 12px',
                          background: 'var(--xau-nen)', borderRadius: 10 }}>
                <span><b style={{ color: 'var(--xau)' }}>{data.todo[x.key]}</b> {x.label}</span>
                <span className="muted">xem →</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-4">
        <Kpi tone="dark" label={`Chỗ còn lại / ${t.seatsTotal ?? '—'}`} value={t.seatsLeft ?? '—'}
             delta={t.startDate ? `khai giảng ${t.startDate}` : 'chưa đặt ngày khai giảng'}
             deltaTone={t.startDate ? 'mute' : 'warn'} />
        <Kpi tone="accent" label="Doanh thu đã xác nhận" value={vnd(t.revenue ?? 0)}
             delta={`${t.paid_orders ?? 0} đơn đã thanh toán`} deltaTone="good" />
        <Kpi label="Học viên" value={t.students ?? 0}
             delta={`${t.active_today ?? 0} người nộp bài hôm nay`}
             deltaTone={(t.active_today ?? 0) > 0 ? 'good' : 'warn'} />
        <Kpi label="Bài đã duyệt hôm nay" value={t.approved_today ?? 0}
             delta={`${data.todo.pending_submissions ?? 0} bài còn chờ`}
             deltaTone={(data.todo.pending_submissions ?? 0) > 0 ? 'warn' : 'good'} />
      </div>

      <div className="grid grid-4">
        <Kpi label="Tổng số lead" value={t.leads ?? 0}
             delta={`${band('hot')} lead nóng đang mở`}
             deltaTone={band('hot') > 0 ? 'bad' : 'mute'} />
        <Kpi label="Đơn chờ chuyển khoản" value={t.pending_orders ?? 0}
             delta="tự huỷ sau 48 giờ nếu không có tiền về" />
        <Kpi label="Hoa hồng còn nợ CTV" value={vnd(t.commission_owed ?? 0)}
             delta={`${data.todo.pending_payouts ?? 0} yêu cầu rút chờ duyệt`}
             deltaTone={(data.todo.pending_payouts ?? 0) > 0 ? 'warn' : 'mute'} />
        {/* Tính trên chính bảng lead (đã chốt / tổng lead), KHÔNG lấy số đơn chia
            số lead: đơn có thể tồn tại mà không gắn lead nào, và tỉ lệ khi đó
            vọt lên trên 100% — vô nghĩa. */}
        <Kpi label="Lead đã chốt"
             value={tongLead ? `${Math.round((leadWon / tongLead) * 100)}%` : '—'}
             delta={`${leadWon}/${tongLead} lead`} deltaTone="mute" />
      </div>

      <div className="card card-pad">
        <h2 style={{ marginBottom: 4 }}>Phễu 30 ngày</h2>
        <p className="note" style={{ margin: '0 0 14px' }}>
          Tỉ lệ tính trên bước liền trước, để thấy phễu rò ở đâu.
        </p>
        <div className="grid grid-4" style={{ marginBottom: 18 }}>
          <Kpi label="Lượt xem trang" value={sum.views} />
          <Kpi label="Lead thu được" value={sum.leads} delta={`${pct(sum.leads, sum.views)} số người xem`} />
          <Kpi label="Đơn được tạo" value={sum.orders} delta={`${pct(sum.orders, sum.leads)} số lead`} />
          <Kpi label="Đơn trả tiền" value={sum.paid} delta={`${pct(sum.paid, sum.orders)} số đơn`}
               deltaTone="good" />
        </div>

        <div className="spread" style={{ marginBottom: 10 }}>
          <h3>Doanh thu 8 tuần gần nhất</h3>
          <span className="note">{vnd(sum.revenue)} trong 30 ngày</span>
        </div>
        <Bars data={tuan} />
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
