import { useState } from 'react';
import { api, vnd, dateTime } from '../api';
import { Badge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Aff {
  id: string; code: string; name: string; email: string; phone: string | null;
  status: string; commission_rate: number; created_at: number;
  bank_name: string | null; bank_account_no: string | null;
  clicks: number; leads: number; paid_orders: number; paid_amount: number; owed_amount: number;
}

const STATUS: Record<string, [string, string]> = {
  active:    ['ok',   'Đang hoạt động'],
  pending:   ['warm', 'Chờ duyệt'],
  suspended: ['mute', 'Tạm ngưng'],
  rejected:  ['bad',  'Từ chối'],
};

export default function Affiliates() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', email: '', phone: '' });
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const { data, error, loading, reload } = useLoad<{ affiliates: Aff[] }>(
    () => api.get('/api/admin/affiliates'));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await api.post<{ affiliate: { email: string }; tempPassword: string }>(
        '/api/admin/affiliates', form);
      setCreated({ email: r.affiliate.email, tempPassword: r.tempPassword });
      setForm({ code: '', name: '', email: '', phone: '' });
      reload();
    } catch (err) { toast.fail((err as Error).message); }
    finally { setCreating(false); }
  }

  async function setStatus(id: string, status: string) {
    try { await api.patch(`/api/admin/affiliates/${id}`, { status }); toast.show('Đã cập nhật.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Cộng tác viên</h1>
          <p>
            Hoa hồng tính theo lần chạm <b>đầu tiên</b>, giữ trong 90 ngày. Khách bấm link của
            ai trước thì hoa hồng thuộc về người đó, kể cả khi sau đó bấm link người khác.
          </p>
        </div>
      </div>

      {created && (
        <div className="alert ok" style={{ marginBottom: 16 }}>
          <b>Đã tạo tài khoản cho {created.email}.</b>
          <div style={{ marginTop: 8 }}>
            Mật khẩu tạm: <span className="mono" style={{ fontSize: 16, fontWeight: 700,
              background: '#fff', padding: '3px 9px', borderRadius: 6 }}>{created.tempPassword}</span>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            Mật khẩu chỉ hiện <b>một lần</b> — hệ thống chỉ lưu bản băm nên không xem lại được.
            Anh gửi cho CTV và nhắc họ đổi ngay sau khi đăng nhập.
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setCreated(null)}>Đã lưu</button>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 12 }}>Thêm cộng tác viên</h2>
        <form onSubmit={create}>
          <div className="grid grid-4">
            <div className="field">
              <label>Mã giới thiệu</label>
              <input className="input" required placeholder="MINHANH" value={form.code}
                     onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label>Họ tên</label>
              <input className="input" required value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email đăng nhập</label>
              <input className="input" type="email" required value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Số điện thoại</label>
              <input className="input" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <button className="btn primary" disabled={creating}>
            {creating ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>
      </div>

      {loading && <Loading what="cộng tác viên" />}
      {error && <ErrorBox message={error} />}
      {data && data.affiliates.length === 0 && <Empty>Chưa có cộng tác viên nào.</Empty>}

      {data && data.affiliates.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Mã</th><th>Cộng tác viên</th><th className="right">Click</th>
                  <th className="right">Lead</th><th className="right">Đơn</th>
                  <th className="right">Đã trả</th><th className="right">Còn nợ</th>
                  <th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {data.affiliates.map((a) => {
                const [kind, text] = STATUS[a.status] ?? ['mute', a.status];
                return (
                  <tr key={a.id}>
                    <td className="mono" style={{ fontWeight: 700 }}>{a.code}</td>
                    <td>
                      {a.name}
                      <div className="muted" style={{ fontSize: 12 }}>{a.email}</div>
                      {!a.bank_account_no && (
                        <div className="note" style={{ color: 'var(--canh)' }}>chưa có tài khoản ngân hàng</div>
                      )}
                    </td>
                    <td className="right">{a.clicks}</td>
                    <td className="right">{a.leads}</td>
                    <td className="right">{a.paid_orders}</td>
                    <td className="right">{vnd(a.paid_amount)}</td>
                    <td className="right" style={{ fontWeight: a.owed_amount > 0 ? 700 : 400 }}>
                      {vnd(a.owed_amount)}
                    </td>
                    <td><Badge kind={kind}>{text}</Badge>
                        <div className="note">{a.commission_rate / 100}%</div></td>
                    <td className="right">
                      {a.status === 'active'
                        ? <button className="btn sm" onClick={() => setStatus(a.id, 'suspended')}>Tạm ngưng</button>
                        : <button className="btn sm primary" onClick={() => setStatus(a.id, 'active')}>Kích hoạt</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
