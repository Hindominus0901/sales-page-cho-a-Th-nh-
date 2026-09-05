import { useState } from 'react';
import { api, vnd, dateTime, displayPhone } from '../api';
import { ScoreBadge, LeadStatus, OrderStatus, Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Detail {
  lead: Record<string, unknown> & {
    id: string; code: string; full_name: string; phone: string; email: string | null;
    score: number; score_band: string; bandLabel: string; status: string;
    breakdown: { rule: string; label: string; points: number }[];
    answers: Record<string, string>;
    createdAtText: string; scoringOutdated: boolean;
    affiliate_code: string | null; utm_source: string | null; utm_campaign: string | null;
  };
  notes: { id: string; body: string; created_at: number; admin_name: string | null }[];
  orders: { order_code: string; amount_total: number; amount_paid: number; status: string; created_at: number }[];
  workshops: { title: string; starts_at: number; attended: number; created_at: number }[];
}

/**
 * Giá trị trong form là mã máy (ready_2m, has_1k_10k…). Hiện thẳng ra thì anh
 * Thành không đọc được, nên phải dịch — bảng này khớp với các enum trong
 * src/lib/validation/forms.ts.
 */
const ANSWER_VALUE: Record<string, string> = {
  ready_2m: 'Sẵn sàng đầu tư 2 triệu ngay',
  need_think: 'Cần cân nhắc thêm',
  need_installment: 'Muốn trả góp / chia đợt',
  not_ready: 'Chưa sẵn sàng',
  now: 'Muốn bắt đầu ngay',
  this_month: 'Trong tháng này',
  '2_3_months': '2–3 tháng nữa',
  unsure: 'Chưa xác định',
  over_2h: 'Trên 2 giờ mỗi ngày',
  '1_2h': '1–2 giờ mỗi ngày',
  under_1h: 'Dưới 1 giờ mỗi ngày',
  none_yet: 'Chưa có kênh',
  has_under_1k: 'Đã có, dưới 1.000 người theo dõi',
  has_1k_10k: 'Đã có, 1.000–10.000 người theo dõi',
  has_over_10k: 'Đã có, trên 10.000 người theo dõi',
  sell_products: 'Bán sản phẩm / dịch vụ',
  get_clients: 'Thu hút khách hàng',
  build_personal_brand: 'Xây thương hiệu cá nhân',
  just_curious: 'Tìm hiểu thêm đã',
};

const ANSWER_LABEL: Record<string, string> = {
  field: 'Lĩnh vực', note: 'Mong muốn sau 21 ngày', stuck: 'Đang mắc kẹt nhất',
  goal_text: 'Mục tiêu lớn nhất', budget: 'Ngân sách', timeline: 'Thời điểm bắt đầu',
  daily_time: 'Thời gian mỗi ngày', channel: 'Hiện trạng kênh', goal: 'Mục tiêu',
  magnet: 'Tài liệu tải', workshop_session: 'Buổi workshop',
};

const STATUS_OPTIONS = [
  ['new', 'Mới'], ['contacted', 'Đã liên hệ'], ['consulting', 'Đang tư vấn'],
  ['won', 'Đã chốt'], ['lost', 'Không phù hợp'], ['spam', 'Rác'],
];

export default function LeadDetail({ id }: { id: string }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, error, loading, reload } = useLoad<Detail>(() => api.get(`/api/admin/leads/${id}`), [id]);

  if (loading) return <Loading what="lead" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const l = data.lead;

  async function setStatus(status: string) {
    setSaving(true);
    try { await api.patch(`/api/admin/leads/${id}`, { status }); toast.show('Đã cập nhật.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
    finally { setSaving(false); }
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try { await api.post(`/api/admin/leads/${id}/notes`, { body: note }); setNote(''); toast.show('Đã lưu ghi chú.'); reload(); }
    catch (e) { toast.fail((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <a href="#/leads" className="note">← Về danh sách lead</a>
          <h1 style={{ marginTop: 6 }}>{l.full_name}</h1>
          <p>
            <span className="mono">{displayPhone(l.phone)}</span>
            {l.email ? <> · {l.email}</> : null}
            {' · '}mã <span className="mono">{l.code}</span>
            {' · '}để lại lúc {l.createdAtText}
          </p>
        </div>
        <div className="row">
          <a className="btn" target="_blank" rel="noopener"
             href={`https://zalo.me/${displayPhone(l.phone).replace(/\D/g, '')}`}>Nhắn Zalo</a>
          <a className="btn primary" href={`tel:${displayPhone(l.phone)}`}>Gọi</a>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card card-pad">
            <div className="spread" style={{ marginBottom: 12 }}>
              <h2>Vì sao điểm {l.score}/100</h2>
              <ScoreBadge score={l.score} band={l.score_band} />
            </div>
            <p className="note" style={{ margin: '0 0 12px' }}>{l.bandLabel}</p>

            {l.scoringOutdated && (
              <div className="alert warn" style={{ marginBottom: 12 }}>
                Điểm này chấm bằng bảng điểm cũ. Bấm "Chấm lại điểm" ở danh sách lead để cập nhật.
              </div>
            )}

            {l.breakdown.length === 0 ? (
              <p className="note">Lead này chưa có dữ liệu nào để chấm điểm.</p>
            ) : (
              <table>
                <tbody>
                  {l.breakdown.map((b, i) => (
                    <tr key={i}>
                      <td>{b.label}</td>
                      <td className="right mono" style={{
                        width: 60, fontWeight: 700,
                        color: b.points >= 0 ? 'var(--xanh-dam)' : 'var(--xau)',
                      }}>{b.points >= 0 ? '+' : ''}{b.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Khách đã trả lời gì</h2>
            {Object.keys(l.answers).length === 0 ? <p className="note">Không có câu trả lời nào.</p> : (
              <div className="stack" style={{ gap: 11 }}>
                {Object.entries(l.answers).filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => (
                  <div key={k}>
                    <div className="note" style={{ fontWeight: 600 }}>{ANSWER_LABEL[k] ?? k}</div>
                    <div>{ANSWER_VALUE[String(v)] ?? String(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(l.affiliate_code || l.utm_source) && (
            <div className="card card-pad">
              <h2 style={{ marginBottom: 10 }}>Lead này đến từ đâu</h2>
              <div className="stack" style={{ gap: 7 }}>
                {l.affiliate_code && (
                  <div className="spread">
                    <span className="note">Cộng tác viên giới thiệu</span>
                    <span className="mono">{l.affiliate_code}</span>
                  </div>
                )}
                {l.utm_source && (
                  <div className="spread">
                    <span className="note">Nguồn quảng cáo</span>
                    <span className="mono">{l.utm_source}{l.utm_campaign ? ` / ${l.utm_campaign}` : ''}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Trạng thái</h2>
            <div className="row" style={{ marginBottom: 12 }}><LeadStatus value={l.status} /></div>
            <div className="row">
              {STATUS_OPTIONS.map(([v, label]) => (
                <button key={v} className={`btn sm ${v === l.status ? 'primary' : ''}`}
                        disabled={saving || v === l.status} onClick={() => setStatus(v!)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Ghi chú nội bộ</h2>
            <div className="field">
              <textarea className="input" rows={3} value={note} placeholder="Đã gọi lúc 10h, hẹn gọi lại chiều mai…"
                        onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="btn primary" disabled={saving || !note.trim()} onClick={addNote}>Lưu ghi chú</button>

            <div className="stack" style={{ gap: 11, marginTop: 16 }}>
              {data.notes.length === 0 && <p className="note">Chưa có ghi chú nào.</p>}
              {data.notes.map((n) => (
                <div key={n.id} style={{ borderLeft: '2px solid var(--vien)', paddingLeft: 12 }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  <div className="note">{n.admin_name ?? 'Hệ thống'} · {dateTime(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>

          {data.orders.length > 0 && (
            <div className="card card-pad">
              <h2 style={{ marginBottom: 12 }}>Đơn hàng</h2>
              <table>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.order_code}>
                      <td><a className="mono" href={`#/don-hang/${o.order_code}`}>{o.order_code}</a></td>
                      <td>{vnd(o.amount_total)}</td>
                      <td><OrderStatus value={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.workshops.length > 0 && (
            <div className="card card-pad">
              <h2 style={{ marginBottom: 12 }}>Đã đăng ký workshop</h2>
              <table>
                <tbody>
                  {data.workshops.map((w, i) => (
                    <tr key={i}>
                      <td>{w.title}<div className="note">{dateTime(w.starts_at)}</div></td>
                      <td className="right">{w.attended ? 'Đã dự' : 'Chưa dự'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
