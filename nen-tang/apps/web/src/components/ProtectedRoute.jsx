import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

/**
 * Ho so con thieu thu gi bat buoc khong?
 *
 * CHI CON HO TEN. Hai thu tung nam o day va deu da bo di, moi thu mot ly do:
 *
 *   - ANH DAI DIEN: nut tai anh tung hong, ma anh la dieu kien bat buoc, nen
 *     KHONG MOT AI vao noi lop - ke ca nguoi da tra 399k. Mot o nhap phu khong
 *     duoc phep khoa cua chinh.
 *   - NHOM THI DUA: chi Thanh chia nhom sau buoi Zoom dau tien, chia ngau
 *     nhien tu trang quan tri. Bat 300 nguoi tu chon nhom truoc khi biet nhom
 *     la gi chi lam ho phan van o cua, va chia ra cac nhom lech han nhau.
 *
 * Ten thi van bat buoc: thieu no thi giao dien goi nguoi ta la "ban", va bang
 * xep hang toan chu cai dau.
 */
const thieuHoSo = (u) => !u?.full_name?.trim();

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // Admin va coach khong bi chan: ho vao de lam viec, khong tham gia thi dua.
  // Chan ho lai la khoa chinh nguoi can vao sua du lieu ra ngoai.
  const laNhanSu = user?.role === 'admin' || user?.role === 'coach';
  if (!laNhanSu && thieuHoSo(user) && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
