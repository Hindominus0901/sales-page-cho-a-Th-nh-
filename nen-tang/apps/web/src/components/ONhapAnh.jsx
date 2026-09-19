import React from 'react';
import { Loader2, ImagePlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useKhaNang } from '@/lib/useKhaNang';
import { cn } from '@/lib/utils';

/**
 * O nhap anh cho trang quan tri: DAN LINK va TAI LEN, luon di cung nhau.
 *
 * ============ VI SAO GOM THANH MOT COMPONENT ============
 *
 * AdminRewards va AdminProducts moi trang tu viet lai cung mot khoi: mot o
 * nhap, mot nut "Tai anh", mot bien `dangTaiAnh`, mot ham `chonAnh` goi
 * UploadFile roi bat loi. Ba cho khac (anh bia thu thach, anh bia buoi hoc,
 * anh bia khoa hoc) thi CHI CO O CHU TRAN - khong nut tai len, khong kiem gi,
 * va nguoi van hanh khong co cach nao dua mot tam anh tu may minh len.
 *
 * Chep khoi do them ba lan la ba ban sao se troi khac nhau. Gom mot lan o day.
 *
 * ============ HAI DUONG KHONG LOAI TRU NHAU ============
 *
 * O dan link hien LUON LUON, ke ca khi kho anh dang bat - dung ly do da ghi o
 * ODanLinkAnh.jsx:13. Rat nhieu nguoi co san anh tren Drive hay Facebook; bat
 * kho anh len ma cat mat duong dan link la lay di mot duong dang chay tot.
 *
 * Nut tai len chi hien khi may chu THAT SU co kho anh (`khaNang.uploads`).
 * Khong co co do thi nut van bam duoc va lan nao cung ket thuc bang mot toast
 * do, vi POST /api/files tra 503.
 */
export default function ONhapAnh({
  value,
  onChange,
  nhan = 'Ảnh',
  goiY,
  className,
}) {
  const { khaNang } = useKhaNang();
  const { toast } = useToast();
  const [dangTai, setDangTai] = React.useState(false);

  const chonTep = async (e) => {
    const file = e.target.files?.[0];
    // Xoa ngay de chon LAI CUNG MOT TEP van kich hoat onChange. Khong xoa thi
    // nguoi ta tai hong mot lan roi chon lai dung tep do se tuong nut chet.
    e.target.value = '';
    if (!file) return;
    setDangTai(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      onChange(res.file_url);
    } catch (err) {
      toast({
        title: 'Không tải được ảnh',
        description: err?.message || 'Thử lại, hoặc dán link ảnh vào ô bên cạnh.',
        variant: 'destructive',
      });
    } finally {
      setDangTai(false);
    }
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Input
        type="url"
        inputMode="url"
        value={value || ''}
        onChange={(e) => onChange(e.target.value.trim())}
        aria-label={nhan}
        placeholder={goiY || (khaNang.uploads
          ? `${nhan} — dán link hoặc bấm Tải ảnh`
          : `${nhan} — dán link ảnh vào đây`)}
        className="h-9 rounded-xl text-[13px]"
      />
      {khaNang.uploads && (
        <label
          className={cn(
            'flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-border px-2.5 py-1.5',
            'text-xs font-bold hover:bg-secondary',
            dangTai && 'pointer-events-none opacity-60',
          )}
          title={`Tải ${nhan.toLowerCase()} từ máy lên`}
        >
          {dangTai
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <ImagePlus className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{dangTai ? 'Đang tải' : 'Tải ảnh'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={chonTep} disabled={dangTai} />
        </label>
      )}
    </div>
  );
}
