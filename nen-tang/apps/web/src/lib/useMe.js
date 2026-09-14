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
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
    placeholderData: user || undefined,
    staleTime: 30_000,
  });
  return data || user || null;
}

export const ME_KEY = ['me'];
