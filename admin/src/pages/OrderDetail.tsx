import { api, vnd, dateTime, displayPhone } from '../api';
import { OrderStatus, Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Detail {
  order: Record<string, unknown> & {
    order_code: string; full_name: string; phone: string; email: string | null;
    field: string | null; note: string | null;
    amount_total: number; amount_paid: number; status: string;
    created_at: number; paid_at: number | null; affiliate_code: string | null;
  };
  payments: {
    provider_tx_id: string; amount: number; direction: string; status: string;
    match_method: string | null; content: string | null; created_at: number;
  }[];
}

const MATCH_LABEL: Record<string, string> = {
  auto_code: 'Tự khớp theo mã đơn',
  auto_amount_phone: 'Tự khớp theo số tiền + số điện thoại',
  manual: 'Admin gán tay',
  none: 'Chưa khớp',
};

export default function OrderDetail({ code }: { code: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<Detail>(
    () => api.get(`/api/admin/orders/${code}`), [code]);

  if (loading) return <Loading what="đơn hàng" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const o = data.order;
  const remaining = o.amount_total - o.amount_paid;

  async function cancel() {
    try { await api.post(`/api/admin/orders/${code}/cancel`); toast.show('Đã huỷ đơn.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <a href="#/don-hang" className="note">← Về danh sách đơn</a>
          <h1 style={{ marginTop: 6 }} className="mono">{o.order_code}</h1>
          <p>{o.full_name} · <span className="mono">{displayPhone(o.phone)}</span>
             {o.email ? <> · {o.email}</> : null}</p>
        </div>
        <div className="row">
          <OrderStatus value={o.status} />
          {(o.status === 'pending' || o.status === 'expired') && (
            <button className="btn danger" onClick={cancel}>Huỷ đơn</button>
          )}
        </div>
      </div>

      {o.status === 'overpaid' && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          Khách đã chuyển <b>{vnd(o.amount_paid)}</b> cho đơn <b>{vnd(o.amount_total)}</b> —
          thừa <b>{vnd(o.amount_paid - o.amount_total)}</b>. Học viên đã được ghi danh bình thường;
          anh hoàn lại phần thừa cho khách.
        </div>
      )}
      {o.status === 'partially_paid' && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          Khách mới chuyển <b>{vnd(o.amount_paid)}</b>, còn thiếu <b>{vnd(remaining)}</b>.
          Trang thanh toán đang hiện mã QR cho đúng phần còn lại; khi tiền về đủ, đơn tự hoàn tất.
        </div>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Thông tin đơn</h2>
          <table>
            <tbody>
              <tr><td className="note">Học phí</td><td className="right">{vnd(o.amount_total)}</td></tr>
              <tr><td className="note">Đã nhận</td><td className="right"><b>{vnd(o.amount_paid)}</b></td></tr>
              {remaining > 0 && (
                <tr><td className="note">Còn thiếu</td>
                    <td className="right" style={{ color: 'var(--canh)', fontWeight: 700 }}>{vnd(remaining)}</td></tr>
              )}
              <tr><td className="note">Tạo lúc</td><td className="right">{dateTime(o.created_at)}</td></tr>
              <tr><td className="note">Thanh toán lúc</td><td className="right">{dateTime(o.paid_at)}</td></tr>
              <tr><td className="note">CTV giới thiệu</td>
                  <td className="right mono">{o.affiliate_code ?? '—'}</td></tr>
              {o.field && <tr><td className="note">Lĩnh vực</td><td className="right">{o.field}</td></tr>}
            </tbody>
          </table>
          {o.note && (
            <div style={{ marginTop: 14 }}>
              <div className="note" style={{ fontWeight: 600 }}>Khách viết</div>
              <div>{o.note}</div>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Các lần chuyển khoản</h2>
          {data.payments.length === 0 ? (
            <p className="note">Chưa nhận được khoản nào cho đơn này.</p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {data.payments.map((p) => (
                <div key={p.provider_tx_id} style={{ borderLeft: '2px solid var(--vien)', paddingLeft: 12 }}>
                  <div className="spread">
                    <b>{vnd(p.amount)}</b>
                    <span className="note">{dateTime(p.created_at)}</span>
                  </div>
                  <div className="note">
                    {MATCH_LABEL[p.match_method ?? 'none'] ?? p.match_method} · mã giao dịch{' '}
                    <span className="mono">{p.provider_tx_id}</span>
                  </div>
                  {p.content && (
                    <div className="mono note" style={{ marginTop: 4, wordBreak: 'break-all' }}>{p.content}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
