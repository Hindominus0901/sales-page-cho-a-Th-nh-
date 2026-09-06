import { useState } from 'react';
import { api } from './api';

export default function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/api/admin/login', { email, password }); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="center-screen">
      <form className="card card-pad" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <h1 style={{ marginBottom: 4 }}>Quản trị</h1>
        <p className="note" style={{ margin: '0 0 20px' }}>Góc Creator</p>

        {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field">
          <label htmlFor="em">Email</label>
          <input id="em" className="input" type="email" required autoComplete="username"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Mật khẩu</label>
          <input id="pw" className="input" type="password" required autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Đang kiểm tra…' : 'Đăng nhập'}
        </button>
        {/* Quên mật khẩu phải nằm ngay đây. Người quên mật khẩu đang đứng ở
            đúng màn hình này, và bắt họ đi tìm chỗ khác là bắt họ nhắn Zalo. */}
        <a href="/quen-mat-khau?vai=admin" className="muted"
           style={{ display: 'block', textAlign: 'center', fontSize: 13, marginTop: 12 }}>
          Quên mật khẩu?
        </a>
      </form>
    </div>
  );
}
