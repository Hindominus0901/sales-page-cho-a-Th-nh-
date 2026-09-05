import { useState } from 'react';
import { api, dateTime } from '../api';
import { Badge, Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Person {
  id: string; name: string; email: string;
  role: 'owner' | 'admin' | 'staff';
  is_active: number; last_login_at: number | null; created_at: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ hệ thống', admin: 'Quản trị', staff: 'Nhân viên',
};

/**
 * Vai trò mà không ai biết nó chặn cái gì thì chỉ là chữ trang trí. Bảng này
 * nói thẳng ranh giới, và ranh giới đó khớp với requireRole trong mã nguồn.
 */
const ROLE_CAN: { role: string; can: string }[] = [
  { role: 'Chủ hệ thống', can: 'Tất cả, và là vai trò duy nhất quản lý được nhân sự.' },
  { role: 'Quản trị', can: 'Duyệt bài, duyệt và chi hoa hồng, sửa nội dung trang, đổi cơ chế thưởng.' },
  { role: 'Nhân viên', can: 'Xem và chăm lead, xem đơn hàng. KHÔNG đụng được vào tiền và cơ chế.' },
];

export default function Staff() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<{ staff: Person[]; me: string }>(
    () => api.get('/api/admin/staff'));

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Mật khẩu chỉ tồn tại trong màn hình này, đúng một lần. Không có đường nào
  // đọc lại được — quên thì đặt lại cái mới.
  const [fresh, setFresh] = useState<{ email: string; password: string } | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy('new');
    try {
      const res = await api.post<{ password: string }>('/api/admin/staff', {
        name: f.get('name'), email: f.get('email'), role: f.get('role'),
      });
      setFresh({ email: String(f.get('email')), password: res.password });
      setAdding(false);
      reload();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'Không thêm được người này.');
    } finally {
      setBusy(null);
    }
  }

  async function patch(p: Person, body: Record<string, unknown>, what: string) {
    setBusy(p.id);
    try {
      await api.patch(`/api/admin/staff/${p.id}`, body);
      toast.show(what);
      reload();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'Không đổi được.');
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(p: Person) {
    const laToi = p.id === data?.me;
    const hoi = laToi
      ? 'Đặt lại mật khẩu của chính anh? Lần đăng nhập sau phải dùng mật khẩu mới.'
      : `Đặt lại mật khẩu cho ${p.name}? Phiên đăng nhập hiện tại của họ sẽ bị đăng xuất.`;
    if (!confirm(hoi)) return;
    setBusy(p.id);
    try {
      const res = await api.post<{ password: string }>(`/api/admin/staff/${p.id}/mat-khau`);
      setFresh({ email: p.email, password: res.password });
      reload();
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'Không đặt lại được mật khẩu.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Nhân sự</h1>
          <p>Ai vào được trang quản trị, và làm được gì trong đó.</p>
        </div>
        <button className="btn primary" onClick={() => { setAdding((v) => !v); setFresh(null); }}>
          {adding ? 'Thôi' : 'Thêm người'}
        </button>
      </div>

      {fresh && (
        <div className="card" style={{ borderColor: 'var(--xanh-vien)', background: 'var(--xanh-mo)', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Mật khẩu cho {fresh.email}</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.04em', marginBottom: 8 }}>
            {fresh.password}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {fresh.email === data?.staff.find((s) => s.id === data.me)?.email
              ? 'Chép ra chỗ an toàn ngay. Lần đăng nhập sau anh dùng mật khẩu này — '
              : 'Gửi cho họ ngay bây giờ. '}
            Đóng thẻ này là không xem lại được nữa — hệ thống chỉ lưu bản băm,
            không lưu mật khẩu. Quên thì đặt lại cái mới.
          </p>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setFresh(null)}>
            Đã gửi, ẩn đi
          </button>
        </div>
      )}

      {adding && (
        <form className="card" onSubmit={add} style={{ marginBottom: 16, display: 'grid', gap: 12, maxWidth: 480 }}>
          <div className="field">
            <label>Họ tên</label>
            <input className="input" name="name" required placeholder="Nguyễn Văn A" />
          </div>
          <div className="field">
            <label>Email đăng nhập</label>
            <input className="input" name="email" type="email" required placeholder="a@goccreator.vn" />
          </div>
          <div className="field">
            <label>Vai trò</label>
            <select className="input" name="role" defaultValue="staff">
              <option value="staff">Nhân viên — xem và chăm lead</option>
              <option value="admin">Quản trị — duyệt bài, duyệt hoa hồng, sửa nội dung</option>
              <option value="owner">Chủ hệ thống — tất cả, gồm quản lý nhân sự</option>
            </select>
          </div>
          <button className="btn primary" type="submit" disabled={busy === 'new'}>
            {busy === 'new' ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>
      )}

      {loading && <Loading what="nhân sự" />}
      {error && <ErrorBox message={error} />}

      {data && (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr><th>Người</th><th>Vai trò</th><th>Trạng thái</th>
                    <th>Đăng nhập gần nhất</th><th></th></tr>
              </thead>
              <tbody>
                {data.staff.map((p) => {
                  const laToi = p.id === data.me;
                  return (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : .55 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {p.name}{laToi && <span className="muted" style={{ fontWeight: 400 }}> · anh</span>}
                        </div>
                        <div className="muted mono" style={{ fontSize: 12.5 }}>{p.email}</div>
                      </td>
                      <td>
                        <select className="input" style={{ height: 32, fontSize: 13, width: 150 }}
                                value={p.role} disabled={laToi || busy === p.id}
                                onChange={(e) => patch(p, { role: e.target.value },
                                  `${p.name} nay là ${ROLE_LABEL[e.target.value]}.`)}>
                          <option value="staff">Nhân viên</option>
                          <option value="admin">Quản trị</option>
                          <option value="owner">Chủ hệ thống</option>
                        </select>
                      </td>
                      <td>
                        <Badge kind={p.is_active ? 'ok' : 'mute'}>
                          {p.is_active ? 'Đang hoạt động' : 'Đã tắt'}
                        </Badge>
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>
                        {p.last_login_at ? dateTime(p.last_login_at) : 'Chưa đăng nhập lần nào'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sm" disabled={busy === p.id}
                                onClick={() => resetPassword(p)}>Đặt lại mật khẩu</button>
                        {!laToi && (
                          <button className="btn sm danger" style={{ marginLeft: 6 }} disabled={busy === p.id}
                                  onClick={() => patch(p, { isActive: !p.is_active },
                                    p.is_active ? `Đã tắt tài khoản của ${p.name}.` : `Đã bật lại ${p.name}.`)}>
                            {p.is_active ? 'Tắt' : 'Bật lại'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Ba vai trò khác nhau chỗ nào</h2>
            <table>
              <tbody>
                {ROLE_CAN.map((r) => (
                  <tr key={r.role}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.role}</td>
                    <td className="muted">{r.can}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
              Tắt tài khoản hoặc đặt lại mật khẩu sẽ đăng xuất người đó ngay lập tức.
              Hệ thống luôn giữ ít nhất một Chủ hệ thống đang hoạt động — không hạ vai
              hay tắt được người cuối cùng.
            </p>
          </div>
        </>
      )}
    </>
  );
}
