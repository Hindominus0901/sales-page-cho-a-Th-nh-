import { useState } from 'react';
import { api } from '../api';
import { Loading, ErrorBox, useLoad } from '../ui';

interface SuKien {
  kind: 'workshop' | 'khai_giang';
  id: string; date: string; time: string; title: string; status: string;
  zoomUrl: string | null; registrations: number; capacity: number | null;
}

const THU = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** 'YYYY-MM' của tháng hiện tại theo giờ Việt Nam. */
function thangNay(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

/** Dịch tháng đi n tháng, giữ dạng 'YYYY-MM'. */
function dich(thang: string, n: number): string {
  const [y, m] = thang.split('-').map(Number) as [number, number];
  const t = (y * 12 + (m - 1)) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * Các ô của lưới tháng, bắt đầu từ THỨ HAI.
 *
 * getUTCDay() trả 0 cho Chủ nhật, nên phải xoay: người Việt đọc lịch bắt đầu
 * từ thứ hai, và một lưới lệch một cột thì mọi sự kiện nằm sai thứ.
 */
function oTrongThang(thang: string): (string | null)[] {
  const [y, m] = thang.split('-').map(Number) as [number, number];
  const dauThang = new Date(Date.UTC(y, m - 1, 1));
  const soNgay = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();
  const lech = (dauThang.getUTCDay() + 6) % 7;

  const o: (string | null)[] = Array(lech).fill(null);
  for (let d = 1; d <= soNgay; d++) {
    o.push(`${thang}-${String(d).padStart(2, '0')}`);
  }
  while (o.length % 7 !== 0) o.push(null);
  return o;
}

export default function Lich() {
  const [thang, setThang] = useState(thangNay());
  const homNay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  const { data, error, loading } = useLoad<{ events: SuKien[] }>(
    () => api.get(`/api/admin/lich?thang=${thang}`), [thang]);

  const theoNgay = new Map<string, SuKien[]>();
  for (const e of data?.events ?? []) {
    if (!theoNgay.has(e.date)) theoNgay.set(e.date, []);
    theoNgay.get(e.date)!.push(e);
  }

  const [y, m] = thang.split('-');
  const o = oTrongThang(thang);

  return (
    <>
      <div className="head">
        <div>
          <h1>Lịch</h1>
          <p>Buổi workshop và ngày khai giảng, theo giờ Việt Nam.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn sm" onClick={() => setThang(dich(thang, -1))}>‹ Tháng trước</button>
          <button className="btn sm" onClick={() => setThang(thangNay())}>Tháng này</button>
          <button className="btn sm" onClick={() => setThang(dich(thang, 1))}>Tháng sau ›</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Tháng {Number(m)} · {y}</div>
      </div>

      {loading && <Loading what="lịch" />}
      {error && <ErrorBox message={error} />}

      {data && (
        <>
          <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
            <div style={{ minWidth: 700 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
                {THU.map((t) => (
                  <div key={t} className="muted"
                       style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '4px 0' }}>
                    {t}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                {o.map((ngay, i) => {
                  if (!ngay) return <div key={i} />;
                  const sk = theoNgay.get(ngay) ?? [];
                  const laHomNay = ngay === homNay;
                  return (
                    <div key={ngay} style={{
                      minHeight: 92, padding: 7, borderRadius: 10,
                      border: laHomNay ? '2px solid var(--xanh)' : '1px solid var(--vien)',
                      background: sk.length ? 'var(--xanh-mo)' : 'var(--nen)',
                    }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: laHomNay ? 800 : 600,
                        color: laHomNay ? 'var(--xanh-dam)' : 'var(--muc-3)', marginBottom: 5,
                      }}>
                        {Number(ngay.slice(8))}
                      </div>
                      {sk.map((e) => (
                        <a key={e.id} href="#/workshop" style={{
                          display: 'block', textDecoration: 'none', marginBottom: 4,
                          padding: '4px 6px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.35,
                          background: e.kind === 'khai_giang' ? 'var(--lam-nen)' : 'var(--tot-nen)',
                          color: e.kind === 'khai_giang' ? 'var(--lam)' : 'var(--tot)',
                          fontWeight: 600,
                        }}>
                          {e.time && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.time} </span>}
                          {e.title}
                        </a>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lưới tháng đọc nhanh nhưng chật. Danh sách bên dưới nói đủ: bao
              nhiêu người đã đăng ký, còn bao nhiêu chỗ, đã có link Zoom chưa. */}
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Chi tiết trong tháng</div>
            {data.events.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                Tháng này chưa có buổi workshop nào. Vào <a href="#/workshop">Workshop</a> để
                tạo buổi mới, hoặc <a href="#/cai-dat">Cài đặt</a> để đặt ngày khai giảng.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 9 }}>
                {data.events.map((e) => (
                  <div key={e.id} style={{
                    display: 'flex', gap: 12, alignItems: 'baseline',
                    paddingBottom: 9, borderBottom: '1px solid var(--vien)',
                  }}>
                    <div className="mono" style={{ fontSize: 13, minWidth: 108, color: 'var(--muc-3)' }}>
                      {e.date.slice(8)}/{e.date.slice(5, 7)}{e.time && ` · ${e.time}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{e.title}</div>
                      {e.kind === 'workshop' && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                          {e.registrations} người đăng ký
                          {e.capacity ? ` / ${e.capacity} chỗ` : ''}
                          {e.zoomUrl ? '' : ' · CHƯA có link Zoom'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
