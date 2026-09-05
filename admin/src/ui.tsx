import { useEffect, useState, type ReactNode } from 'react';

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

const BAND_KIND: Record<string, string> = { hot: 'hot', warm: 'warm', cold: 'cold' };
const BAND_TEXT: Record<string, string> = { hot: 'NÓNG', warm: 'ẤM', cold: 'LẠNH' };

/** Điểm luôn đi kèm chữ: con số trần không nói được nên làm gì với lead này. */
export function ScoreBadge({ score, band }: { score: number; band: string }) {
  return <Badge kind={BAND_KIND[band] ?? 'mute'}>{BAND_TEXT[band] ?? band} · {score}</Badge>;
}

const ORDER_STATUS: Record<string, [string, string]> = {
  pending:        ['mute', 'Chờ chuyển khoản'],
  partially_paid: ['warm', 'Chuyển thiếu'],
  paid:           ['ok',   'Đã thanh toán'],
  overpaid:       ['warm', 'Thừa tiền'],
  cancelled:      ['mute', 'Đã huỷ'],
  expired:        ['mute', 'Hết hạn'],
  refunded:       ['bad',  'Đã hoàn tiền'],
};

const LEAD_STATUS: Record<string, [string, string]> = {
  new:        ['hot',  'Mới'],
  contacted:  ['warm', 'Đã liên hệ'],
  consulting: ['warm', 'Đang tư vấn'],
  won:        ['ok',   'Đã chốt'],
  lost:       ['mute', 'Không phù hợp'],
  spam:       ['bad',  'Rác'],
};

export const OrderStatus = ({ value }: { value: string }) => {
  const [kind, text] = ORDER_STATUS[value] ?? ['mute', value];
  return <Badge kind={kind}>{text}</Badge>;
};

export const LeadStatus = ({ value }: { value: string }) => {
  const [kind, text] = LEAD_STATUS[value] ?? ['mute', value];
  return <Badge kind={kind}>{text}</Badge>;
};

/**
 * Thẻ số liệu kiểu ADM: nhãn nhỏ ở trên, số to ở giữa, dòng thay đổi ở dưới.
 * Dòng thay đổi mới là thứ nói được tình hình — con số trần chỉ nói hiện trạng.
 */
export function Kpi(
  { label, value, delta, tone, deltaTone }:
  { label: string; value: ReactNode; delta?: ReactNode;
    tone?: 'dark' | 'accent' | 'alert'; deltaTone?: 'good' | 'warn' | 'bad' | 'mute' },
) {
  const color = deltaTone === 'good' ? 'var(--tot)'
    : deltaTone === 'warn' ? 'var(--canh)'
    : deltaTone === 'bad' ? 'var(--xau)' : 'var(--muc-3)';
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {delta ? <div className="d" style={{ color }}>{delta}</div> : null}
    </div>
  );
}

/** Giữ tên cũ để các trang chưa chuyển vẫn chạy. */
export function Stat(
  { value, label, tone }: { value: ReactNode; label: string; tone?: 'accent' | 'good' | 'alert' },
) {
  return <Kpi label={label} value={value}
              tone={tone === 'good' ? 'accent' : tone === 'accent' ? 'dark' : tone} />;
}

/** Cột chia tỉ lệ theo giá trị lớn nhất. Không cần thư viện biểu đồ cho việc này. */
export function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value.toLocaleString('vi-VN')}`}>
          <div className={`b ${d.value === 0 ? 'dim' : ''}`}
               style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} />
          <span className="lbl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Heatmap 8 tuần. Xếp theo cột, mỗi cột một tuần, bảy ô là bảy thứ trong tuần —
 * nhìn ra ngay tuần nào cả lớp im lặng.
 */
export function Heat({ days, max }: { days: { date: string; n: number }[]; max: number }) {
  const level = (n: number) => n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
  return (
    <div className="heat">
      {days.map((d) => (
        <i key={d.date} data-l={level(d.n)} title={`${d.date}: ${d.n} bài`} />
      ))}
    </div>
  );
}

export function Prog({ value, max = 21 }: { value: number; max?: number }) {
  return (
    <div className="prog" title={`${value}/${max}`}>
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

/** Bậc rank hiện kèm icon: chữ không thôi thì mọi bậc trông giống nhau. */
export function RankBadge({ tier }: { tier?: { name: string; icon: string } | null }) {
  if (!tier) return <span className="muted">—</span>;
  return <span className="badge mute">{tier.icon} {tier.name}</span>;
}

/** Chuỗi ngày: đứt rồi thì phải nhìn ra ngay, vì đó là lúc cần nhắn học viên. */
export function Streak({ n, alive }: { n: number; alive: boolean }) {
  if (!n) return <span className="muted">—</span>;
  return (
    <span className={`badge ${alive ? 'ok' : 'mute'}`}
          title={alive ? 'Chuỗi đang tiếp tục' : 'Chuỗi đã đứt'}>
      {alive ? '🔥' : '💤'} {n} ngày
    </span>
  );
}

export const Loading = ({ what = 'dữ liệu' }: { what?: string }) =>
  <div className="card card-pad muted">Đang tải {what}…</div>;

export const ErrorBox = ({ message }: { message: string }) =>
  <div className="alert err">{message}</div>;

export const Empty = ({ children }: { children: ReactNode }) =>
  <div className="card card-pad muted" style={{ textAlign: 'center', padding: '34px 20px' }}>{children}</div>;

/** Thông báo ngắn ở góc, tự tắt. */
export function useToast() {
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const node = message ? (
    <div style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 50, maxWidth: 380,
      padding: '13px 17px', borderRadius: 12, fontSize: 14, fontWeight: 600,
      color: '#fff', background: message.bad ? '#b91c1c' : '#2f7a4d',
      boxShadow: '0 8px 30px rgba(0,0,0,.18)',
    }}>{message.text}</div>
  ) : null;

  return {
    node,
    show: (text: string) => setMessage({ text }),
    fail: (text: string) => setMessage({ text, bad: true }),
  };
}

/** Hook tải dữ liệu tối giản — đủ dùng, không cần kéo thêm thư viện. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
