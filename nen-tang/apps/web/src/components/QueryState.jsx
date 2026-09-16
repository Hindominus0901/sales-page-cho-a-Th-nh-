import React from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Ba trang thai cua mot danh sach: dang tai · LOI · rong.
 *
 * Vi sao co file nay: truoc day nam trong pages/admin/_shared.jsx nen chi khu
 * QUAN TRI dung. Ben hoc vien, 11 trong 12 trang chi viet
 * `isLoading ? ... : x.length === 0 ? <EmptyState/> : <danh sach>` - khong doc
 * `isError` lan nao. Hau qua: API tra 500 va "chua co du lieu" hien RA Y HET
 * NHAU. Nguoi van hanh nhin mot trang trang khong biet la chua ai nhap noi dung
 * hay he thong dang hong - hai chuyen dan toi hai hanh dong khac han.
 *
 * Tach ra day thay vi import thang tu _shared.jsx: file do 419 dong va keo theo
 * alert-dialog + dialog, nhung thu trang hoc vien khong dung. _shared.jsx gio
 * re-export tu day nen 11 trang quan tri khong phai sua mot dong nao.
 */

/**
 * Backend tra loi dang { ok:false, error:{ code, message } }, nhung lop
 * http-client dung nguyen doi tuong `error` lam thong diep -> err.message ra
 * "[object Object]". Boc lai o day de nguoi dung doc duoc cau tieng Viet that.
 */
export function errText(err) {
  const raw = err?.data?.error;
  if (raw && typeof raw === 'object' && raw.message) return String(raw.message);
  if (typeof raw === 'string' && raw) return raw;

  // LOI MANG khong co `.status`: http-client goi fetch() khong boc try/catch,
  // nen mat song/DNS/CORS nem thang `TypeError: Failed to fetch`. De nguyen thi
  // nguoi Viet doc mot cau tieng Anh cua trinh duyet va khong biet phai lam gi.
  if (err && err.status === undefined && /fetch|network|load failed/i.test(String(err.message || ''))) {
    return 'Mất kết nối mạng. Kiểm tra đường truyền rồi bấm Thử lại.';
  }

  const msg = err?.message;
  if (msg && msg !== '[object Object]') return String(msg);
  return 'Có lỗi xảy ra, thử lại sau.';
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
 * Ba trang thai o mot cho. Trang goi chi viet phan "co du lieu".
 *
 * `empty` la boolean do TRANG tu tinh, khong tu suy tu data - vi "rong" cua moi
 * trang moi khac (co trang rong khi mang rong, co trang rong khi mot truong
 * nao do chua co).
 */
export function QueryState({ query, empty, emptyText, children }) {
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;
  if (empty) return <EmptyBlock>{emptyText}</EmptyBlock>;
  return children;
}
