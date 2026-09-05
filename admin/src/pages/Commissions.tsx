import { useState } from 'react';
import { api, vnd, dateTime } from '../api';
import { Badge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Commission {
  id: string; amount: number; base_amount: number; rate: number; status: string;
  hold_reason: string | null; holdReasonLabel: string | null; statusLabel: string;
  availableAtText: string; available_at: number; created_at: number;
  affiliate_code: string; affiliate_name: string;
  order_code: string; buyer_name: string; buyer_phone: string;
}

const KIND: Record<string, string> = {
  pending: 'mute', held: 'warm', approved: 'ok',
  payout_requested: 'warm', paid: 'ok', void: 'bad', rejected: 'bad',
};

const FILTERS = [
  ['', 'Tất cả'], ['held', 'Đang treo'], ['pending', 'Chờ qua cửa sổ hoàn tiền'],
  ['approved', 'Đã duyệt'], ['payout_requested', 'Trong đợt chi'], ['paid', 'Đã chi'],
];

export default function Commissions({ query }: { query: URLSearchParams }) {
  const toast = useToast();
  const [status, setStatus] = useState(query.get('status') ?? '');
  const { data, error, loading, reload } = useLoad<{ commissions: Commission[] }>(
    () => api.get(`/api/admin/commissions${status ? `?status=${status}` : ''}`), [status]);

  async function act(id: string, action: string, reason?: string) {
    try { await api.post(`/api/admin/commissions/${id}/${action}`, { reason }); toast.show('Đã cập nhật.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Hoa hồng</h1>
          <p>
            Hoa hồng bị <b>treo</b> là những khoản hệ thống nghi cộng tác viên tự mua qua link
            của chính mình. Hệ thống treo lại chứ không huỷ, để anh xem rồi quyết — và để CTV
            còn khiếu nại được nếu đó là trùng hợp thật.
          </p>
        </div>
      </div>

      <div className="bar">
        {FILTERS.map(([v, l]) => (
          <button key={v} className={`btn sm ${status === v ? 'primary' : ''}`}
                  onClick={() => setStatus(v!)}>{l}</button>
        ))}
      </div>

      {loading && <Loading what="hoa hồng" />}
      {error && <ErrorBox message={error} />}
      {data && data.commissions.length === 0 && <Empty>Không có hoa hồng nào ở mục này.</Empty>}

      {data && data.commissions.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>CTV</th><th>Đơn</th><th className="right">Hoa hồng</th>
                  <th>Trạng thái</th><th>Đủ điều kiện từ</th><th></th></tr>
            </thead>
            <tbody>
              {data.commissions.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="mono" style={{ fontWeight: 700 }}>{c.affiliate_code}</span>
                    <div className="muted" style={{ fontSize: 12 }}>{c.affiliate_name}</div>
                  </td>
                  <td>
                    <a className="mono" href={`#/don-hang/${c.order_code}`}>{c.order_code}</a>
                    <div className="muted" style={{ fontSize: 12 }}>{c.buyer_name}</div>
                  </td>
                  <td className="right">
                    <b>{vnd(c.amount)}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{c.rate / 100}% của {vnd(c.base_amount)}</div>
                  </td>
                  <td>
                    <Badge kind={KIND[c.status] ?? 'mute'}>{c.statusLabel}</Badge>
                    {c.holdReasonLabel && (
                      <div className="note" style={{ color: 'var(--canh)', maxWidth: 220 }}>
                        {c.holdReasonLabel}
                      </div>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{c.availableAtText}</td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {c.status === 'held' && (
                        <>
                          <button className="btn sm primary" onClick={() => act(c.id, 'release')}>Bỏ treo</button>
                          <button className="btn sm danger" onClick={() => act(c.id, 'reject', 'Xác nhận tự giới thiệu')}>Từ chối</button>
                        </>
                      )}
                      {c.status === 'pending' && (
                        <button className="btn sm" onClick={() => act(c.id, 'approve')}>Duyệt sớm</button>
                      )}
                    </div>
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
