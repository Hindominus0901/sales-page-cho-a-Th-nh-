import { useState } from 'react';
import { api, vnd, dateTime, displayPhone } from '../api';
import { Badge, Loading, ErrorBox, Empty, Prog, Streak, useLoad, useToast } from '../ui';

interface Student {
  id: string; full_name: string; phone: string; email: string | null; created_at: number;
  coin: number; xp: number; streak_current: number;
  enrollment_id: string | null; cohort: string | null; enrollment_status: string | null;
  progress_day: number | null; posts_done: number | null;
  last_submit_date: string | null; last_seen_at: number | null;
  order_code: string | null; amount_total: number | null;
}

/**
 * Chuỗi còn sống nếu bài cuối nộp hôm nay hoặc hôm qua (giờ VN).
 * Cùng luật với isStreakAlive ở máy chủ (src/lib/game/streak.ts).
 */
function chuoiConSong(lastSubmitDate: string | null): boolean {
  if (!lastSubmitDate) return false;
  const homNay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const homQua = new Date(Date.now() + 7 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  return lastSubmitDate === homNay || lastSubmitDate === homQua;
}

/** Bao nhiêu ngày im lặng thì coi là đang tụt lại. Khớp với con số ở Dashboard. */
const NGAY_TUT_LAI = 3;

function soNgayIm(lastSubmitDate: string | null): number | null {
  if (!lastSubmitDate) return null;
  const homNay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return Math.round(
    (Date.parse(homNay + 'T00:00:00Z') - Date.parse(lastSubmitDate + 'T00:00:00Z')) / 86400000);
}

export default function Students() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<{ students: Student[] }>(
    () => api.get('/api/admin/students'));
  const [busy, setBusy] = useState<string | null>(null);

  /* Lọc "đang tụt lại" — chỗ mà dòng cảnh báo trên Dashboard dẫn tới.
     Lọc ở phía trình duyệt vì danh sách tối đa 300 dòng; thêm tham số truy vấn
     cho máy chủ chỉ để lọc bấy nhiêu là thừa. */
  const loc = new URLSearchParams(location.hash.split('?')[1] ?? '').get('loc');
  const [chiTutLai, setChiTutLai] = useState(loc === 'tut-lai');

  const danhSach = (data?.students ?? []).filter((s) => {
    if (!chiTutLai) return true;
    if (s.enrollment_status !== 'active') return false;
    const n = soNgayIm(s.last_submit_date);
    return n === null || n >= NGAY_TUT_LAI;
  });

  const linkOf = (token: string) => `${location.origin}/hoc/${token}`;

  /* Mã vào lớp KHÔNG còn nằm trong danh sách — xin riêng từng người khi cần.
     Danh sách trả 300 mã một lượt là biến màn hình này thành một lượt tải chìa
     khoá cả lớp. Lấy lẻ thì có ghi nhật ký, truy được ai đã lấy link của ai. */
  async function copyLink(s: Student) {
    if (!s.enrollment_id) return;
    setBusy(s.id);
    try {
      const r = await api.get<{ token: string }>(
        `/api/admin/enrollments/${s.enrollment_id}/link`);
      try {
        await navigator.clipboard.writeText(linkOf(r.token));
        toast.show(`Đã chép link của ${s.full_name}. Gửi Zalo cho học viên là dùng được ngay.`);
      } catch {
        // Trình duyệt chặn clipboard (thường là do không chạy trên https) —
        // hiện link ra để anh Thành bôi đen chép tay, còn hơn im lặng không có gì.
        toast.fail('Trình duyệt không cho chép tự động. Link: ' + linkOf(r.token));
      }
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không lấy được link.');
    } finally {
      setBusy(null);
    }
  }

  async function reissue(s: Student) {
    if (!s.enrollment_id) return;
    if (!confirm(`Cấp link mới cho ${s.full_name}? Link cũ sẽ hết dùng được ngay.`)) return;
    setBusy(s.id);
    try {
      await api.post(`/api/admin/enrollments/${s.enrollment_id}/cap-lai-link`);
      toast.show('Đã cấp link mới. Nhớ gửi lại cho học viên.');
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không cấp lại được link.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Xếp khoá, đóng khoá, tạm dừng.
   *
   * Endpoint PATCH /api/admin/enrollments/:id đã có từ lâu, đã kiểm tra hợp lệ,
   * đã ghi nhật ký — chỉ thiếu cái nút. Không có nút thì ba việc này phải làm
   * bằng wrangler d1 execute, và trên thực tế là không ai làm.
   */
  async function suaGhiDanh(s: Student, thayDoi: Record<string, unknown>, loiBao: string) {
    if (!s.enrollment_id) return;
    setBusy(s.id);
    try {
      await api.patch(`/api/admin/enrollments/${s.enrollment_id}`, thayDoi);
      toast.show(loiBao);
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không lưu được.');
    } finally { setBusy(null); }
  }

  function xepKhoa(s: Student) {
    const k = prompt(`Xếp ${s.full_name} vào khoá nào? (ví dụ K1-2026-09)`, s.cohort ?? '');
    if (k === null) return;
    suaGhiDanh(s, { cohort: k.trim() }, k.trim() ? `Đã xếp vào khoá ${k.trim()}.` : 'Đã bỏ khoá.');
  }

  function doiTrangThai(s: Student, status: string, nhan: string) {
    if (!confirm(`${nhan} cho ${s.full_name}?`)) return;
    suaGhiDanh(s, { status }, `${nhan} xong.`);
  }

  /**
   * Cộng hoặc trừ coin bằng tay.
   *
   * Endpoint đã có, sổ cái đã có, và hai trường trong màn hình Cơ chế ("coin mỗi
   * buổi gọi", "coin mỗi nội dung thêm") được thiết kế để dùng đúng đường này.
   * Không có nút thì đặt xong hai con số đó cũng chẳng cộng được cho ai.
   */
  async function chinhCoin(s: Student) {
    const raw = prompt(
      `Cộng hoặc trừ bao nhiêu coin cho ${s.full_name}?\n`
      + `Số dương là cộng, số âm là trừ. Hiện có ${s.coin ?? 0} coin.`, '');
    if (raw === null) return;
    const delta = Number(String(raw).replace(/[^0-9-]/g, ''));
    if (!Number.isFinite(delta) || delta === 0) {
      toast.fail('Anh nhập một con số khác 0 giúp em.');
      return;
    }
    const note = prompt('Lý do? (ghi vào sổ cái coin, học viên không thấy)', '') ?? '';
    setBusy(s.id);
    try {
      await api.post(`/api/admin/students/${s.id}/coin`, { delta, note });
      toast.show(`Đã ${delta > 0 ? 'cộng' : 'trừ'} ${Math.abs(delta)} coin.`);
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không chỉnh được coin.');
    } finally { setBusy(null); }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Học viên</h1>
          <p>Học viên được tạo tự động ngay khi đơn hàng nhận đủ tiền. Mỗi người có
             một đường link riêng để tự nộp bài — chép rồi gửi Zalo cho họ.</p>
        </div>
        <div className="row">
          <button className={`btn sm ${chiTutLai ? 'primary' : ''}`}
                  onClick={() => setChiTutLai(!chiTutLai)}>
            {chiTutLai ? 'Đang xem người tụt lại' : `Lọc người ${NGAY_TUT_LAI}+ ngày không nộp`}
          </button>
        </div>
      </div>

      {loading && <Loading what="học viên" />}
      {error && <ErrorBox message={error} />}
      {data && danhSach.length === 0 && (
        <Empty>
          {chiTutLai
            ? 'Không ai đang tụt lại. Cả lớp đều nộp bài trong ba ngày qua.'
            : 'Chưa có học viên nào. Học viên xuất hiện ở đây sau khi có đơn thanh toán thành công.'}
        </Empty>
      )}

      {data && data.students.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Họ tên</th><th>Liên hệ</th><th>Đơn</th><th>Tiến độ</th>
                  <th>Coin</th><th>Chuỗi</th><th>Link nộp bài</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {danhSach.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>
                    {s.full_name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.cohort ? `Khoá ${s.cohort}` : 'Chưa xếp khoá'}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {displayPhone(s.phone)}
                    {s.email && <div className="muted">{s.email}</div>}
                  </td>
                  <td>
                    {s.order_code
                      ? <a className="mono" href={`#/don-hang/${s.order_code}`}>{s.order_code}</a>
                      : '—'}
                    <div className="muted" style={{ fontSize: 12 }}>{vnd(s.amount_total)}</div>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    {s.posts_done !== null ? (
                      <>
                        <b>{s.posts_done}</b>/21 bài
                        <Prog value={s.posts_done} />
                      </>
                    ) : '—'}
                  </td>
                  <td className="mono">{s.coin?.toLocaleString('vi-VN') ?? 0}</td>
                  <td>
                    {/* alive tính bằng NGÀY NỘP CUỐI, không phải bằng con số.
                        streak_current chỉ đổi khi có bài mới được duyệt, nên
                        người nộp 8 ngày rồi biến mất 5 ngày vẫn giữ số 8 và
                        ngọn lửa vẫn cháy — đúng lúc lẽ ra phải báo động.
                        Màn Duyệt bài đã tính đúng bằng isStreakAlive. */}
                    <Streak n={s.streak_current ?? 0} alive={chuoiConSong(s.last_submit_date)} />
                  </td>
                  <td>
                    {s.enrollment_id ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn sm" onClick={() => copyLink(s)}>Chép link</button>
                        <button className="btn sm" disabled={busy === s.id}
                                onClick={() => reissue(s)}>
                          {busy === s.id ? '…' : 'Cấp lại'}
                        </button>
                        <div className="muted" style={{ fontSize: 12, width: '100%' }}>
                          {s.last_seen_at ? `Mở lần cuối ${dateTime(s.last_seen_at)}` : 'Chưa mở lần nào'}
                      {s.enrollment_status === 'active' && (() => {
                        const n = soNgayIm(s.last_submit_date);
                        if (n === null) return ' · chưa nộp bài nào';
                        return n >= NGAY_TUT_LAI ? ` · ${n} ngày chưa nộp` : '';
                      })()}
                        </div>
                      </div>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>
                    <Badge kind={s.enrollment_status === 'active' || s.enrollment_status === 'completed' ? 'ok' : 'mute'}>
                      {s.enrollment_status === 'active' ? 'Đang học'
                        : s.enrollment_status === 'completed' ? 'Hoàn thành'
                        : s.enrollment_status ?? '—'}
                    </Badge>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      Vào lớp {dateTime(s.created_at)}
                    </div>
                    {s.enrollment_id && (
                      <div className="row" style={{ gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                        <button className="btn sm" disabled={busy === s.id}
                                onClick={() => xepKhoa(s)}>Xếp khoá</button>
                        <button className="btn sm" disabled={busy === s.id}
                                onClick={() => chinhCoin(s)}>± coin</button>
                        {s.enrollment_status === 'active' && (
                          <>
                            <button className="btn sm" disabled={busy === s.id}
                                    onClick={() => doiTrangThai(s, 'paused', 'Tạm dừng')}>
                              Tạm dừng
                            </button>
                            <button className="btn sm" disabled={busy === s.id}
                                    onClick={() => doiTrangThai(s, 'completed', 'Đánh dấu hoàn thành')}>
                              Hoàn thành
                            </button>
                          </>
                        )}
                        {s.enrollment_status !== 'active' && (
                          <button className="btn sm" disabled={busy === s.id}
                                  onClick={() => doiTrangThai(s, 'active', 'Mở lại lớp')}>
                            Mở lại
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
