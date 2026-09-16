import { QueryClient, QueryCache } from '@tanstack/react-query';

/**
 * Duong dan KHONG duoc da nguoi dung ra khoi khi gap 401.
 *
 * Bon trang nay von danh cho nguoi CHUA dang nhap. Neu mot query nao do o day
 * tra 401 (vi du /api/auth/me goi luc kiem phien) ma ta lai dieu huong ve
 * /login thi thanh vong lap: /login -> 401 -> /login -> ...
 */
const TRANG_CONG_KHAI = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Het phien GIUA CHUNG thi dua ve trang dang nhap, dung de nguoi dung treo.
 *
 * Truoc day KHONG co chot chan 401 nao. AuthContext.checkUserAuth co bat 401
 * nhung CHI chay mot lan luc khoi dong; sau khi authChecked = true thi khong gi
 * goi lai nua. Nen khi cookie phien het han trong luc dang dung, moi query bat
 * dau tra 401 va giao dien khong he biet: co trang treo vinh vien o "Dang tai…",
 * co trang hien man hinh trang.
 *
 * Dat o QueryCache thay vi tung trang: mot cho, va co tac dung cho CA khu quan
 * tri lan khu hoc vien.
 *
 * Ba lan ranh de khong da nguoi dung ra oan:
 *   1. chi khi status dung bang 401 (403 la "khong du quyen", khac han - de
 *      trang tu hien thong bao)
 *   2. chi khi dang KHONG o mot trang cong khai
 *   3. kem returnTo de dang nhap xong quay lai dung cho dang xem
 */
function xuLyHetPhien(error) {
  if (error?.status !== 401) return;
  if (typeof window === 'undefined') return;

  const duong = window.location.pathname;
  if (TRANG_CONG_KHAI.some((t) => duong.startsWith(t))) return;

  const quayLai = duong + window.location.search;
  window.location.href = `/login?returnTo=${encodeURIComponent(quayLai)}`;
}

export const queryClientInstance = new QueryClient({
  queryCache: new QueryCache({ onError: xuLyHetPhien }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
