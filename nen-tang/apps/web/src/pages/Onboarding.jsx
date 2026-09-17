/**
 * Hoan tat ho so truoc khi vao lop.
 *
 * Truoc man hinh nay khong co buoc onboarding nao: dang ky bang email xong la
 * vao thang dashboard voi `full_name` rong, giao dien goi nguoi ta la "bạn", va
 * bang xep hang toan chu cai dau tren nen mau.
 *
 * Chi Thanh yeu cau anh dai dien la BAT BUOC, va hoc vien phai chon nhom thi
 * dua ngay khi vao. Ba thu doi o day - ten, anh, nhom - deu la thu bang xep
 * hang va bang thi dua nhom can den; thieu mot cai la ca hai bang do vo nghia.
 *
 * Ai dang nhap bang Google thi ten va anh da co san (worker/src/routes/auth.js
 * lay tu claims), nen ho chi con moi viec chon nhom.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useKhaNang } from '@/lib/useKhaNang';
import ODanLinkAnh from '@/components/ODanLinkAnh';
import { useAuth } from '@/lib/AuthContext';
import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

export default function Onboarding() {
  const { khaNang } = useKhaNang();
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const oFile = React.useRef(null);

  const [ten, setTen] = React.useState(user?.full_name || '');
  const [anh, setAnh] = React.useState(user?.avatar_url || '');
  const [dangTai, setDangTai] = React.useState(false);


  const luu = useMutation({
    // CHI CON HO SO. Buoc chon nhom da bo khoi day theo yeu cau cua chi Thanh:
    // nhom duoc chia sau buoi Zoom dau tien, chia ngau nhien tu trang quan tri.
    // Bat 300 nguoi tu chon nhom truoc khi biet nhom la gi chi lam ho phan van
    // o cua, va chia ra cac nhom lech han nhau.
    // Ham chonNhom o may chu VAN CON - de danh cho luc muon mo lai.
    mutationFn: () => base44.auth.updateMe({ full_name: ten.trim(), avatar_url: anh }),
    onSuccess: async () => {
      await checkUserAuth();
      qc.invalidateQueries();
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast({
      title: 'Chưa lưu được',
      description: err?.message || 'Thử lại giúp mình nhé.',
      variant: 'destructive',
    }),
  });

  // Chi con HO TEN la bat buoc. Anh dai dien va nhom deu khong chan cua:
  // anh thi them luc nao cung duoc trong Ho so, nhom thi quan tri vien chia.
  const duDieuKien = ten.trim().length >= 2;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Còn một bước nữa thôi</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ảnh và tên của bạn sẽ hiện trên bảng xếp hạng cùng cả lớp. Nhóm thi đua sẽ được chia sau buổi đầu tiên.
          </p>
        </div>

        <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
          {/* ---------------------------------------------------------- anh */}
          <div className="flex flex-col items-center gap-3">
            {/* Nut may anh chi hien khi kho anh THAT SU dang bat.
             *
             * Truoc day o dan link hien ra dung, nhung ca nut nay lan the
             * <input type="file"> ben duoi van render vo dieu kien - nen nguoi
             * dung bam vao anh (dong tac tu nhien nhat o man hinh nay) la an
             * mot cu 503, ngay ben canh mot o dan link dang hoat dong. Hai thu
             * phai tat bat cung nhau. */}
            {khaNang.uploads ? (
              <button
                type="button"
                onClick={() => oFile.current?.click()}
                className="relative rounded-full transition-transform hover:scale-105"
                aria-label="Chọn ảnh đại diện"
              >
                <Avatar user={{ full_name: ten || '?', avatar_url: anh }} size={104} ring />
                <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                  {dangTai ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </span>
              </button>
            ) : (
              <Avatar user={{ full_name: ten || '?', avatar_url: anh }} size={104} ring />
            )}
            {khaNang.uploads && (
              <p className="text-xs text-muted-foreground">
                {anh ? 'Bấm vào ảnh để đổi' : 'Bấm để chọn ảnh đại diện'}
              </p>
            )}
            <ODanLinkAnh
              value={anh}
              onChange={setAnh}
              nhan="Link ảnh đại diện"
              khoAnhTat={!khaNang.uploads}
            />
            <input
              ref={oFile}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!khaNang.uploads}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  toast({ title: 'Ảnh quá lớn', description: 'Tối đa 5MB.', variant: 'destructive' });
                  return;
                }
                setDangTai(true);
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  setAnh(file_url);
                } catch (err) {
                  toast({ title: 'Tải ảnh thất bại', description: err?.message, variant: 'destructive' });
                } finally {
                  setDangTai(false);
                  if (oFile.current) oFile.current.value = '';
                }
              }}
            />
          </div>

          {/* ---------------------------------------------------------- ten */}
          <div>
            <Label htmlFor="ob-ten" className="text-xs font-semibold text-muted-foreground">
              Họ và tên
            </Label>
            <Input
              id="ob-ten"
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              placeholder="Ví dụ: Nguyễn Thị Thanh"
              maxLength={120}
              className="mt-1.5 h-12 rounded-xl"
            />
          </div>

          <Button
            className="h-12 w-full rounded-xl text-[15px] font-bold"
            disabled={!duDieuKien || luu.isPending || dangTai}
            onClick={() => luu.mutate()}
          >
            {luu.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Vào lớp
          </Button>

          {!duDieuKien ? (
            <p className="text-center text-xs text-muted-foreground">
              Cần nhập họ tên
            </p>
          ) : !anh ? (
            <p className="text-center text-xs text-muted-foreground">
              Chưa có ảnh cũng vào lớp được — thêm sau trong Hồ sơ của tôi.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
