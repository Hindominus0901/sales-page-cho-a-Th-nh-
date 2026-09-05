import { useState } from 'react';
import { api } from '../api';
import { Kpi, Loading, ErrorBox, useLoad, useToast } from '../ui';

interface Data {
  mechanics: {
    coinPerSubmission: number; coinPerContent: number; coinPerCall: number;
    streakBonusPct: number; xpPerSubmission: number;
  };
  tiers: { name: string; icon: string; minXp: number }[];
}

const FIELDS: [keyof Data['mechanics'], string, string][] = [
  ['coinPerSubmission', 'Coin mỗi bài được duyệt',
   'Chỉ cộng khi bài được duyệt, không cộng lúc nộp.'],
  ['xpPerSubmission', 'XP mỗi bài được duyệt',
   'XP quyết định bậc. 21 bài × giá trị này nên bằng mốc bậc cao nhất.'],
  ['coinPerContent', 'Coin cho mỗi nội dung thêm', 'Bài đăng ngoài chương trình, cộng tay.'],
  ['coinPerCall', 'Coin cho mỗi buổi gọi', 'Tham gia buổi coaching hoặc gọi nhóm.'],
  ['streakBonusPct', 'Thưởng thêm mỗi ngày chuỗi (%)',
   'Chuỗi càng dài coin càng nhiều. Chặn trần ở gấp đôi.'],
];

export default function Mechanics() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<Data>(() => api.get('/api/admin/mechanics'));
  const [edit, setEdit] = useState<Record<string, string>>({});

  if (loading) return <Loading what="cơ chế" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const m = data.mechanics;
  const val = (k: string) => edit[k] ?? String(m[k as keyof typeof m]);
  const doi = Object.keys(edit).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const patch: Record<string, number> = {};
      for (const [k, v] of Object.entries(edit)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) patch[k] = n;
      }
      await api.put('/api/admin/mechanics', patch);
      setEdit({});
      toast.show('Đã lưu cơ chế. Áp dụng cho các bài được duyệt từ giờ trở đi.');
      reload();
    } catch (err) { toast.fail((err as Error).message); }
  }

  // Cho thấy ngay đổi con số thì học viên đi trọn 21 ngày nhận được bao nhiêu.
  const troi = Number(val('coinPerSubmission'));
  const bonus = Number(val('streakBonusPct'));
  let tongCoin = 0;
  for (let d = 1; d <= 21; d++) {
    tongCoin += Math.round(troi * Math.min(2, 1 + ((d - 1) * bonus) / 100));
  }
  const tongXp = Number(val('xpPerSubmission')) * 21;
  const bacCaoNhat = data.tiers[data.tiers.length - 1];

  return (
    <>
      {toast.node}
      <div className="head">
        <div>
          <h1>Cơ chế</h1>
          <p>
            Đổi ở đây chỉ áp dụng cho các bài được duyệt <b>từ giờ trở đi</b>. Coin và XP
            đã cộng cho học viên không bị tính lại — nếu tính lại, số dư của họ tự nhiên
            thay đổi mà không ai giải thích được.
          </p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <Kpi label="Đi trọn 21 ngày nhận được" value={`${tongCoin.toLocaleString('vi-VN')} coin`}
             delta="đã tính cả thưởng chuỗi" deltaTone="good" tone="accent" />
        <Kpi label="Và tích được" value={`${tongXp.toLocaleString('vi-VN')} XP`}
             delta={bacCaoNhat && tongXp >= bacCaoNhat.minXp
               ? `đủ chạm bậc ${bacCaoNhat.icon} ${bacCaoNhat.name}`
               : `CHƯA đủ bậc cao nhất (${bacCaoNhat?.minXp ?? 0} XP)`}
             deltaTone={bacCaoNhat && tongXp >= bacCaoNhat.minXp ? 'good' : 'bad'} />
        <Kpi label="Thưởng chuỗi tối đa" value={`×${Math.min(2, 1 + (20 * bonus) / 100).toFixed(2)}`}
             delta="ở ngày thứ 21" tone="dark" />
      </div>

      <form className="card card-pad" onSubmit={save} style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 14 }}>Coin và XP</h2>
        <div className="grid grid-2">
          {FIELDS.map(([key, label, hint]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input className="input num" type="number" min={0} value={val(key)}
                     onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} />
              <div className="note">{hint}</div>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" type="submit" disabled={!doi}>Lưu cơ chế</button>
          {doi && <button className="btn" type="button" onClick={() => setEdit({})}>Huỷ thay đổi</button>}
        </div>
      </form>

      <div className="card card-pad">
        <h2 style={{ marginBottom: 6 }}>Các bậc</h2>
        <p className="note" style={{ marginBottom: 14 }}>
          Bậc tính theo XP tích luỹ. Mốc cao nhất nên đặt bằng đúng số XP của 21 bài, để
          &ldquo;về đích đúng hạn&rdquo; và bậc cao nhất là cùng một chuyện.
        </p>
        <table>
          <thead><tr><th>Bậc</th><th className="right">Từ XP</th><th className="right">Tương đương</th></tr></thead>
          <tbody>
            {data.tiers.map((t) => (
              <tr key={t.name}>
                <td><span style={{ fontSize: 17, marginRight: 8 }}>{t.icon}</span><b>{t.name}</b></td>
                <td className="right num">{t.minXp.toLocaleString('vi-VN')}</td>
                <td className="right num muted">
                  {Number(val('xpPerSubmission')) > 0
                    ? `${Math.ceil(t.minXp / Number(val('xpPerSubmission')))} bài`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
