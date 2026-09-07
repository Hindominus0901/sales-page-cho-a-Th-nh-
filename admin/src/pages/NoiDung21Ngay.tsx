import { useState } from 'react';
import { api } from '../api';
import { Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Ngay {
  day: number;
  title: string;
  brief: string | null;
  video_url: string | null;
  tips: string | null;
}

/**
 * Nội dung 21 ngày.
 *
 * Trước màn hình này, nội dung khoá học không tồn tại trong hệ thống. Học viên
 * vào ngày 1 thấy lời chào, huy hiệu, lưới 21 ô xám trơn, và một form hỏi
 * "Link bài đăng" mà không nói phải đăng gì — đề bài chỉ có trong nhóm Zalo, và
 * ai bỏ lỡ tin nhắn ngày 7 thì không có chỗ nào tra lại.
 *
 * Bảng 21 dòng cố định, mở ra sửa tại chỗ. Không có nút "thêm ngày": số ngày là
 * hằng số của sản phẩm, và một danh sách rỗng phải bấm thêm 21 lần là cách chắc
 * chắn nhất để không ai điền.
 */
export default function NoiDung21Ngay() {
  const toast = useToast();
  const [mo, setMo] = useState<number | null>(null);
  const [nhap, setNhap] = useState<Record<number, Partial<Ngay>>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const { data, error, loading, reload } = useLoad<{
    cohort: string | null; ngay: Ngay[]; daDien: number;
  }>(() => api.get('/api/admin/noi-dung-21-ngay'));

  function sua(day: number, truong: keyof Ngay, gia: string) {
    setNhap((n) => ({ ...n, [day]: { ...n[day], [truong]: gia } }));
  }

  function lay(d: Ngay, truong: keyof Ngay): string {
    const v = nhap[d.day]?.[truong];
    return String(v !== undefined ? v : (d[truong] ?? ''));
  }

  async function luu(d: Ngay) {
    const title = lay(d, 'title').trim();
    if (!title) { toast.fail('Anh đặt tiêu đề cho ngày này giúp em.'); return; }
    setBusy(d.day);
    try {
      await api.put(`/api/admin/noi-dung-21-ngay/${d.day}`, {
        title,
        brief: lay(d, 'brief'),
        videoUrl: lay(d, 'video_url'),
        tips: lay(d, 'tips'),
      });
      toast.show(`Đã lưu ngày ${d.day}.`);
      setNhap((n) => { const x = { ...n }; delete x[d.day]; return x; });
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không lưu được.');
    } finally { setBusy(null); }
  }

  async function xoa(d: Ngay) {
    if (!confirm(`Xoá nội dung ngày ${d.day}? Học viên sẽ thấy lại dòng "đề bài sẽ có trước buổi học".`)) return;
    setBusy(d.day);
    try {
      await api.del(`/api/admin/noi-dung-21-ngay/${d.day}`);
      toast.show(`Đã xoá nội dung ngày ${d.day}.`);
      setNhap((n) => { const x = { ...n }; delete x[d.day]; return x; });
      setMo(null);
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không xoá được.');
    } finally { setBusy(null); }
  }

  if (loading) return <Loading what="nội dung 21 ngày" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Nội dung 21 ngày</h1>
          <p>
            Đề bài từng ngày mà học viên đọc ngay trong lớp. Ngày nào chưa điền
            thì học viên thấy dòng "đề bài sẽ có trước buổi học" — không phải ô
            trống không lời giải thích.
          </p>
        </div>
        <div className="row">
          <span className="note">
            Đã điền {data.daDien}/21
            {data.cohort ? ` · khoá ${data.cohort}` : ' · dùng chung mọi khoá'}
          </span>
        </div>
      </div>

      {data.daDien === 0 && (
        <div className="card card-pad" style={{ marginBottom: 14, borderColor: 'var(--canh)', background: 'var(--canh-nen)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chưa có ngày nào được điền</div>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Học viên đang thấy lưới 21 ô trống và không biết mỗi ngày phải làm gì.
            Điền dần cũng được — ngày 1 trước buổi khai giảng là đủ.
          </p>
        </div>
      )}

      <div className="stack">
        {data.ngay.map((d) => {
          const dangMo = mo === d.day;
          const daCo = Boolean(d.title);
          const chuaLuu = Boolean(nhap[d.day]);
          return (
            <div className="card card-pad" key={d.day}>
              <div className="spread" style={{ alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: 15 }}>Ngày {d.day}</b>
                  <span style={{ marginLeft: 10, color: daCo ? 'inherit' : 'var(--mo)' }}>
                    {daCo ? d.title : 'chưa điền'}
                  </span>
                  {chuaLuu && (
                    <span className="note" style={{ marginLeft: 10, color: 'var(--canh)' }}>
                      có thay đổi chưa lưu
                    </span>
                  )}
                </div>
                <button className="btn sm" onClick={() => setMo(dangMo ? null : d.day)}>
                  {dangMo ? 'Thu lại' : daCo ? 'Sửa' : 'Điền'}
                </button>
              </div>

              {dangMo && (
                <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="note">Tiêu đề — hiện to nhất, học viên đọc đầu tiên</span>
                    <input className="input" value={lay(d, 'title')}
                           placeholder="Tìm ngách của anh chị"
                           onChange={(e) => sua(d.day, 'title', e.target.value)} />
                  </label>

                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="note">Đề bài — việc cụ thể phải làm hôm nay</span>
                    <textarea className="input" rows={5} value={lay(d, 'brief')}
                              placeholder={'Viết một bài giới thiệu bản thân cho khách hàng lý tưởng.\n\n'
                                + 'Ba ý bắt buộc:\n- Anh chị giúp ai\n- Giúp việc gì\n- Vì sao là anh chị'}
                              onChange={(e) => sua(d.day, 'brief', e.target.value)} />
                  </label>

                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="note">Link video hướng dẫn — để trống nếu không có</span>
                    <input className="input" value={lay(d, 'video_url')}
                           placeholder="https://youtu.be/..."
                           onChange={(e) => sua(d.day, 'video_url', e.target.value)} />
                  </label>

                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="note">Gợi ý làm bài — nằm trong khối mở ra được</span>
                    <textarea className="input" rows={3} value={lay(d, 'tips')}
                              placeholder="Chưa biết bắt đầu từ đâu thì viết như đang nhắn cho một người bạn."
                              onChange={(e) => sua(d.day, 'tips', e.target.value)} />
                  </label>

                  <div className="row">
                    <button className="btn primary" disabled={busy === d.day}
                            onClick={() => luu(d)}>
                      {busy === d.day ? 'Đang lưu…' : `Lưu ngày ${d.day}`}
                    </button>
                    {daCo && (
                      <button className="btn" disabled={busy === d.day}
                              onClick={() => xoa(d)}>Xoá nội dung ngày này</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
