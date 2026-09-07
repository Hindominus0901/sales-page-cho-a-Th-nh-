import { useState } from 'react';
import { api, displayPhone } from '../api';
import { Badge, RankBadge, Streak, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Sub {
  id: string; day: number; post_url: string | null; content: string | null;
  channel: string | null; status: string; feedback: string | null;
  is_late: number; coin_awarded: number; xp_awarded: number;
  createdAtText: string; reviewer_name: string | null;
  student_id: string; full_name: string; phone: string;
  xp: number; coin: number; streak_current: number;
  cohort: string | null; rank: { name: string; icon: string }; streakAlive: boolean;
  trung_link_voi: string | null;
}

const FILTERS = [
  ['pending', 'Chờ duyệt'], ['needs_work', 'Đã yêu cầu sửa'],
  ['approved', 'Đã duyệt'], ['all', 'Tất cả'],
];

const CHANNEL: Record<string, string> = {
  facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', khac: 'Kênh khác',
};

/** Mẫu nhận xét hay dùng. Bấm là nối vào ô, vẫn sửa tiếp được. */
const MAU_NHAN_XET = [
  'Bài tới rồi, giữ nhịp này.',
  'Mở đầu dài quá, cắt còn 2 câu.',
  'Thiếu lời kêu gọi ở cuối bài.',
  'Ảnh bìa chưa có chữ.',
  'Nội dung ổn nhưng chưa rõ dành cho ai.',
];

export default function Submissions() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [day, setDay] = useState('');
  const [cohort, setCohort] = useState('');
  const [trang, setTrang] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  /* Bài đã xử lý xong trong phiên này. Giữ ở đây thay vì reload() cả danh sách:
     reload() làm card biến mất, danh sách dịch lên, vị trí cuộn nhảy — lặp lại
     ba mươi lần mỗi sáng. Ẩn tại chỗ thì mọi thứ khác đứng yên. */
  const [xong, setXong] = useState<Record<string, string>>({});

  const { data, error, loading, reload } = useLoad<{
    submissions: Sub[]; counts: Record<string, number>;
    trang: number; kichThuocTrang: number; tong: number; khoaHoc: string[];
  }>(() => api.get(`/api/admin/submissions?status=${status}`
    + (day ? `&day=${day}` : '') + (cohort ? `&cohort=${encodeURIComponent(cohort)}` : '')
    + `&trang=${trang}`), [status, day, cohort, trang]);

  async function review(id: string, action: 'approve' | 'needs_work') {
    setBusy(id);
    try {
      const r = await api.post<{ message: string }>(`/api/admin/submissions/${id}/review`,
        { action, feedback: notes[id] ?? '' });
      toast.show(r.message);
      setNotes((n) => ({ ...n, [id]: '' }));
      setXong((x) => ({ ...x, [id]: action === 'approve' ? 'Đã duyệt' : 'Đã gửi yêu cầu sửa' }));
    } catch (e) { toast.fail((e as Error).message); }
    finally { setBusy(null); }
  }

  /* Đổi bộ lọc thì về trang 1 và quên danh sách đã xử lý — chúng thuộc về bộ
     lọc cũ. */
  function doiLoc(fn: () => void) { fn(); setTrang(1); setXong({}); }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Duyệt bài</h1>
          <p>
            Học viên đăng bài lên kênh thật của mình rồi nộp link vào đây. Duyệt xong mới
            cộng coin và XP — nộp cho có thì không được tính. Chuỗi ngày tính theo ngày
            <b> nộp</b>, nên duyệt muộn không làm học viên mất chuỗi.
          </p>
        </div>
        {data && (
          <div className="row">
            <Badge kind="warm">{data.counts.pending ?? 0} chờ duyệt</Badge>
            <Badge kind="ok">{data.counts.approved_today ?? 0} đã duyệt hôm nay</Badge>
          </div>
        )}
      </div>

      <div className="bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map(([v, l]) => (
          <button key={v} className={`btn sm ${status === v ? 'primary' : ''}`}
                  onClick={() => doiLoc(() => setStatus(v!))}>{l}</button>
        ))}

        <span style={{ width: 1, height: 24, background: 'var(--vien)', margin: '0 4px' }} />

        <select value={day} onChange={(e) => doiLoc(() => setDay(e.target.value))}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--vien)' }}>
          <option value="">Mọi ngày</option>
          {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>Ngày {d}</option>
          ))}
        </select>

        {(data?.khoaHoc.length ?? 0) > 0 && (
          <select value={cohort} onChange={(e) => doiLoc(() => setCohort(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--vien)' }}>
            <option value="">Mọi khoá</option>
            {data?.khoaHoc.map((k) => <option key={k} value={k}>Khoá {k}</option>)}
          </select>
        )}

        {Object.keys(xong).length > 0 && (
          <button className="btn sm" onClick={() => { setXong({}); reload(); }}>
            Làm mới danh sách
          </button>
        )}
      </div>

      {loading && <Loading what="bài nộp" />}
      {error && <ErrorBox message={error} />}
      {data && data.submissions.length === 0 && (
        <Empty>
          {status === 'pending'
            ? 'Không còn bài nào chờ duyệt. Cả lớp đã được nhận xét.'
            : 'Không có bài nào ở mục này.'}
        </Empty>
      )}

      <div className="stack">
        {data?.submissions.map((s) => (
          <div className="card card-pad" key={s.id}
               style={xong[s.id] ? { opacity: .55 } : undefined}>
            <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{s.full_name}</b>
                  <Badge kind="info">Ngày {s.day}/21</Badge>
                  {s.is_late ? <Badge kind="warm">Nộp muộn</Badge> : null}
                  {s.trung_link_voi ? <Badge kind="bad">Trùng link</Badge> : null}
                  <RankBadge tier={s.rank} />
                  <Streak n={s.streak_current} alive={s.streakAlive} />
                </div>
                <div className="note" style={{ marginTop: 4 }}>
                  <span className="mono">{displayPhone(s.phone)}</span>
                  {s.cohort ? ` · ${s.cohort}` : ''} · nộp {s.createdAtText}
                  {s.channel ? ` · ${CHANNEL[s.channel] ?? s.channel}` : ''}
                </div>
                {/* Không chặn cứng: hai người cùng làm một bài nhóm, hoặc chính
                    người này nộp lại link cũ ở ngày khác, là chuyện có thật.
                    Chỉ đưa sự việc ra trước mắt người duyệt. */}
                {s.trung_link_voi && (
                  <div className="note" style={{ marginTop: 4, color: 'var(--xau)' }}>
                    Link này cũng được nộp bởi: <b>{s.trung_link_voi}</b> — mở ra xem giúp em.
                  </div>
                )}
              </div>
              <div className="row">
                {/* Nói rõ đây là tổng tích luỹ của học viên, không phải phần
                    thưởng của riêng bài này — đặt cạnh bài rất dễ hiểu nhầm. */}
                <span className="note num" title="Tổng tích luỹ của học viên">
                  đang có {s.coin.toLocaleString('vi-VN')} coin · {s.xp.toLocaleString('vi-VN')} XP
                </span>
                {s.status !== 'pending' && (
                  <Badge kind={s.status === 'approved' ? 'ok' : 'warm'}>
                    {s.status === 'approved' ? 'Đã duyệt' : 'Yêu cầu sửa'}
                  </Badge>
                )}
              </div>
            </div>

            {s.post_url && (
              <a className="btn sm" href={s.post_url} target="_blank" rel="noopener"
                 style={{ marginBottom: 10 }}>Mở bài đã đăng ↗</a>
            )}
            {s.content && (
              <div style={{ background: 'var(--nen-2)', borderRadius: 10, padding: '11px 14px',
                            fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                {s.content}
              </div>
            )}

            {s.status === 'pending' ? (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Nhận xét gửi cho học viên</label>
                  <textarea className="input" rows={2}
                            placeholder="Chỗ nào tới, chỗ nào chưa tới, sửa thế nào…"
                            value={notes[s.id] ?? ''}
                            onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />
                  {/* Ba mươi bài mỗi sáng mà gõ tay từ đầu thì tới tuần thứ hai
                      sẽ bắt đầu duyệt lấy lệ. Mẫu để nối thêm, không thay thế. */}
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {MAU_NHAN_XET.map((m) => (
                      <button key={m} type="button" className="btn sm"
                              onClick={() => setNotes((n) => ({
                                ...n, [s.id]: (n[s.id] ? n[s.id] + ' ' : '') + m,
                              }))}>{m}</button>
                    ))}
                  </div>
                </div>
                {xong[s.id] ? (
                  <div className="note" style={{ color: 'var(--tot)', fontWeight: 600 }}>
                    {xong[s.id]} ✓
                  </div>
                ) : (
                  <div className="row">
                    <button className="btn primary" disabled={busy === s.id}
                            onClick={() => review(s.id, 'approve')}>Duyệt và cộng coin</button>
                    <button className="btn" disabled={busy === s.id}
                            onClick={() => review(s.id, 'needs_work')}>Yêu cầu sửa lại</button>
                    <span className="note">
                      Yêu cầu sửa thì bắt buộc có nhận xét — học viên cần biết sửa chỗ nào.
                    </span>
                  </div>
                )}
              </>
            ) : s.feedback ? (
              <div style={{ borderLeft: '2px solid var(--xanh)', paddingLeft: 12, fontSize: 13.5 }}>
                <div className="note" style={{ fontWeight: 600 }}>
                  Nhận xét{s.reviewer_name ? ` — ${s.reviewer_name}` : ''}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{s.feedback}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {data && data.tong > data.kichThuocTrang && (
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 16 }}>
          <button className="btn sm" disabled={trang <= 1}
                  onClick={() => { setTrang(trang - 1); setXong({}); }}>Trang trước</button>
          <span className="note">
            Trang {trang} / {Math.ceil(data.tong / data.kichThuocTrang)} · {data.tong} bài
          </span>
          <button className="btn sm"
                  disabled={trang >= Math.ceil(data.tong / data.kichThuocTrang)}
                  onClick={() => { setTrang(trang + 1); setXong({}); }}>Trang sau</button>
        </div>
      )}
    </>
  );
}
