import { useState } from 'react';
import { api, vnd, dateTime, displayPhone } from '../api';
import { OrderStatus, Loading, ErrorBox, Empty, useLoad } from '../ui';

interface Order {
  id: string; order_code: string; full_name: string; phone: string; email: string | null;
  amount_total: number; amount_paid: number; status: string;
  created_at: number; paid_at: number | null; affiliate_code: string | null;
}

const STATUSES = [
  ['', 'Mọi trạng thái'], ['pending', 'Chờ chuyển khoản'], ['partially_paid', 'Chuyển thiếu'],
  ['paid', 'Đã thanh toán'], ['overpaid', 'Thừa tiền'], ['expired', 'Hết hạn'], ['cancelled', 'Đã huỷ'],
];

export default function Orders({ query }: { query: URLSearchParams }) {
  const [status, setStatus] = useState(query.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (applied) qs.set('q', applied);

  const { data, error, loading } = useLoad<{ orders: Order[] }>(
    () => api.get(`/api/admin/orders?${qs}`), [status, applied]);

  return (
    <>
      <div className="head">
        <div>
          <h1>Đơn hàng</h1>
          <p>
            Đơn <b>thừa tiền</b> cần hoàn lại phần dư; đơn <b>chuyển thiếu</b> đang chờ khách
            chuyển nốt và tự hoàn tất khi đủ.
          </p>
        </div>
      </div>

      <form className="bar" onSubmit={(e) => { e.preventDefault(); setApplied(search); }}>
        <input className="input" placeholder="Tìm mã đơn, tên, số điện thoại"
               value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn primary" type="submit">Tìm</button>
      </form>

      {loading && <Loading what="đơn hàng" />}
      {error && <ErrorBox message={error} />}
      {data && data.orders.length === 0 && <Empty>Chưa có đơn nào khớp bộ lọc.</Empty>}

      {data && data.orders.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Mã đơn</th><th>Khách</th><th className="right">Phải trả</th>
                  <th className="right">Đã nhận</th><th>Trạng thái</th><th>CTV</th><th>Tạo lúc</th></tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td><a className="mono" style={{ fontWeight: 700 }}
                         href={`#/don-hang/${o.order_code}`}>{o.order_code}</a></td>
                  <td>
                    {o.full_name}
                    <div className="muted mono" style={{ fontSize: 12 }}>{displayPhone(o.phone)}</div>
                  </td>
                  <td className="right">{vnd(o.amount_total)}</td>
                  <td className="right" style={{
                    fontWeight: o.amount_paid !== o.amount_total && o.amount_paid > 0 ? 700 : 400,
                    color: o.amount_paid > o.amount_total ? 'var(--canh)' : undefined,
                  }}>{vnd(o.amount_paid)}</td>
                  <td><OrderStatus value={o.status} /></td>
                  <td className="muted mono" style={{ fontSize: 13 }}>{o.affiliate_code ?? '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
