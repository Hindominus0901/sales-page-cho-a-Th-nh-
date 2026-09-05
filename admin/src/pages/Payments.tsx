import { useState } from 'react';
import { api, vnd, dateTime } from '../api';
import { Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Payment {
  id: string; provider_tx_id: string; amount: number; content: string | null;
  transaction_date: string | null; status: string; createdAtText: string;
}
interface Candidate {
  order_code: string; full_name: string; phone: string;
  amount_total: number; amount_paid: number; created_at: number;
}

/**
 * Màn hình quan trọng nhất khi có sự cố: mỗi dòng ở đây là một khách đã chuyển
 * tiền mà hệ thống chưa nhận ra. Gán tay chạy đúng cùng đường code mà webhook
 * dùng, nên không thể quên tạo học viên hay hoa hồng.
 */
export default function Payments() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } =
    useLoad<{ payments: Payment[]; candidateOrders: Candidate[] }>(
      () => api.get('/api/admin/payments/unmatched'));

  async function assign(paymentId: string, orderCode: string) {
    if (!orderCode) return;
    setBusy(paymentId);
    try {
      const r = await api.post<{ fulfilled: boolean; order: { status: string } }>(
        `/api/admin/payments/${paymentId}/assign`, { orderCode });
      toast.show(r.fulfilled
        ? `Đã gán và hoàn tất đơn ${orderCode} — học viên và hoa hồng đã được tạo.`
        : `Đã gán vào đơn ${orderCode} (đơn vẫn chưa đủ tiền).`);
      reload();
    } catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(null); }
  }

  async function ignore(paymentId: string) {
    setBusy(paymentId);
    try { await api.post(`/api/admin/payments/${paymentId}/ignore`); toast.show('Đã bỏ qua giao dịch.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(null); }
  }

  if (loading) return <Loading what="giao dịch" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Giao dịch chưa khớp</h1>
          <p>
            Tiền đã về tài khoản nhưng nội dung chuyển khoản không chứa mã đơn đọc được.
            Gán đúng đơn ở đây thì hệ thống tạo học viên, ghi danh và hoa hồng y như khi
            khớp tự động.
          </p>
        </div>
        <button className="btn" onClick={reload}>Làm mới</button>
      </div>

      {data.payments.length === 0 ? (
        <Empty>Không có giao dịch nào cần xử lý tay. Mọi khoản tiền về đều đã khớp đúng đơn.</Empty>
      ) : (
        <div className="stack">
          {data.payments.map((p) => {
            // Ưu tiên đơn có số tiền khớp — gần như luôn là đơn đúng.
            const exact = data.candidateOrders.filter(
              (o) => o.amount_total - o.amount_paid === p.amount);
            const others = data.candidateOrders.filter((o) => !exact.includes(o));

            return (
              <div className="card card-pad" key={p.id}>
                <div className="spread" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{vnd(p.amount)}</div>
                    <div className="note">
                      {p.transaction_date ?? p.createdAtText} · mã giao dịch{' '}
                      <span className="mono">{p.provider_tx_id}</span>
                    </div>
                    <div className="mono" style={{ marginTop: 7, background: 'rgba(0,0,0,.04)',
                         padding: '7px 11px', borderRadius: 8, wordBreak: 'break-all' }}>
                      {p.content || '(nội dung chuyển khoản trống)'}
                    </div>
                  </div>
                  <button className="btn sm danger" disabled={busy === p.id}
                          onClick={() => ignore(p.id)}>Không liên quan</button>
                </div>

                {data.candidateOrders.length === 0 ? (
                  <p className="note">Không có đơn nào đang chờ để gán.</p>
                ) : (
                  <div className="row">
                    <select className="input" defaultValue="" id={`sel-${p.id}`} style={{ minWidth: 300 }}>
                      <option value="">— Chọn đơn để gán —</option>
                      {exact.length > 0 && (
                        <optgroup label="Số tiền khớp chính xác">
                          {exact.map((o) => (
                            <option key={o.order_code} value={o.order_code}>
                              {o.order_code} · {o.full_name} · {vnd(o.amount_total - o.amount_paid)} còn thiếu
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {others.length > 0 && (
                        <optgroup label="Các đơn đang chờ khác">
                          {others.map((o) => (
                            <option key={o.order_code} value={o.order_code}>
                              {o.order_code} · {o.full_name} · {vnd(o.amount_total)} · {dateTime(o.created_at)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button className="btn primary" disabled={busy === p.id} onClick={() => {
                      const el = document.getElementById(`sel-${p.id}`) as HTMLSelectElement | null;
                      assign(p.id, el?.value ?? '');
                    }}>Gán vào đơn này</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
