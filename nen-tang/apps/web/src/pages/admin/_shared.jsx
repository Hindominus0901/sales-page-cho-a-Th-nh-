import BRAND from '@/brand.generated.js';
/**
 * Manh ghep dung chung cho toan bo khu vuc quan tri.
 *
 * Gom o mot cho nhung thu 11 trang deu can (bang cuon ngang, hop xac nhan, the
 * so lieu) de moi trang chi con phan viec rieng cua no.
 */
import React from 'react';
import { Loader2, AlertTriangle, Inbox, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Backend tra loi dang { ok:false, error:{ code, message } }, nhung lop
 * http-client dung nguyen doi tuong `error` lam thong diep -> err.message ra
 * "[object Object]". Boc lai o day de nguoi dung doc duoc cau tieng Viet that.
 */
export function errText(err) {
  const raw = err?.data?.error;
  if (raw && typeof raw === 'object' && raw.message) return String(raw.message);
  if (typeof raw === 'string' && raw) return raw;
  const msg = err?.message;
  if (msg && msg !== '[object Object]') return String(msg);
  return 'Có lỗi xảy ra, thử lại sau.';
}

export const fmtNumber = (n) => Number(n || 0).toLocaleString('vi-VN');
export const fmtMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
// Hien theo mui gio CUA THUONG HIEU chu khong theo may dang mo trang quan tri.
// Mot laptop dat mui gio khac se doc moi moc thoi gian lech di may tieng ma
// khong co dau hieu gi - va quan tri vien lay so do de doi chieu voi hoc vien.
const LECH_PHUT_TB = Number(BRAND.tzOffsetMinutes) || 0;
export const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return new Date(d.getTime() + LECH_PHUT_TB * 60000)
    .toLocaleString('vi-VN', { timeZone: 'UTC' });
};

/** "3 giờ trước" doc nhanh hon mot dau thoi gian day du trong danh sach dai. */
export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '—';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(value);
}

export const initialsOf = (name) => (name || '?').trim().split(/\s+/).slice(-2)
  .map((p) => p[0]).join('').toUpperCase();

const AVATAR_COLORS = [BRAND.colorHex, '#F5B841', '#7C3AED', '#0891B2', '#059669', '#DC2626', '#C9804D'];

export function avatarColor(name) {
  let hash = 0;
  const text = name || '';
  for (let i = 0; i < text.length; i += 1) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function InitialAvatar({ name, size = 36, className }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold text-white', className)}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </div>
  );
}

/** Khung trang: tieu de + mo ta + nut hanh dong ben phai. */
export function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight lg:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, description, action, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4 lg:p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Bang rong tren man hinh laptop -> cuon ngang chu khong bop cot lai. */
export function TableScroll({ children, className }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      {children}
    </div>
  );
}

export function LoadingBlock({ label = 'Đang tải...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-destructive" />
      <p className="text-sm font-semibold text-destructive">{errText(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({ children = 'Chưa có dữ liệu nào.' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6 opacity-60" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Ba trang thai cua moi danh sach o mot cho. Trang goi chi viet phan "co du
 * lieu", khong con lap lai if/else o 11 file.
 */
export function QueryState({ query, empty, emptyText, children }) {
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;
  if (empty) return <EmptyBlock>{emptyText}</EmptyBlock>;
  return children;
}

export function Kpi({ label, value, delta, tone = 'muted' }) {
  const toneClass = {
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-2xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
      {delta && <div className={cn('mt-1.5 text-[11px] font-semibold', toneClass)}>{delta}</div>}
    </div>
  );
}

/** Bieu do cot don gian - khong keo them thu vien chi de ve 8 cai cot. */
export function BarChart({ bars, height = 150 }) {
  const max = Math.max(1, ...bars.map((b) => b.value || 0));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} className="flex flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground">{b.display ?? b.value}</span>
          <div
            className="w-full rounded-t-md bg-primary/85"
            style={{ height: `${Math.round(((b.value || 0) / max) * 100)}%`, minHeight: 3 }}
            title={`${b.label}: ${b.display ?? b.value}`}
          />
          <span className="text-[10px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

const HEAT_LEVELS = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'];

/** Luoi ngay: moi cot la mot tuan, dam mau theo so hoat dong trong ngay. */
export function Heatmap({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((d) => {
            const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4));
            return (
              <div
                key={d.date}
                className={cn('h-[11px] w-[11px] rounded-[3px]', HEAT_LEVELS[level])}
                title={`${fmtDate(d.date)}: ${d.count === 0 ? 'không có hoạt động' : `${d.count} hoạt động`}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Hop xac nhan cho hanh dong khong lui lai duoc. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Xoá', onConfirm, pending,
  disabled = false, children,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Cho phep nhet mot o chon vao giua: co viec phai chon xong moi xac
            nhan duoc (vd gan luot cua mot ma la cho dung nguoi). */}
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Huỷ bỏ</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending || disabled}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hop xac nhan BAT BUOC nhap ly do. Backend ghi ly do vao so nhat ky quan tri;
 * mot dong nhat ky khong co ly do thi sau nay khong ai tra lai duoc chuyen gi
 * da xay ra, nen nut xac nhan khoa lai khi o trong.
 */
export function ReasonDialog({
  open, onOpenChange, title, description, confirmLabel = 'Xác nhận',
  reasonLabel = 'Lý do (bắt buộc)', placeholder = 'Ghi rõ lý do...', onConfirm, pending,
}) {
  const [reason, setReason] = React.useState('');

  React.useEffect(() => { if (open) setReason(''); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-reason">{reasonLabel}</Label>
          <Textarea
            id="admin-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            className="min-h-[90px] rounded-xl"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            className="rounded-full"
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O nhap chay thang trong bang - gon hon Input cua shadcn trong o hep. */
export function CellInput({ className, ...props }) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
        className,
      )}
    />
  );
}

export function CellSelect({ className, children, ...props }) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </select>
  );
}

/**
 * API funnel (/api/admin/*) dung phien dang nhap rieng, khong phai phien hoc
 * vien. 401 o do la "chua dang nhap ben do" chu khong phai he thong hong - noi
 * ro dieu do thay vi hien mot loi kho hieu.
 */
export function FunnelAuthNotice({ error }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h2 className="text-sm font-bold">Chưa đăng nhập khu vực quản trị funnel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Số liệu doanh thu và affiliate nằm ở hệ thống bán hàng, dùng tài khoản quản trị riêng
            (không phải tài khoản học viên). Đăng nhập ở trang quản trị của trang bán hàng rồi quay lại đây.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Máy chủ trả về: {errText(error)}</p>
          <Button asChild variant="outline" size="sm" className="mt-3 rounded-full">
            <a href="/admin" target="_blank" rel="noreferrer">Mở trang đăng nhập quản trị</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 401/503 tu API funnel = chua dang nhap hoac chua dat mat khau quan tri. */
export const isFunnelAuthError = (error) => error?.status === 401 || error?.status === 503;

export function StatusPill({ tone = 'muted', children }) {
  const toneClass = {
    good: 'bg-emerald-500/10 text-emerald-600',
    warn: 'bg-amber-500/15 text-amber-700',
    bad: 'bg-destructive/10 text-destructive',
    brand: 'bg-primary/10 text-primary',
    muted: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold', toneClass)}>
      {children}
    </span>
  );
}

/**
 * Kiem mot o link: tra ve cau canh bao, hoac '' neu on.
 *
 * VI SAO CAN: mot o de trong thi khong sao - nghia la khong giao gi qua link.
 * Nhung mot o co chu ma KHONG phai link thi hong ngam: nut "Mo qua" van hien,
 * hoc vien bam vao va rot vao trang 404, con chi Thanh thi khong biet. Loi hay
 * gap nhat la dan thieu "https://" (notion.site/abc) hoac dan ca cau chu.
 */
export function loiLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return 'Phải bắt đầu bằng https://';
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return 'Tên miền không hợp lệ';
    return '';
  } catch { return 'Không phải một đường link hợp lệ'; }
}

/** O nhap mot duong link, tu bao khi go sai dang. */
export function CellLink({ value, onChange, placeholder, className }) {
  const loi = loiLink(value);
  return (
    <span className="block">
      <CellInput
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(className, loi && 'border-destructive')}
        aria-invalid={!!loi}
      />
      {loi && <span className="mt-0.5 block text-[11px] font-semibold text-destructive">{loi}</span>}
    </span>
  );
}
