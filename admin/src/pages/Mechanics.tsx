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
  /* Bậc sửa được. null = chưa động vào, dùng bản từ máy chủ. */
  const [bac, setBac] = useState<Data['tiers'] | null>(null);
  const [luuBac, setLuuBac] = useState(false);

  const ds = bac ?? data?.tiers ?? [];

  function suaBac(i: number, truong: 'icon' | 'name' | 'minXp', gia: string) {
    setBac(ds.map((t, j) => j === i
      ? { ...t, [truong]: truong === 'minXp' ? Number(gia) || 0 : gia }
      : t));
  }

  function themBac() {
    const caoNhat = ds.reduce((m, t) => Math.max(m, Number(t.minXp)), 0);
    setBac([...ds, { icon: '⭐', name: 'Bậc mới', minXp: caoNhat + 500 }]);
  }

  function xoaBac(i: number) {
    setBac(ds.filter((_, j) => j !== i));
  }

  async function luuCacBac() {
    const sach = ds
      .map((t) => ({ icon: String(t.icon).trim() || '⭐',
                     name: String(t.name).trim(), minXp: Number(t.minXp) || 0 }))
      .filter((t) => t.name)
      // Sắp theo XP: hàm xếp bậc duyệt từ thấp lên cao, nên thứ tự trong danh
      // sách phải đúng, không phụ thuộc vào thứ tự người gõ.
      .sort((a, b) => a.minXp - b.minXp);

    if (!sach.length) { toast.fail('Cần ít nhất một bậc.'); return; }
    if (sach[0]!.minXp !== 0) {
      toast.fail('Bậc thấp nhất phải bắt đầu từ 0 XP — ai chưa có XP nào cũng cần một bậc.');
      return;
    }
    if (new Set(sach.map((t) => t.minXp)).size !== sach.length) {
      toast.fail('Hai bậc không được cùng một mốc XP.');
      return;
    }

    setLuuBac(true);
    try {
      await api.put('/api/admin/mechanics', { tiers: sach });
      toast.show('Đã lưu các bậc.');
      setBac(null);
      reload();
    } catch (e) {
      toast.fail(e instanceof Error ? e.message : 'Không lưu được.');
    } finally { setLuuBac(false); }
  }

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
          Thêm hay bớt bậc đều được — mốc sẽ tự sắp lại theo XP khi lưu.
        </p>

        <table>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Biểu tượng</th>
              <th>Tên bậc</th>
              <th className="right" style={{ width: 130 }}>Từ XP</th>
              <th className="right" style={{ width: 110 }}>Tương đương</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {ds.map((t, i) => (
              <tr key={i}>
                <td>
                  <input className="input" value={t.icon} maxLength={4}
                         style={{ width: 56, textAlign: 'center', fontSize: 17 }}
                         onChange={(e) => suaBac(i, 'icon', e.target.value)} />
                </td>
                <td>
                  <input className="input" value={t.name}
                         onChange={(e) => suaBac(i, 'name', e.target.value)} />
                </td>
                <td>
                  <input className="input num" type="number" min={0} value={t.minXp}
                         style={{ textAlign: 'right' }}
                         onChange={(e) => suaBac(i, 'minXp', e.target.value)} />
                </td>
                <td className="right num muted">
                  {Number(val('xpPerSubmission')) > 0
                    ? `${Math.ceil(Number(t.minXp) / Number(val('xpPerSubmission')))} bài`
                    : '—'}
                </td>
                <td className="right">
                  {/* Bậc đầu tiên là mốc 0 — ai cũng phải thuộc về một bậc nào
                      đó ngay từ XP = 0, nên không cho xoá nó. */}
                  {ds.length > 1 && i > 0 && (
                    <button className="btn sm" type="button" onClick={() => xoaBac(i)}>Xoá</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" type="button" onClick={themBac}>Thêm bậc</button>
          {bac && (
            <>
              <button className="btn primary" type="button" disabled={luuBac}
                      onClick={luuCacBac}>
                {luuBac ? 'Đang lưu…' : 'Lưu các bậc'}
              </button>
              <button className="btn" type="button" onClick={() => setBac(null)}>Huỷ thay đổi</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
