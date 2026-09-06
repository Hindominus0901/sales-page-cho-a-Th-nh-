import { useState } from 'react';
import { api } from '../api';
import { Badge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Mail {
  id: string; to_email: string; to_name: string | null; subject: string;
  template: string; ref_type: string | null; ref_id: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number; last_error: string | null;
  createdAtText: string; sentAtText: string | null;
}

const NHAN: Record<string, string> = {
  pending: 'Đang chờ gửi', sent: 'Đã gửi', failed: 'Lỗi', skipped: 'Bỏ qua',
};
const KIEU: Record<string, 'ok' | 'info' | 'bad' | 'mute'> = {
  sent: 'ok', pending: 'info', failed: 'bad', skipped: 'mute',
};
const MAU_THU: Record<string, string> = {
  order_paid: 'Xác nhận thanh toán',
  workshop_registered: 'Xác nhận đăng ký workshop',
};

export default function HopThuDi() {
  const toast = useToast();
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<{
    tong: Record<string, number>; emails: Mail[];
  }>(() => api.get(`/api/admin/hop-thu${loc ? `?trang_thai=${loc}` : ''}`), [loc]);

  async function guiLai(m: Mail) {
    setBusy(m.id);
    try {
      await api.post(`/api/admin/hop-thu/${m.id}/gui-lai`);
      toast.show('Đã xếp lại hàng đợi. Lượt gửi kế tiếp sẽ nhặt nó.');
      reload();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'Không xếp lại được.');
    } finally {
      setBusy(null);
    }
  }

  const bo = data?.tong ?? {};

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Hộp thư đi</h1>
          <p>Email hệ thống gửi cho khách. Cái nào lỗi thì xếp lại được.</p>
        </div>
      </div>

      {/* 'skipped' không phải lỗi — nó nghĩa là chưa đặt RESEND_API_KEY. Nói
          thẳng ở đây, vì một hàng đợi toàn chữ đỏ sẽ khiến người xem đi tìm
          thứ hỏng không tồn tại. */}
      {(bo.skipped ?? 0) > 0 && (
        <div className="card card-pad" style={{ marginBottom: 14, borderColor: 'var(--canh)', background: 'var(--canh-nen)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {bo.skipped} email chưa gửi vì chưa bật tính năng email
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Đây không phải lỗi. Đặt <span className="mono">RESEND_API_KEY</span> trong
            Cloudflare → Settings → Variables and Secrets, rồi bấm "Xếp lại" từng
            cái để gửi bù.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {([['', 'Tất cả'], ['failed', 'Lỗi'], ['pending', 'Đang chờ'],
          ['sent', 'Đã gửi'], ['skipped', 'Bỏ qua']] as [string, string][]).map(([v, nhan]) => (
          <button key={v} className={`btn sm${loc === v ? ' primary' : ''}`}
                  onClick={() => setLoc(v)}>
            {nhan}{v && bo[v] != null ? ` (${bo[v]})` : ''}
          </button>
        ))}
      </div>

      {loading && <Loading what="hộp thư đi" />}
      {error && <ErrorBox message={error} />}

      {data && (data.emails.length === 0 ? (
        <Empty>Không có email nào trong mục này.</Empty>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Người nhận</th><th>Nội dung</th><th>Trạng thái</th>
                  <th>Lúc</th><th></th></tr>
            </thead>
            <tbody>
              {data.emails.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.to_name || '—'}</div>
                    <div className="muted mono" style={{ fontSize: 12.5 }}>{m.to_email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13.5 }}>{m.subject}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {MAU_THU[m.template] ?? m.template}
                    </div>
                    {m.last_error && (
                      <div style={{ fontSize: 12, color: 'var(--xau)', marginTop: 3 }}>
                        {m.last_error}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge kind={KIEU[m.status] ?? 'mute'}>{NHAN[m.status]}</Badge>
                    {m.attempts > 0 && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                        đã thử {m.attempts} lần
                      </div>
                    )}
                  </td>
                  <td className="muted mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {m.sentAtText ?? m.createdAtText}
                  </td>
                  <td>
                    {m.status !== 'sent' && (
                      <button className="btn sm" disabled={busy === m.id}
                              onClick={() => guiLai(m)}>
                        {busy === m.id ? 'Đang xếp…' : 'Xếp lại'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
