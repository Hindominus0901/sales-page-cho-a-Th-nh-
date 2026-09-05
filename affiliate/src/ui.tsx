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

export function Stat(
  { value, label, tone }: { value: ReactNode; label: string; tone?: 'accent' | 'good' | 'alert' },
) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </div>
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
