import { useState } from 'react';
import { api, displayPhone } from '../api';
import { Badge, Kpi, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Reward {
  id: string; name: string; description: string | null; cost_coin: number;
  min_rank: number; minRankName: string; stock: number | null; is_active: number;
}
interface Redemption {
  id: string; reward_name: string; cost_coin: number; status: string;
  note: string | null; admin_note: string | null; createdAtText: string;
  full_name: string; phone: string; student_coin: number;
}

const STATUS: Record<string, [string, string]> = {
  requested: ['warm', 'Chờ duyệt'],
  approved:  ['info', 'Đã duyệt, chờ trao'],
  fulfilled: ['ok',   'Đã trao'],
  rejected:  ['bad',  'Đã từ chối'],
  cancelled: ['mute', 'Đã huỷ'],
};

export default function Rewards() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', costCoin: '', minRank: '0', stock: '' });

  const { data, error, loading, reload } = useLoad<{
    rewards: Reward[]; redemptions: Redemption[]; tiers: { name: string; icon: string }[];
  }>(() => api.get('/api/admin/rewards'));

  async function act(id: string, action: string) {
    setBusy(id);
    try {
      const r = await api.post<{ refunded: number }>(`/api/admin/redemptions/${id}/${action}`);
      toast.show(r.refunded
        ? `Đã từ chối và hoàn lại ${r.refunded.toLocaleString('vi-VN')} coin cho học viên.`
        : 'Đã cập nhật.');
      reload();
    } catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(null); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/admin/rewards', {
        name: form.name, description: form.description,
        costCoin: Number(form.costCoin), minRank: Number(form.minRank),
        stock: form.stock === '' ? null : Number(form.stock),
      });
      setForm({ name: '', description: '', costCoin: '', minRank: '0', stock: '' });
      toast.show('Đã thêm quà.');
      reload();
    } catch (err) { toast.fail((err as Error).message); }
  }

  async function toggle(r: Reward) {
    try { await api.patch(`/api/admin/rewards/${r.id}`, { isActive: r.is_active ? 0 : 1 }); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  if (loading) return <Loading what="quà tặng" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const cho = data.redemptions.filter((r) => r.status === 'requested');

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Quà tặng</h1>
          <p>
            Học viên đổi quà bằng coin kiếm được từ việc nộp bài. Coin bị trừ ngay lúc đặt
            đổi để giữ chỗ; anh từ chối thì hệ thống <b>tự hoàn lại coin</b> và trả suất về kho.
          </p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Chờ duyệt đổi quà" value={cho.length}
             tone={cho.length ? 'alert' : undefined}
             delta={cho.length ? 'cần xử lý' : 'không còn tồn'}
             deltaTone={cho.length ? 'bad' : 'good'} />
        <Kpi label="Quà đang mở" value={data.rewards.filter((r) => r.is_active).length} />
        <Kpi label="Đã trao" value={data.redemptions.filter((r) => r.status === 'fulfilled').length} />
        <Kpi label="Coin đã tiêu"
             value={data.redemptions.filter((r) => r.status !== 'rejected')
               .reduce((s, r) => s + r.cost_coin, 0).toLocaleString('vi-VN')} tone="dark" />
      </div>

      <h2 style={{ marginBottom: 10 }}>Yêu cầu đổi quà</h2>
      {data.redemptions.length === 0 ? (
        <Empty>Chưa có yêu cầu đổi quà nào.</Empty>
      ) : (
        <div className="card table-wrap" style={{ marginBottom: 22 }}>
          <table>
            <thead>
              <tr><th>Học viên</th><th>Quà</th><th className="right">Coin</th>
                  <th>Trạng thái</th><th>Ghi chú</th><th></th></tr>
            </thead>
            <tbody>
              {data.redemptions.map((r) => {
                const [kind, text] = STATUS[r.status] ?? ['mute', r.status];
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.full_name}</b>
                      <div className="muted mono">{displayPhone(r.phone)}</div>
                    </td>
                    <td>{r.reward_name}<div className="note">{r.createdAtText}</div></td>
                    <td className="right num">{r.cost_coin.toLocaleString('vi-VN')}</td>
                    <td><Badge kind={kind}>{text}</Badge></td>
                    <td className="note" style={{ maxWidth: 220 }}>{r.note || '—'}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {r.status === 'requested' && (
                          <>
                            <button className="btn sm primary" disabled={busy === r.id}
                                    onClick={() => act(r.id, 'approve')}>Duyệt</button>
                            <button className="btn sm danger" disabled={busy === r.id}
                                    onClick={() => act(r.id, 'reject')}>Từ chối</button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button className="btn sm primary" disabled={busy === r.id}
                                  onClick={() => act(r.id, 'fulfill')}>Đã trao</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginBottom: 10 }}>Kho quà</h2>
      <div className="card table-wrap" style={{ marginBottom: 18 }}>
        <table>
          <thead>
            <tr><th>Quà</th><th className="right">Giá coin</th><th>Bậc tối thiểu</th>
                <th className="right">Còn lại</th><th>Trạng thái</th><th></th></tr>
          </thead>
          <tbody>
            {data.rewards.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  {r.description && <div className="note" style={{ maxWidth: 380 }}>{r.description}</div>}
                </td>
                <td className="right num">{r.cost_coin.toLocaleString('vi-VN')}</td>
                <td>{data.tiers[r.min_rank]
                  ? `${data.tiers[r.min_rank]!.icon} ${r.minRankName}` : r.minRankName}</td>
                <td className="right num">{r.stock === null ? 'không giới hạn' : r.stock}</td>
                <td><Badge kind={r.is_active ? 'ok' : 'mute'}>{r.is_active ? 'Đang mở' : 'Đã tắt'}</Badge></td>
                <td className="right">
                  <button className="btn sm" onClick={() => toggle(r)}>
                    {r.is_active ? 'Tắt' : 'Mở lại'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <h2 style={{ marginBottom: 12 }}>Thêm quà mới</h2>
        <form onSubmit={create}>
          <div className="grid grid-3">
            <div className="field">
              <label>Tên quà</label>
              <input className="input" required value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Giá bằng coin</label>
              <input className="input" type="number" min={0} required value={form.costCoin}
                     onChange={(e) => setForm({ ...form, costCoin: e.target.value })} />
            </div>
            <div className="field">
              <label>Bậc tối thiểu</label>
              <select className="input" value={form.minRank}
                      onChange={(e) => setForm({ ...form, minRank: e.target.value })}>
                {data.tiers.map((t, i) => (
                  <option key={t.name} value={i}>{t.icon} {t.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Mô tả</label>
              <input className="input" value={form.description}
                     onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field">
              <label>Số lượng (để trống là không giới hạn)</label>
              <input className="input" type="number" min={0} value={form.stock}
                     onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
          </div>
          <button className="btn primary" type="submit">Thêm quà</button>
        </form>
      </div>
    </>
  );
}
