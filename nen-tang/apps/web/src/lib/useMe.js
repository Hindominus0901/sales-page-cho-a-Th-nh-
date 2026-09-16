import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

/**
 * Nguoi dang dang nhap, doc qua react-query thay vi qua outlet context.
 *
 * Diem/xu doi ngay sau khi nop bai hay doi qua, nen trang nao lam thay doi
 * diem chi can invalidate ['me'] la moi cho hien so moi - khong phai reload.
 */
export function useMe() {
  const { user } = useAuth();
  const { data, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
    placeholderData: user || undefined,
    staleTime: 30_000,
  });

  // HET PHIEN thi phai tra ve null, dung tra ve `user` cu.
  //
  // Truoc day hook nay khong doc `isError`. Khi phien het han giua chung,
  // query ['me'] hong nhung `user` tu AuthContext van con nam do (da cu, tu lan
  // kiem luc khoi dong), nen hook van tra ve mot nguoi dung "con song". Man
  // hinh MatPhien trong AppLayout/Profile do do khong bao gio hien - giao dien
  // cu ve nhu binh thuong trong khi moi loi goi API deu 401.
  if (isError) return null;
  return data || user || null;
}

export const ME_KEY = ['me'];
