import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../ui';

const MIN = 12;

/**
 * Tự đổi mật khẩu.
 *
 * Khác với nút "Đặt lại mật khẩu" ở màn hình Nhân sự: nút kia sinh mật khẩu
 * ngẫu nhiên và dành cho chủ hệ thống cứu người quên mật khẩu. Trang này để
 * mỗi người tự đặt cái mình nhớ được — và mọi vai trò đều vào được, vì nhân
 * viên cũng phải đổi được mật khẩu của họ.
 */
export default function MatKhau() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [xong, setXong] = useState(false);

  // Kiểm ở đây chỉ để nói sớm cho người gõ. Máy chủ kiểm lại đầy đủ và nó mới
  // là chỗ quyết định — trình duyệt thì ai cũng sửa được.
  const canhBao = next.length > 0 && next.length < MIN
    ? `Còn thiếu ${MIN - next.length} ký tự nữa.`
    : next && again && next !== again
      ? 'Hai ô mật khẩu mới chưa giống nhau.'
      : null;

  const duocGui = cur.length > 0 && next.length >= MIN && next === again && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!duocGui) return;
    setBusy(true);
    try {
      await api.post('/api/admin/me/mat-khau', { current: cur, next });
      setCur(''); setNext(''); setAgain('');
      setXong(true);
      toast.show('Đã đổi mật khẩu.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'Không đổi được mật khẩu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Đổi mật khẩu</h1>
          <p>Mật khẩu của chính anh chị. Không ai khác xem được, kể cả chủ hệ thống.</p>
        </div>
      </div>

      {xong && (
        <div className="card" style={{ borderColor: 'var(--xanh-vien)', background: 'var(--xanh-mo)', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Đã đổi xong</div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Lần đăng nhập sau dùng mật khẩu mới. Anh chị vẫn đang đăng nhập ở
            máy này, nhưng mọi máy khác đã bị đăng xuất.
          </p>
        </div>
      )}

      <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 14, maxWidth: 460 }}>
        <div className="field">
          <label>Mật khẩu hiện tại</label>
          <input className="input" type="password" autoComplete="current-password"
                 value={cur} onChange={(e) => setCur(e.target.value)} required />
        </div>
        <div className="field">
          <label>Mật khẩu mới</label>
          <input className="input" type="password" autoComplete="new-password"
                 value={next} onChange={(e) => { setNext(e.target.value); setXong(false); }} required />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>
            Từ {MIN} ký tự. Đừng dùng tên thương hiệu, email của mình, hay những
            chuỗi quen thuộc như "123456" — máy chủ từ chối những cái đó.
          </div>
        </div>
        <div className="field">
          <label>Nhập lại mật khẩu mới</label>
          <input className="input" type="password" autoComplete="new-password"
                 value={again} onChange={(e) => setAgain(e.target.value)} required />
        </div>

        {canhBao && (
          <div className="muted" style={{ fontSize: 13, color: 'var(--canh)' }}>{canhBao}</div>
        )}

        <button className="btn primary" type="submit" disabled={!duocGui}>
          {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
      </form>

      <div className="card card-pad" style={{ marginTop: 16, maxWidth: 460 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Quên mật khẩu thì sao</div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Hệ thống chỉ lưu bản băm một chiều — không ai đọc lại được mật khẩu,
          kể cả người dựng hệ. Quên thì nhờ chủ hệ thống vào Nhân sự bấm
          "Đặt lại mật khẩu", máy sinh cái mới và hiện đúng một lần.
        </p>
      </div>
    </>
  );
}
