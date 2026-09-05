import { api, vnd, dateTime, displayPhone } from '../api';
import { Badge, Loading, ErrorBox, Empty, useLoad, useToast } from '../ui';

interface Student {
  id: string; full_name: string; phone: string; email: string | null; created_at: number;
  cohort: string | null; enrollment_status: string | null;
  progress_day: number | null; posts_done: number | null;
  order_code: string | null; amount_total: number | null;
}

export default function Students() {
  const toast = useToast();
  const { data, error, loading } = useLoad<{ students: Student[] }>(
    () => api.get('/api/admin/students'));

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Học viên</h1>
          <p>Học viên được tạo tự động ngay khi đơn hàng nhận đủ tiền.</p>
        </div>
      </div>

      {loading && <Loading what="học viên" />}
      {error && <ErrorBox message={error} />}
      {data && data.students.length === 0 && (
        <Empty>Chưa có học viên nào. Học viên xuất hiện ở đây sau khi có đơn thanh toán thành công.</Empty>
      )}

      {data && data.students.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Họ tên</th><th>Liên hệ</th><th>Đơn</th><th>Khoá</th>
                  <th>Tiến độ</th><th>Trạng thái</th><th>Vào lớp</th></tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.full_name}</td>
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
                  <td className="muted">{s.cohort ?? '—'}</td>
                  <td>
                    {s.progress_day !== null ? (
                      <>
                        <b>{s.progress_day}</b>/21 ngày
                        <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, marginTop: 5, width: 90 }}>
                          <div style={{
                            height: '100%', borderRadius: 999, background: 'var(--green)',
                            width: `${Math.min(100, (s.progress_day / 21) * 100)}%`,
                          }} />
                        </div>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <Badge kind={s.enrollment_status === 'active' ? 'ok'
                      : s.enrollment_status === 'completed' ? 'ok' : 'mute'}>
                      {s.enrollment_status === 'active' ? 'Đang học'
                        : s.enrollment_status === 'completed' ? 'Hoàn thành'
                        : s.enrollment_status ?? '—'}
                    </Badge>
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{dateTime(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
