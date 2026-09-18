import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Tinh nang nao dang bat tren may chu.
 *
 * Vi sao can: Google, email, kho anh va AI deu la nhung thu chi chay khi co
 * khoa API tuong ung. Truoc day giao dien khong he biet dieu do, nen nut nao
 * cung hien ra binh thuong va nguoi dung chi phat hien khi da bam - nut Google
 * thi nem ho ra mot trang JSON, nut tai anh thi bao loi do.
 *
 * May chu suy cac co nay tu chinh bien moi truong (xem /api/config trong
 * worker/src/router.js), nen nap khoa xong la nut TU HIEN LAI - khong phai sua
 * code hay deploy them lan nua.
 *
 * MAC DINH LA TAT trong luc dang tai. Doan nguoc lai - coi nhu dang bat roi an
 * di neu sai - la mot cu nhay giao dien kho chiu, va te hon la mot cu bam vao
 * thu khong chay.
 */
const MAC_DINH = {
  google: false, email: false, uploads: false, ai: false, thanh_toan_tu_dong: false,
};

export function useKhaNang() {
  const { data, isLoading } = useQuery({
    queryKey: ['kha-nang'],
    queryFn: () => base44.config.get(),
    // Cau hinh khong doi trong mot phien lam viec.
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return {
    khaNang: { ...MAC_DINH, ...(data?.capabilities || {}) },
    dangTai: isLoading,
  };
}
