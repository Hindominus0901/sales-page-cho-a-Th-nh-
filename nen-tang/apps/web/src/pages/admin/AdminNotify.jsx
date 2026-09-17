/**
 * Gui thong bao cho hoc vien.
 *
 * Truoc trang nay, he thong KHONG co kenh nao de chu dong noi voi hoc vien.
 * Thong bao chi sinh tu dong khi len cap hoac duoc duyet bai; muon bao "toi nay
 * 8h co buoi live" thi khong co duong nao ngoai Zalo.
 *
 * `link` la duong dan NOI BO (vd /calendar) - bam vao thong bao la di thang toi
 * noi can den. Backend tu bo cac link ra ngoai, o day chi goi y san cho tien.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  CellSelect, ConfirmDialog, EmptyBlock, InitialAvatar, LoadingBlock,
  PageHeader, Panel, TableScroll, errText, fmtNumber, timeAgo,
} from './_shared';

const NHOM = [
  { key: 'all', label: 'Tất cả học viên' },
  { key: 'role', label: 'Theo vai trò' },
  { key: 'team', label: 'Theo đội nhóm' },
  { key: 'user', label: 'Một người' },
];

const DUONG_DAN_GOI_Y = [
  { value: '', label: '— Không dẫn đi đâu —' },
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/challenges', label: 'Challenge' },
  { value: '/courses', label: 'Lớp học' },
  { value: '/calendar', label: 'Lịch & sự kiện' },
  { value: '/rewards', label: 'Đổi quà' },
  { value: '/leaderboard', label: 'Bảng xếp hạng' },
  { value: '/badges', label: 'Huy hiệu' },
];

export default function AdminNotify() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nhom, setNhom] = React.useState('all');
  const [role, setRole] = React.useState('member');
  const [teamId, setTeamId] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [tieuDe, setTieuDe] = React.useState('');
  const [noiDung, setNoiDung] = React.useState('');
  const [link, setLink] = React.useState('');
  const [linkNgoai, setLinkNgoai] = React.useState('');
  const [popup, setPopup] = React.useState(false);
  const [xacNhan, setXacNhan] = React.useState(false);

  // 2000 = tran cua entity User o worker. Danh sach nay vua de chon nguoi nhan
  // rieng, vua de DEM truoc so nguoi se nhan - xin thieu thi con so hien ra it
  // hon that, va nguoi thu 501 tro di khong chon duoc de gui rieng.
  const members = useQuery({
    queryKey: ['admin', 'members'],
    queryFn: () => base44.entities.User.list('-total_xp', 2000),
  });
  const teams = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });
  // Doc tu NHAT KY QUAN TRI chu khong tu bang notifications: chinh sach cua
  // Notification la 'own' - ke ca admin cung khong duoc doc thong bao rieng cua
  // nguoi khac, va do la quyet dinh co y de bao ve hoc vien. Mot dong nhat ky
  // cho moi lan gui cung de doc hon hang nghin dong thong bao giong het nhau.
  const daGui = useQuery({
    queryKey: ['admin', 'logs', 'send_notification'],
    queryFn: () => base44.entities.AdminLog.filter({ action: 'send_notification' }, '-created_date', 100),
  });

  const gui = useMutation({
    mutationFn: () => base44.functions.invoke('sendNotification', {
      audience: nhom,
      role: nhom === 'role' ? role : undefined,
      team_id: nhom === 'team' ? teamId : undefined,
      user_id: nhom === 'user' ? userId : undefined,
      title: tieuDe.trim(),
      body: noiDung.trim(),
      link: linkNgoai.trim() || link,
      popup,
    }),
    onSuccess: (res) => {
      const d = res.data || res;
      toast({ title: `Đã gửi tới ${fmtNumber(d.so_nguoi)} người` });
      setTieuDe(''); setNoiDung(''); setLink(''); setLinkNgoai('');
      setPopup(false); setXacNhan(false);
      qc.invalidateQueries({ queryKey: ['admin', 'logs', 'send_notification'] });
    },
    onError: (err) => {
      setXacNhan(false);
      toast({ title: 'Không gửi được', description: errText(err), variant: 'destructive' });
    },
  });

  const dsMember = members.data || [];
  const dsTeam = teams.data || [];

  /** Uoc luong so nguoi nhan, tinh o client de admin thay truoc khi bam gui. */
  const soNguoi = React.useMemo(() => {
    const hoatDong = dsMember.filter((u) => u.status === 'active');
    if (nhom === 'all') return hoatDong.length;
    if (nhom === 'role') return hoatDong.filter((u) => u.role === role).length;
    if (nhom === 'team') return teamId ? hoatDong.filter((u) => u.team_id === teamId).length : 0;
    return userId ? 1 : 0;
  }, [dsMember, nhom, role, teamId, userId]);

  const duGui = tieuDe.trim().length > 0 && soNguoi > 0
    && (nhom !== 'team' || teamId) && (nhom !== 'user' || userId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thông báo"
        description="Gửi tin vào chuông trong app học viên. Đây là kênh chủ động duy nhất ngoài email."
      />

      <Panel title="Soạn thông báo">
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Gửi cho ai</Label>
            <div className="flex flex-wrap gap-1.5">
              {NHOM.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => setNhom(n.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                    nhom === n.key
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          {nhom === 'role' && (
            <div className="max-w-xs">
              <Label htmlFor="nt-role" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Vai trò</Label>
              <CellSelect id="nt-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full">
                <option value="member">Học viên</option>
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
              </CellSelect>
            </div>
          )}

          {nhom === 'team' && (
            <div className="max-w-xs">
              <Label htmlFor="nt-team" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Đội nhóm</Label>
              <CellSelect id="nt-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full">
                <option value="">— Chọn đội —</option>
                {dsTeam.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </CellSelect>
              {dsTeam.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Chưa có đội nào. Tạo đội ở trang Học viên trước.
                </p>
              )}
            </div>
          )}

          {nhom === 'user' && (
            <div className="max-w-md">
              <Label htmlFor="nt-user" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Học viên</Label>
              <CellSelect id="nt-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full">
                <option value="">— Chọn học viên —</option>
                {dsMember.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </CellSelect>
            </div>
          )}

          <div>
            <Label htmlFor="nt-title" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Tiêu đề <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nt-title"
              value={tieuDe}
              onChange={(e) => setTieuDe(e.target.value)}
              placeholder="Ví dụ: Tối nay 20h có buổi live — nhớ vào sớm 5 phút"
              maxLength={160}
              className="rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="nt-body" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Nội dung (không bắt buộc)
            </Label>
            <Textarea
              id="nt-body"
              value={noiDung}
              onChange={(e) => setNoiDung(e.target.value)}
              placeholder="Viết ngắn thôi — đây là dòng chữ nhỏ dưới tiêu đề trong chuông."
              maxLength={1000}
              className="min-h-[90px] rounded-xl"
            />
          </div>

          <div className="max-w-xs">
            <Label htmlFor="nt-link" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Bấm vào thì đi đâu
            </Label>
            <CellSelect id="nt-link" value={link} onChange={(e) => setLink(e.target.value)} className="w-full">
              {DUONG_DAN_GOI_Y.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </CellSelect>
          </div>

          {/* O link ra ngoai: dung cho link Zoom moi buoi. Co dien thi no de len
              tren duong dan noi bo o tren. */}
          <div className="max-w-md">
            <Label htmlFor="nt-link-ngoai" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Hoặc dán link ra ngoài (Zoom, Google Meet…)
            </Label>
            <Input
              id="nt-link-ngoai"
              value={linkNgoai}
              onChange={(e) => setLinkNgoai(e.target.value)}
              placeholder="https://zoom.us/j/..."
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Phải bắt đầu bằng https:// — điền vào đây thì hệ thống dùng link này thay cho ô trên.
            </p>
          </div>

          <label className="flex max-w-md cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
            <input
              type="checkbox"
              checked={popup}
              onChange={(e) => setPopup(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              <b>Hiện thẳng giữa màn hình</b>
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                Học viên mở app là thấy ngay một hộp thoại, không phải bấm chuông mới thấy.
                Dùng cho link Zoom và những thứ có hạn giờ.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button
              className="rounded-full"
              disabled={!duGui || gui.isPending}
              onClick={() => setXacNhan(true)}
            >
              {gui.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Gửi thông báo
            </Button>
            <span className="text-sm text-muted-foreground">
              {/* Nut xam thi PHAI noi ro dang thieu gi. Thieu tieu de va thieu
                  nguoi nhan la hai ly do khac han nhau, dan toi hai thao tac
                  khac han nhau. */}
              {!tieuDe.trim()
                ? 'Nhập tiêu đề trước đã — đó là dòng học viên nhìn thấy.'
                : soNguoi > 0
                  ? `Sẽ tới ${fmtNumber(soNguoi)} người đang hoạt động`
                  : 'Chưa có ai khớp nhóm đã chọn'}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Đã gửi gần đây" description="100 lần gửi gần nhất, đọc từ nhật ký quản trị.">
        {daGui.isLoading ? <LoadingBlock /> : (daGui.data || []).length === 0 ? (
          <EmptyBlock>Chưa gửi thông báo nào.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Lúc</th>
                  <th className="p-2.5 font-semibold">Người gửi</th>
                  <th className="p-2.5 font-semibold">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                {(daGui.data || []).map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/50 align-top">
                    <td className="p-2.5 whitespace-nowrap text-xs text-muted-foreground">
                      {timeAgo(l.created_date)}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <InitialAvatar name={l.admin_name} size={26} />
                        <span className="text-xs font-semibold">{l.admin_name || '—'}</span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold">{l.details}</div>
                      {l.reason && <div className="text-xs text-muted-foreground">{l.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <ConfirmDialog
        open={xacNhan}
        onOpenChange={setXacNhan}
        title={`Gửi cho ${fmtNumber(soNguoi)} người?`}
        description={`"${tieuDe}" — thông báo đã gửi thì không rút lại được, và mỗi người sẽ thấy `
          + 'một chấm đỏ trên chuông cho tới khi họ mở ra.'}
        confirmLabel="Gửi ngay"
        pending={gui.isPending}
        onConfirm={() => gui.mutate()}
      />
    </div>
  );
}
