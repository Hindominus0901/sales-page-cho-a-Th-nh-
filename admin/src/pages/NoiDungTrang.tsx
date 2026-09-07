import { useState } from 'react';
import { api } from '../api';
import { Loading, ErrorBox, useLoad, useToast } from '../ui';

interface CauHoi { q: string; a: string }

interface Data {
  khoiSuaDuoc: string[];
  ghiDe: Record<string, unknown>;
}

const NHAN_STAT = [
  'Ô số liệu 1',
  'Ô số liệu 2',
  'Ô số liệu 3',
  'Ô số liệu 4',
];

/**
 * Nội dung trang bán.
 *
 * Sửa ở đây là trang đổi ngay, không cần deploy. Thay ở phía máy chủ nên nội
 * dung vẫn nằm trong HTML gốc — Google vẫn đọc được, và người xem không thấy
 * chữ nhảy sau khi trang đã hiện.
 *
 * Nguyên tắc: đây là lớp GHI ĐÈ. Bỏ ghi đè thì khối trở về đúng bản dựng từ
 * site.config.json, nên không có cách nào làm hỏng trang vĩnh viễn.
 */
export default function NoiDungTrang() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [stat, setStat] = useState<Record<number, string>>({});
  const [faq, setFaq] = useState<CauHoi[] | null>(null);

  const { data, error, loading, reload } = useLoad<Data>(
    () => api.get('/api/admin/noi-dung-trang'));

  async function luu(khoi: string, value: unknown) {
    setBusy(khoi);
    try {
      await api.put(`/api/admin/noi-dung-trang/${khoi}`, { value });
      toast.show('Đã lưu. Mở trang bán ra xem là thấy ngay.');
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không lưu được.');
    } finally { setBusy(null); }
  }

  async function boGhiDe(khoi: string) {
    if (!confirm('Bỏ ghi đè và trả khối này về nội dung gốc?')) return;
    setBusy(khoi);
    try {
      await api.del(`/api/admin/noi-dung-trang/${khoi}`);
      toast.show('Đã trả về nội dung gốc.');
      if (khoi === 'faq') setFaq(null);
      setStat({});
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không bỏ được.');
    } finally { setBusy(null); }
  }

  if (loading) return <Loading what="nội dung trang" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const faqGoc = (data.ghiDe.faq as CauHoi[] | undefined) ?? [];
  const ds = faq ?? faqGoc;
  const coGhiDeFaq = Array.isArray(data.ghiDe.faq);

  const statGiaTri = (i: number): string => {
    if (stat[i] !== undefined) return stat[i]!;
    const v = data.ghiDe[`stats.${i}`];
    return v === undefined ? '' : String(v);
  };

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Nội dung trang bán</h1>
          <p>
            Sửa ở đây là trang đổi <b>ngay</b>, không cần deploy lại. Bỏ ghi đè
            thì khối trở về đúng nội dung gốc — không có cách nào làm hỏng trang
            vĩnh viễn từ màn hình này.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4 }}>Bốn ô số liệu</h2>
        <p className="note" style={{ margin: '0 0 14px' }}>
          Khối bốn con số ở cuối trang. Chưa điền đủ bốn thì cả khối <b>tự ẩn</b> —
          bốn ô rỗng trên trang bán hàng trông như trang hỏng.
        </p>
        <div className="grid grid-4">
          {NHAN_STAT.map((nhan, i) => (
            <div className="field" key={i}>
              <label>{nhan}</label>
              <input className="input" value={statGiaTri(i)}
                     placeholder="ví dụ: 1.200+"
                     onChange={(e) => setStat({ ...stat, [i]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy !== null || Object.keys(stat).length === 0}
                  onClick={async () => {
                    for (const [i, v] of Object.entries(stat)) {
                      await luu(`stats.${i}`, v);
                    }
                    setStat({});
                  }}>
            Lưu số liệu
          </button>
          {[0, 1, 2, 3].some((i) => data.ghiDe[`stats.${i}`] !== undefined) && (
            <button className="btn" disabled={busy !== null}
                    onClick={async () => {
                      for (let i = 0; i < 4; i++) {
                        if (data.ghiDe[`stats.${i}`] !== undefined) await boGhiDe(`stats.${i}`);
                      }
                    }}>
              Trả về số liệu gốc
            </button>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <div className="spread" style={{ alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Câu hỏi thường gặp</h2>
          <span className="note">
            {coGhiDeFaq ? `${faqGoc.length} câu — đang dùng bản sửa` : 'đang dùng bản gốc'}
          </span>
        </div>
        <p className="note" style={{ margin: '0 0 14px' }}>
          Thêm, bớt, sắp lại đều được. Câu nào thiếu hỏi hoặc thiếu đáp thì bị bỏ
          qua khi lưu — trang không bao giờ hiện một câu hỏi không có câu trả lời.
        </p>

        {!coGhiDeFaq && faq === null && (
          <div className="alert" style={{ marginBottom: 14 }}>
            Trang đang dùng danh sách FAQ gốc trong <span className="mono">site.config.json</span>.
            Bấm &ldquo;Bắt đầu sửa&rdquo; để chép nó ra và sửa tự do — bản gốc vẫn nằm nguyên đó.
            <div style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => setFaq([{ q: '', a: '' }])}>
                Bắt đầu sửa
              </button>
            </div>
          </div>
        )}

        {(coGhiDeFaq || faq !== null) && (
          <>
            <div className="stack">
              {ds.map((x, i) => (
                <div className="card card-pad" key={i}>
                  <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
                    <b>Câu {i + 1}</b>
                    <div className="row" style={{ gap: 5 }}>
                      {i > 0 && (
                        <button className="btn sm" onClick={() => {
                          const m = [...ds];
                          [m[i - 1], m[i]] = [m[i]!, m[i - 1]!];
                          setFaq(m);
                        }}>↑</button>
                      )}
                      {i < ds.length - 1 && (
                        <button className="btn sm" onClick={() => {
                          const m = [...ds];
                          [m[i], m[i + 1]] = [m[i + 1]!, m[i]!];
                          setFaq(m);
                        }}>↓</button>
                      )}
                      <button className="btn sm"
                              onClick={() => setFaq(ds.filter((_, j) => j !== i))}>Xoá</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input className="input" placeholder="Câu hỏi" value={x.q}
                           onChange={(e) => setFaq(ds.map((y, j) =>
                             j === i ? { ...y, q: e.target.value } : y))} />
                    <textarea className="input" rows={3} placeholder="Câu trả lời" value={x.a}
                              onChange={(e) => setFaq(ds.map((y, j) =>
                                j === i ? { ...y, a: e.target.value } : y))} />
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => setFaq([...ds, { q: '', a: '' }])}>
                Thêm câu hỏi
              </button>
              <button className="btn primary" disabled={busy !== null || faq === null}
                      onClick={() => luu('faq', ds)}>
                {busy === 'faq' ? 'Đang lưu…' : 'Lưu danh sách'}
              </button>
              {coGhiDeFaq && (
                <button className="btn" disabled={busy !== null}
                        onClick={() => boGhiDe('faq')}>Trả về FAQ gốc</button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
