import { useState } from 'react';
import { api, dateTime, displayPhone } from '../api';
import { Badge, ScoreBadge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Workshop {
  id: string; slug: string; title: string; starts_at: number; status: string;
  zoom_url: string | null; zoom_meeting_id: string | null; zalo_group_url: string | null;
  registrations: number; attended: number;
}
interface Reg {
  id: string; full_name: string; phone: string; email_norm: string | null;
  attended: number; createdAtText: string; lead_code: string | null;
  score: number; score_band: string; affiliate_code: string | null;
}

/** Chuyển 'YYYY-MM-DDTHH:mm' (giờ Việt Nam) sang unix giây UTC. */
function ictLocalToUnix(value: string): number {
  return Math.floor(Date.parse(value + ':00+07:00') / 1000);
}
function unixToIctLocal(unix: number): string {
  return new Date((unix + 7 * 3600) * 1000).toISOString().slice(0, 16);
}

export default function Workshops() {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', startsAt: '', zoomUrl: '', zoomMeetingId: '', zaloGroupUrl: '' });
  const { data, error, loading, reload } = useLoad<{ workshops: Workshop[] }>(
    () => api.get('/api/admin/workshops'));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/admin/workshops', { ...form, startsAt: ictLocalToUnix(form.startsAt) });
      setForm({ slug: '', title: '', startsAt: '', zoomUrl: '', zoomMeetingId: '', zaloGroupUrl: '' });
      toast.show('Đã tạo buổi workshop.');
      reload();
    } catch (err) { toast.fail((err as Error).message); }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    try { await api.patch(`/api/admin/workshops/${id}`, patch); toast.show('Đã lưu.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Workshop</h1>
          <p>
            Trang <span className="mono">/workshop</span> tự lấy buổi <b>sắp diễn ra</b> gần nhất.
            Link Zoom và nhóm Zalo điền ở đây sẽ hiện ngay trên trang cảm ơn sau khi khách đăng ký —
            chưa điền thì nút tương ứng bị ẩn, không hiện nút chết.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 12 }}>Thêm buổi mới</h2>
        <form onSubmit={create}>
          <div className="grid grid-3">
            <div className="field">
              <label>Mã buổi (dùng trong đường dẫn)</label>
              <input className="input" required placeholder="ws-2026-08-05" value={form.slug}
                     onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div className="field">
              <label>Tiêu đề</label>
              <input className="input" required placeholder="Hành trình xây kênh — Xây chính mình"
                     value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Bắt đầu (giờ Việt Nam)</label>
              <input className="input" type="datetime-local" required value={form.startsAt}
                     onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </div>
            <div className="field">
              <label>Link Zoom</label>
              <input className="input" value={form.zoomUrl}
                     onChange={(e) => setForm({ ...form, zoomUrl: e.target.value })} />
            </div>
            <div className="field">
              <label>ID phòng Zoom</label>
              <input className="input" value={form.zoomMeetingId}
                     onChange={(e) => setForm({ ...form, zoomMeetingId: e.target.value })} />
            </div>
            <div className="field">
              <label>Link nhóm Zalo</label>
              <input className="input" value={form.zaloGroupUrl}
                     onChange={(e) => setForm({ ...form, zaloGroupUrl: e.target.value })} />
            </div>
          </div>
          <button className="btn primary">Tạo buổi workshop</button>
        </form>
      </div>

      {loading && <Loading what="workshop" />}
      {error && <ErrorBox message={error} />}
      {data && data.workshops.length === 0 && <Empty>Chưa có buổi workshop nào.</Empty>}

      <div className="stack">
        {data?.workshops.map((w) => (
          <div className="card card-pad" key={w.id}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="row">
                  <h2>{w.title}</h2>
                  <Badge kind={w.status === 'upcoming' ? 'ok' : 'mute'}>
                    {w.status === 'upcoming' ? 'Sắp diễn ra' : w.status === 'done' ? 'Đã xong' : w.status}
                  </Badge>
                </div>
                <div className="note" style={{ marginTop: 5 }}>
                  {dateTime(w.starts_at)} · <b>{w.registrations}</b> người đăng ký ·{' '}
                  {w.attended} người đã dự
                </div>
                {!w.zoom_url && (
                  <div className="note" style={{ color: 'var(--warm)', marginTop: 5 }}>
                    Chưa có link Zoom — khách đăng ký xong sẽ không thấy nút vào phòng.
                  </div>
                )}
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setOpen(open === w.id ? null : w.id)}>
                  {open === w.id ? 'Đóng danh sách' : 'Xem người đăng ký'}
                </button>
                {w.status === 'upcoming' && (
                  <button className="btn sm" onClick={() => update(w.id, { status: 'done' })}>
                    Đánh dấu đã xong
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-3" style={{ marginTop: 14 }}>
              <LinkField label="Link Zoom" value={w.zoom_url}
                         onSave={(v) => update(w.id, { zoomUrl: v })} />
              <LinkField label="ID phòng" value={w.zoom_meeting_id}
                         onSave={(v) => update(w.id, { zoomMeetingId: v })} />
              <LinkField label="Nhóm Zalo" value={w.zalo_group_url}
                         onSave={(v) => update(w.id, { zaloGroupUrl: v })} />
            </div>

            {open === w.id && <Registrations id={w.id} />}
          </div>
        ))}
      </div>
    </>
  );
}

function LinkField(
  { label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void },
) {
  const [v, setV] = useState(value ?? '');
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn sm" disabled={v === (value ?? '')} onClick={() => onSave(v)}>Lưu</button>
      </div>
    </div>
  );
}

function Registrations({ id }: { id: string }) {
  const toast = useToast();
  const { data, loading, reload } = useLoad<{ registrations: Reg[] }>(
    () => api.get(`/api/admin/workshops/${id}/registrations`), [id]);

  async function mark(registrationId: string, attended: boolean) {
    try { await api.post(`/api/admin/workshops/${id}/attendance`, { registrationId, attended }); reload(); }
    catch (e) { toast.fail((e as Error).message); }
  }

  if (loading) return <div className="note" style={{ marginTop: 14 }}>Đang tải danh sách…</div>;
  if (!data?.registrations.length) {
    return <div className="note" style={{ marginTop: 14 }}>Chưa có ai đăng ký buổi này.</div>;
  }

  return (
    <div className="table-wrap" style={{ marginTop: 14, borderTop: '1px solid var(--line)' }}>
      {toast.node}
      <table>
        <thead>
          <tr><th>Họ tên</th><th>Liên hệ</th><th>Điểm</th><th>CTV</th><th>Đăng ký lúc</th><th>Điểm danh</th></tr>
        </thead>
        <tbody>
          {data.registrations.map((r) => (
            <tr key={r.id}>
              <td>{r.full_name}</td>
              <td className="mono" style={{ fontSize: 13 }}>
                {displayPhone(r.phone)}
                {r.email_norm && <div className="muted">{r.email_norm}</div>}
              </td>
              <td>{r.lead_code ? <ScoreBadge score={r.score} band={r.score_band} /> : '—'}</td>
              <td className="mono muted" style={{ fontSize: 13 }}>{r.affiliate_code ?? '—'}</td>
              <td className="muted" style={{ fontSize: 13 }}>{r.createdAtText}</td>
              <td>
                <button className={`btn sm ${r.attended ? 'primary' : ''}`}
                        onClick={() => mark(r.id, !r.attended)}>
                  {r.attended ? 'Đã dự' : 'Chưa dự'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
