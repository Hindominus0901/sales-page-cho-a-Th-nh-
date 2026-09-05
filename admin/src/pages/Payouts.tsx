import { useState } from 'react';
import { api, vnd, dateTime } from '../api';
import { Badge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Payout {
  id: string; payout_code: string; amount: number; item_count: number; status: string;
  statusLabel: string; requestedAtText: string; paid_at: number | null;
  payment_reference: string | null; rejected_reason: string | null;
  bank_name: string | null; bank_account_no: string | null; bank_account_name: string | null;
  affiliate_code: string; affiliate_name: string;
}

const KIND: Record<string, string> = {
  requested: 'warm', approved: 'ok', paid: 'ok', rejected: 'bad', cancelled: 'mute',
};

export default function Payouts() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<{ payouts: Payout[] }>(
    () => api.get('/api/admin/payouts'));

  async function act(id: string, action: string, body?: Record<string, string>) {
    setBusy(id);
    try { await api.post(`/api/admin/payouts/${id}/${action}`, body ?? {}); toast.show('Đã cập nhật.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Chi trả hoa hồng</h1>
          <p>
            Anh chuyển khoản cho CTV bằng app ngân hàng, rồi quay lại đây bấm "Đã chuyển" kèm
            mã giao dịch. Mã đó là thứ đối chiếu được với sao kê nếu về sau CTV nói chưa nhận được.
          </p>
        </div>
      </div>

      {loading && <Loading what="đợt chi" />}
      {error && <ErrorBox message={error} />}
      {data && data.payouts.length === 0 && <Empty>Chưa có yêu cầu rút tiền nào.</Empty>}

      {data && data.payouts.length > 0 && (
        <div className="stack">
          {data.payouts.map((p) => (
            <div className="card card-pad" key={p.id}>
              <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div className="row">
                    <span className="mono" style={{ fontWeight: 700 }}>{p.payout_code}</span>
                    <Badge kind={KIND[p.status] ?? 'mute'}>{p.statusLabel}</Badge>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{vnd(p.amount)}</div>
                  <div className="note">
                    {p.affiliate_name} (<span className="mono">{p.affiliate_code}</span>) ·{' '}
                    {p.item_count} hoa hồng · yêu cầu {p.requestedAtText}
                  </div>
                </div>

                <div className="row">
                  {p.status === 'requested' && (
                    <>
                      <button className="btn primary" disabled={busy === p.id}
                              onClick={() => act(p.id, 'approve')}>Duyệt</button>
                      <button className="btn danger" disabled={busy === p.id} onClick={() => {
                        const reason = prompt('Lý do từ chối (CTV sẽ thấy):');
                        if (reason) act(p.id, 'reject', { reason });
                      }}>Từ chối</button>
                    </>
                  )}
                  {p.status === 'approved' && (
                    <button className="btn primary" disabled={busy === p.id} onClick={() => {
                      const reference = prompt('Mã giao dịch ngân hàng (bắt buộc, để đối chiếu sao kê):');
                      if (reference) act(p.id, 'paid', { reference });
                    }}>Đã chuyển tiền</button>
                  )}
                </div>
              </div>

              {/* Thông tin ngân hàng chụp tại thời điểm yêu cầu: CTV đổi số tài
                  khoản sau đó không làm sai lịch sử chi trả. */}
              <div style={{ background: 'rgba(0,0,0,.03)', borderRadius: 10, padding: '11px 14px' }}>
                <div className="note" style={{ marginBottom: 4 }}>Chuyển tới</div>
                <div className="mono">
                  {p.bank_name} · {p.bank_account_no} · {p.bank_account_name}
                </div>
              </div>

              {p.payment_reference && (
                <div className="note" style={{ marginTop: 10 }}>
                  Đã chuyển {dateTime(p.paid_at)} · mã giao dịch{' '}
                  <span className="mono">{p.payment_reference}</span>
                </div>
              )}
              {p.rejected_reason && (
                <div className="note" style={{ marginTop: 10, color: 'var(--xau)' }}>
                  Từ chối: {p.rejected_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
