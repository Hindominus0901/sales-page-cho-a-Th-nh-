import { api, displayPhone } from '../api';
import { Kpi, Heat, RankBadge, Streak, Prog, Loading, ErrorBox, Empty, useLoad } from '../ui';

interface Row {
  id: string; position: number; full_name: string; phone: string;
  xp: number; coin: number; streak_current: number; streak_best: number;
  cohort: string | null; progress_day: number | null; posts_done: number | null;
  streakAlive: boolean;
  rank: { tier: { name: string; icon: string }; next: { name: string } | null;
          progress: number; xpToNext: number };
}

export default function Leaderboard() {
  const lb = useLoad<{ leaderboard: Row[]; tiers: { name: string; icon: string; minXp: number }[] }>(
    () => api.get('/api/admin/leaderboard'));
  const hm = useLoad<{ days: { date: string; n: number }[]; max: number }>(
    () => api.get('/api/admin/heatmap'));

  if (lb.loading) return <Loading what="bảng xếp hạng" />;
  if (lb.error) return <ErrorBox message={lb.error} />;
  if (!lb.data) return null;

  const rows = lb.data.leaderboard;
  const dangGiu = rows.filter((r) => r.streakAlive).length;
  const veDich = rows.filter((r) => (r.posts_done ?? 0) >= 21).length;
  const tongBai = rows.reduce((s, r) => s + (r.posts_done ?? 0), 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>Bảng xếp hạng</h1>
          <p>
            Xếp theo XP. Chuỗi ngày là thứ đáng nhìn nhất ở đây — ai vừa đứt chuỗi
            là người cần nhắn ngay hôm nay, trước khi họ bỏ hẳn.
          </p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Học viên đang giữ chuỗi" value={dangGiu}
             delta={`${rows.length ? Math.round((dangGiu / rows.length) * 100) : 0}% cả lớp`}
             deltaTone={dangGiu > rows.length / 2 ? 'good' : 'warn'} tone="accent" />
        <Kpi label="Đã đi trọn 21 ngày" value={veDich} delta="đủ điều kiện học bổng" deltaTone="good" />
        <Kpi label="Tổng bài đã duyệt" value={tongBai} />
        <Kpi label="Chuỗi dài nhất" value={Math.max(0, ...rows.map((r) => r.streak_best))}
             delta="ngày liên tiếp" tone="dark" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2>Hoạt động 8 tuần gần nhất</h2>
          <span className="note">Mỗi ô một ngày, đậm dần theo số bài nộp</span>
        </div>
        {hm.loading && <span className="note">Đang tải…</span>}
        {hm.data && (
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <Heat days={hm.data.days} max={hm.data.max} />
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 10 }}>Các bậc</h2>
        <div className="row">
          {lb.data.tiers.map((t) => (
            <span className="badge mute" key={t.name}>
              {t.icon} {t.name} <span className="num muted">· {t.minXp} XP</span>
            </span>
          ))}
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Đi trọn 21 ngày là chạm bậc cao nhất — khớp với điều kiện học bổng
          &ldquo;về đích đúng hạn&rdquo; ghi trên trang bán.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty>Chưa có học viên nào. Bảng này hiện lên sau khi có đơn thanh toán đầu tiên.</Empty>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Học viên</th><th>Bậc</th><th className="right">XP</th>
                  <th className="right">Coin</th><th>Chuỗi</th><th>Tiến độ</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num muted">{r.position}</td>
                  <td>
                    <b>{r.full_name}</b>
                    <div className="muted mono">{displayPhone(r.phone)}{r.cohort ? ` · ${r.cohort}` : ''}</div>
                  </td>
                  <td>
                    <RankBadge tier={r.rank.tier} />
                    {r.rank.next && (
                      <div className="note">còn {r.rank.xpToNext} XP tới {r.rank.next.name}</div>
                    )}
                  </td>
                  <td className="right num"><b>{r.xp.toLocaleString('vi-VN')}</b></td>
                  <td className="right num">{r.coin.toLocaleString('vi-VN')}</td>
                  <td><Streak n={r.streak_current} alive={r.streakAlive} />
                      {r.streak_best > r.streak_current && (
                        <div className="note">kỷ lục {r.streak_best}</div>
                      )}</td>
                  <td>
                    <Prog value={r.posts_done ?? 0} />
                    <div className="note num">{r.posts_done ?? 0}/21 bài</div>
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
