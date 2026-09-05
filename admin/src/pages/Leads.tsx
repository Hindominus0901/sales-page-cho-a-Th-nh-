import { useState } from 'react';
import { api, relativeTime, displayPhone } from '../api';
import { ScoreBadge, LeadStatus, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface LeadRow {
  id: string; code: string; full_name: string; phone: string; email: string | null;
  source: string; score: number; score_band: string; status: string;
  created_at: number; affiliate_code: string | null; owner_name: string | null;
}

const SOURCES = [
  ['', 'Mọi nguồn'], ['workshop', 'Workshop'], ['ban_do', 'Bản Đồ 21 Ngày'],
  ['consult', 'Đăng ký tư vấn'], ['checkout', 'Điền form mua'],
];
const STATUSES = [
  ['', 'Mọi trạng thái'], ['new', 'Mới'], ['contacted', 'Đã liên hệ'],
  ['consulting', 'Đang tư vấn'], ['won', 'Đã chốt'], ['lost', 'Không phù hợp'], ['spam', 'Rác'],
];
const BANDS = [['', 'Mọi mức'], ['hot', 'Nóng'], ['warm', 'Ấm'], ['cold', 'Lạnh']];

export default function Leads({ query }: { query: URLSearchParams }) {
  const toast = useToast();
  const [band, setBand] = useState(query.get('band') ?? '');
  const [source, setSource] = useState(query.get('source') ?? '');
  const [status, setStatus] = useState(query.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams();
  if (band) qs.set('band', band);
  if (source) qs.set('source', source);
  if (status) qs.set('status', status);
  if (applied) qs.set('q', applied);
  qs.set('page', String(page));

  const { data, error, loading, reload } = useLoad<{ leads: LeadRow[]; total: number; pageSize: number }>(
    () => api.get(`/api/admin/leads?${qs}`),
    [band, source, status, applied, page],
  );

  async function rescore() {
    try {
      const r = await api.post<{ updated: number }>('/api/admin/leads/rescore');
      toast.show(r.updated > 0 ? `Đã chấm lại ${r.updated} lead.` : 'Mọi lead đã dùng bảng điểm mới nhất.');
      reload();
    } catch (e) { toast.fail((e as Error).message); }
  }

  const pages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Lead</h1>
          <p>
            Lead <b>NÓNG</b> chưa ai liên hệ luôn nằm đầu danh sách. Bấm vào tên để xem
            vì sao hệ thống chấm điểm đó.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={rescore}>Chấm lại điểm</button>
          <a className="btn" href="/api/admin/leads/export.csv">Tải CSV</a>
        </div>
      </div>

      <form className="bar" onSubmit={(e) => { e.preventDefault(); setApplied(search); setPage(1); }}>
        <input className="input" placeholder="Tìm tên, số điện thoại, email, mã lead"
               value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={band} onChange={(e) => { setBand(e.target.value); setPage(1); }}>
          {BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn primary" type="submit">Tìm</button>
        {(band || source || status || applied) && (
          <button type="button" className="btn" onClick={() => {
            setBand(''); setSource(''); setStatus(''); setSearch(''); setApplied(''); setPage(1);
          }}>Xoá lọc</button>
        )}
      </form>

      {loading && <Loading what="danh sách lead" />}
      {error && <ErrorBox message={error} />}
      {data && data.leads.length === 0 && <Empty>Không có lead nào khớp bộ lọc.</Empty>}

      {data && data.leads.length > 0 && (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Họ tên</th><th>Điểm</th><th>Nguồn</th><th>Trạng thái</th>
                  <th>CTV</th><th>Phụ trách</th><th>Để lại lúc</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <a href={`#/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.full_name}</a>
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        {displayPhone(l.phone)}{l.email ? ` · ${l.email}` : ''}
                      </div>
                    </td>
                    <td><ScoreBadge score={l.score} band={l.score_band} /></td>
                    <td className="muted">{SOURCES.find(([v]) => v === l.source)?.[1] ?? l.source}</td>
                    <td><LeadStatus value={l.status} /></td>
                    <td className="muted mono" style={{ fontSize: 13 }}>{l.affiliate_code ?? '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{l.owner_name ?? '—'}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{relativeTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            <span className="note">{data.total} lead · trang {page}/{Math.max(1, pages)}</span>
            <div className="row">
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
              <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau →</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
