/**
 * Hoc vien - danh sach, doi vai tro, khoa/mo tai khoan, cong tru diem, mo khoa
 * noi dung.
 *
 * Vai tro va trang thai ghi thang qua entities.User.update (backend chi cho
 * admin ghi hai cot nay). Diem thi PHAI qua ham adjustPoints vi con phai ghi so
 * cai va nhat ky - ghi thang total_xp se lam so cai lech.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Minus, Plus, Search, History, Trash2, Users2, ExternalLink, FileText } from 'lucide-react';
import { base44, adminApi } from '@/api/base44Client';
import { computeLevel } from '@/lib/gamification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, ConfirmDialog, EmptyBlock, InitialAvatar, LoadingBlock, PageHeader,
  Panel, QueryState, StatusPill, TableScroll, errText, fmtNumber, timeAgo,
} from './_shared';

const ROLE_LABEL = { member: 'Học viên', coach: 'Coach', admin: 'Admin' };
const STATUS_TONE = { active: 'good', suspended: 'warn', banned: 'bad' };
const STATUS_LABEL = { active: 'Hoạt động', suspended: 'Tạm khoá', banned: 'Đã cấm' };

export default function Members() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState('');
  const [unlockFor, setUnlockFor] = React.useState(null);   // id hang dang mo bang mo khoa
  const [unlockChoice, setUnlockChoice] = React.useState('');
  const [hoiTra, setHoiTra] = React.useState(null);          // don dang hoi truoc khi xac nhan da nhan tien
  const [adjustFor, setAdjustFor] = React.useState(null);
  const [suspendFor, setSuspendFor] = React.useState(null);
  const [lichSuCua, setLichSuCua] = React.useState(null);   // hoc vien dang xem so diem
  const [baiTapCua, setBaiTapCua] = React.useState(null);   // hoc vien dang xem bai tap
  const [doiMoi, setDoiMoi] = React.useState('');           // ten doi dang go de tao

  // 2000 = dung tran cua entity User o worker/src/entities/schema.js (LIMITS).
  // Xin it hon la trang nay tu giau bot nguoi: o tim kiem loc tren mang da nap,
  // nen nguoi ngoai top XP se khong bao gio hien ra du go dung ten.
  const users = useQuery({
    queryKey: ['admin', 'users', 'xp', 2000],
    queryFn: () => base44.entities.User.list('-total_xp', 2000),
  });
  const levels = useQuery({
    queryKey: ['levels'],
    queryFn: () => base44.entities.Level.list('level_number', 20),
  });
  const challenges = useQuery({
    queryKey: ['admin', 'challenges'],
    queryFn: () => base44.entities.Challenge.list('-created_date', 100),
  });
  const courses = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => base44.entities.Course.list('sort_order', 100),
  });
  const rewards = useQuery({
    queryKey: ['admin', 'rewards'],
    queryFn: () => base44.entities.Reward.list('sort_order', 100),
  });

  const teams = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const lamMoiDoi = () => qc.invalidateQueries({ queryKey: ['admin', 'teams'] });

  const taoDoi = useMutation({
    mutationFn: (name) => base44.entities.Team.create({ name, description: '' }),
    onSuccess: () => { toast({ title: 'Đã tạo đội' }); setDoiMoi(''); lamMoiDoi(); },
    onError: (err) => toast({ title: 'Không tạo được đội', description: errText(err), variant: 'destructive' }),
  });

  const xoaDoi = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá đội' }); lamMoiDoi(); invalidate(); },
    onError: (err) => toast({ title: 'Không xoá được đội', description: errText(err), variant: 'destructive' }),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.User.update(id, patch),
    onSuccess: (_res, vars) => {
      toast({ title: vars.successTitle || 'Đã cập nhật', description: vars.successDesc });
      invalidate();
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const adjust = useMutation({
    mutationFn: (payload) => base44.functions.invoke('adjustPoints', payload),
    onSuccess: (res) => {
      toast({
        title: 'Đã điều chỉnh điểm',
        description: res?.levelUp ? 'Học viên vừa lên cấp mới.' : undefined,
      });
      setAdjustFor(null);
      invalidate();
    },
    onError: (err) => toast({ title: 'Không điều chỉnh được', description: errText(err), variant: 'destructive' }),
  });

  const grant = useMutation({
    mutationFn: (payload) => base44.functions.invoke('grantEntitlement', payload),
    onSuccess: (res) => {
      toast({ title: res?.already ? 'Học viên đã có quyền này rồi' : 'Đã mở khoá cho học viên' });
      setUnlockChoice('');
      qc.invalidateQueries({ queryKey: ['admin', 'entitlements'] });
    },
    onError: (err) => toast({ title: 'Không mở khoá được', description: errText(err), variant: 'destructive' }),
  });

  // Don DANG CHO cua ca lop, lay mot lan roi ghep theo tung nguoi o duoi.
  // Lay ca lop thay vi hoi rieng tung nguoi: bang nay co the co 2000 dong, hoi
  // rieng la 2000 luot goi.
  const donCho = useQuery({
    queryKey: ['admin', 'don-cho'],
    queryFn: () => adminApi.orders({ status: 'pending', limit: 500 }),
  });

  /**
   * Don dang cho cua MOT nguoi.
   *
   * Ghep theo email truoc, dung dung thu tu ma `findBuyer` phia may chu dung
   * khi mo quyen - lech nhau thi man hinh hien mot dang, he thong lam mot neo.
   * `legacy_lead_id` la duong thu hai cho nguoi dang ky tu thoi con funnel.
   */
  const donChoCua = (u) => {
    const ds = donCho.data?.items || [];
    const mail = String(u.email || '').trim().toLowerCase();
    return ds.filter((d) => (mail && String(d.customer_email || '').trim().toLowerCase() === mail)
      || (u.legacy_lead_id && Number(d.lead_id) === Number(u.legacy_lead_id)));
  };

  const xacNhanTra = useMutation({
    mutationFn: (code) => adminApi.markOrderPaid(code, { note: 'xác nhận tay từ trang Học viên' }),
    onSuccess: () => {
      toast({ title: 'Đã ghi nhận tiền', description: 'Quyền đã mở, doanh thu vào sổ, hoa hồng đã tính.' });
      qc.invalidateQueries({ queryKey: ['admin', 'don-cho'] });
      qc.invalidateQueries({ queryKey: ['admin', 'entitlements'] });
    },
    onError: (err) => toast({ title: 'Không ghi nhận được', description: errText(err), variant: 'destructive' }),
  });

  const unlockables = [
    ...(challenges.data || []).map((c) => ({ value: `challenge:${c.id}`, label: `Challenge · ${c.name}` })),
    ...(courses.data || []).map((c) => ({ value: `course:${c.id}`, label: `Khoá học · ${c.name}` })),
    ...(rewards.data || []).map((r) => ({ value: `reward:${r.id}`, label: `Quà · ${r.name}` })),
  ];

  const keyword = search.trim().toLowerCase();
  const rows = (users.data || []).filter((u) => !keyword
    || `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(keyword));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Học viên"
        description="Tìm học viên, đổi vai trò, tạm khoá tài khoản, cộng/trừ điểm và mở khoá nội dung."
      />

      <ThuMoiChuaDen />

      <ChiaNhom />

      {/* Truoc day khong co duong nao lay danh sach hoc vien ra ngoai: muon chia
          nhom, diem danh tay hay gui thu cho ca lop deu phai mo database. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">Tải về:</span>
        <a
          href="/api/admin/export/members.csv"
          download
          className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary"
        >
          members.csv
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc email..."
            className="rounded-full pl-9"
          />
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          {fmtNumber(rows.length)} / {fmtNumber(users.data?.length)} học viên
        </div>
      </div>

      <Panel>
        <QueryState query={users} empty={rows.length === 0} emptyText="Không tìm thấy học viên nào khớp.">
          <TableScroll>
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Học viên</th>
                  <th className="p-2.5 font-semibold">Cấp bậc</th>
                  <th className="p-2.5 text-right font-semibold">XP</th>
                  <th className="p-2.5 text-right font-semibold">Xu</th>
                  <th className="p-2.5 text-right font-semibold">Chuỗi ngày</th>
                  <th className="p-2.5 font-semibold">Đội</th>
                  <th className="p-2.5 font-semibold">Vai trò</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                  <th className="p-2.5 font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const lvl = computeLevel(u.total_xp || 0, levels.data || []);
                  const open = unlockFor === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr className="border-b border-border hover:bg-secondary/40">
                        <td className="p-2.5">
                          <div className="flex items-center gap-2.5">
                            <InitialAvatar name={u.full_name} size={34} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{u.full_name || 'Chưa đặt tên'}</div>
                              <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap p-2.5">{lvl.icon} {lvl.name}</td>
                        <td className="p-2.5 text-right font-bold">{fmtNumber(u.total_xp)}</td>
                        <td className="p-2.5 text-right font-bold text-amber-600">{fmtNumber(u.total_coin)}</td>
                        <td className="p-2.5 text-right">🔥 {fmtNumber(u.current_streak)}</td>
                        <td className="p-2.5">
                          <CellSelect
                            value={u.team_id || ''}
                            disabled={patchUser.isPending}
                            onChange={(e) => patchUser.mutate({
                              id: u.id,
                              patch: { team_id: e.target.value || null },
                              successTitle: e.target.value ? 'Đã xếp vào đội' : 'Đã bỏ khỏi đội',
                            })}
                            className="w-32"
                          >
                            <option value="">— Chưa có —</option>
                            {(teams.data || []).map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </CellSelect>
                        </td>
                        <td className="p-2.5">
                          <CellSelect
                            value={u.role || 'member'}
                            disabled={patchUser.isPending}
                            onChange={(e) => patchUser.mutate({
                              id: u.id,
                              patch: { role: e.target.value },
                              // Doi vai tro o day cap QUYEN THAT ngay lap tuc:
                              // isStaff() trong worker/src/functions/index.js
                              // coi ca 'coach' lan 'admin' la nguoi duyet bai
                              // duoc. Truoc day o chon nay im lang, nen chon
                              // "Coach" cho ai do la trao quyen duyet bai ma
                              // khong mot chu nao noi ra.
                              successTitle: `Đã đổi vai trò thành ${ROLE_LABEL[e.target.value]}`,
                              successDesc: e.target.value === 'coach'
                                ? 'Người này duyệt được bài của học viên kể từ bây giờ.'
                                : e.target.value === 'admin'
                                  ? 'Người này làm được mọi việc trong trang quản trị, kể cả đổi vai trò người khác.'
                                  : 'Người này không còn duyệt được bài nữa.',
                            })}
                            className={u.role === 'admin' ? 'border-primary/40 bg-primary/5 text-primary' : ''}
                          >
                            <option value="member">Học viên</option>
                            <option value="coach">Coach</option>
                            <option value="admin">Admin</option>
                          </CellSelect>
                        </td>
                        <td className="p-2.5">
                          <div className="flex flex-col items-start gap-1.5">
                            <StatusPill tone={STATUS_TONE[u.status] || 'muted'}>
                              {STATUS_LABEL[u.status] || u.status}
                            </StatusPill>
                            {u.status === 'active' ? (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-destructive hover:underline"
                                onClick={() => setSuspendFor(u)}
                              >
                                Tạm khoá
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-emerald-600 hover:underline"
                                onClick={() => patchUser.mutate({
                                  id: u.id, patch: { status: 'active' }, successTitle: 'Đã mở khoá tài khoản',
                                })}
                              >
                                Mở khoá tài khoản
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs"
                              onClick={() => setAdjustFor(u)}
                            >
                              Điểm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs"
                              onClick={() => setLichSuCua(u)}
                            >
                              <History className="mr-1 h-3.5 w-3.5" /> Sổ điểm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs"
                              onClick={() => setBaiTapCua(u)}
                            >
                              <FileText className="mr-1 h-3.5 w-3.5" /> Bài tập
                            </Button>
                            <Button
                              size="sm"
                              variant={open ? 'default' : 'outline'}
                              className="rounded-full text-xs"
                              onClick={() => {
                                setUnlockChoice('');
                                setUnlockFor(open ? null : u.id);
                              }}
                            >
                              <KeyRound className="mr-1 h-3.5 w-3.5" /> Mở quyền
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {open && (
                        <tr className="border-b border-border bg-secondary/40">
                          <td colSpan={9} className="space-y-3 p-3">
                            {/* Nguoi da CHUYEN KHOAN gan nhu luon co san mot don
                                dang cho o day: ho bam mua, nhan ma QR, chuyen
                                tien, chi la webhook ngan hang khong khop duoc
                                noi dung. Hien no ra ngay canh nut tang de khong
                                ai phai chon giua hai duong ma khong biet khac
                                nhau cho nao. */}
                            {donChoCua(u).map((d) => (
                              <div
                                key={d.code}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2"
                              >
                                <span className="text-xs text-emerald-900 dark:text-emerald-200">
                                  Đang chờ tiền: <b>{d.product_name}</b> · {fmtNumber(d.amount)}đ ·{' '}
                                  <span className="font-mono">{d.code}</span>
                                </span>
                                <Button
                                  size="sm"
                                  className="rounded-full"
                                  disabled={xacNhanTra.isPending}
                                  onClick={() => setHoiTra({ ...d, nguoi: u.full_name })}
                                >
                                  {xacNhanTra.isPending
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : 'Xác nhận đã nhận tiền'}
                                </Button>
                                <span className="text-[11px] text-muted-foreground">
                                  Mở quyền, vào sổ doanh thu, và trả hoa hồng cho người giới thiệu.
                                </span>
                              </div>
                            ))}

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                Tặng cho {u.full_name}:
                              </span>
                              <CellSelect
                                value={unlockChoice}
                                onChange={(e) => setUnlockChoice(e.target.value)}
                                className="w-auto min-w-[280px] font-normal"
                              >
                                <option value="">Chọn Challenge / Khoá học / Quà...</option>
                                {unlockables.map((it) => (
                                  <option key={it.value} value={it.value}>{it.label}</option>
                                ))}
                              </CellSelect>
                              <Button
                                size="sm"
                                className="rounded-full"
                                disabled={!unlockChoice || grant.isPending}
                                onClick={() => {
                                  const [kind, ref] = unlockChoice.split(':');
                                  grant.mutate({ user_id: u.id, kind, ref, note: 'Tặng từ trang Học viên' });
                                }}
                              >
                                {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tặng miễn phí'}
                              </Button>
                              <span className="text-[11px] text-muted-foreground">
                                Quà tặng: không vào sổ doanh thu, và người nhận không được bán lại.
                              </span>
                              {unlockables.length === 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Chưa có challenge, khoá học hay quà nào để mở khoá.
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      <Panel
        title="Đội nhóm"
        description={'Chia đội để mọi người có người cùng đi. Xếp đội ngay trong cột "Đội" của bảng trên. '
          + 'Xoá một đội không xoá học viên — họ chỉ trở về trạng thái chưa có đội.'}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CellInput
            value={doiMoi}
            onChange={(e) => setDoiMoi(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && doiMoi.trim()) taoDoi.mutate(doiMoi.trim()); }}
            placeholder="Tên đội mới, ví dụ: Đội Sao Mai"
            className="w-64"
          />
          <Button
            size="sm" className="rounded-full"
            disabled={!doiMoi.trim() || taoDoi.isPending}
            onClick={() => taoDoi.mutate(doiMoi.trim())}
          >
            {taoDoi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> Tạo đội</>}
          </Button>
        </div>

        {teams.isLoading ? <LoadingBlock /> : (teams.data || []).length === 0 ? (
          <EmptyBlock>Chưa có đội nào. Tạo đội đầu tiên ở ô trên.</EmptyBlock>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(teams.data || []).map((t) => {
              const soThanhVien = (users.data || []).filter((u) => u.team_id === t.id).length;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                >
                  <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtNumber(soThanhVien)} người</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Xoá đội ${t.name}`}
                    onClick={() => xoaDoi.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SoDiemDialog user={lichSuCua} onClose={() => setLichSuCua(null)} />
      <BaiTapDialog user={baiTapCua} onClose={() => setBaiTapCua(null)} />

      <AdjustDialog
        user={adjustFor}
        onClose={() => setAdjustFor(null)}
        pending={adjust.isPending}
        onSubmit={(payload) => adjust.mutate(payload)}
      />

      {/* Hoi lai truoc khi ghi nhan tien. Bam nham mot cai la don chua tra tien
          thanh da tra: mo quyen, vao so doanh thu, VA sinh hoa hong cho nguoi
          gioi thieu - go lai ca ba thu deu phai lam tay. Nut nay lai nam trong
          mot bang day nut. */}
      <ConfirmDialog
        open={!!hoiTra}
        onOpenChange={(v) => !v && setHoiTra(null)}
        title={`Xác nhận đã nhận ${fmtNumber(hoiTra?.amount)}đ của ${hoiTra?.nguoi || ''}?`}
        description={`Đơn ${hoiTra?.code || ''} · ${hoiTra?.product_name || ''}. Kiểm tra sao kê ngân hàng trước khi bấm: quyền sẽ mở, tiền vào sổ doanh thu, và hoa hồng trả cho người giới thiệu.`}
        confirmLabel="Đã nhận tiền"
        pending={xacNhanTra.isPending}
        onConfirm={() => { xacNhanTra.mutate(hoiTra.code); setHoiTra(null); }}
      />

      <ConfirmDialog
        open={!!suspendFor}
        onOpenChange={(v) => !v && setSuspendFor(null)}
        title={`Tạm khoá tài khoản ${suspendFor?.full_name || ''}?`}
        description="Học viên sẽ không đăng nhập và không nộp bài được cho tới khi bạn mở khoá lại. Điểm và lịch sử vẫn giữ nguyên."
        confirmLabel="Tạm khoá"
        pending={patchUser.isPending}
        onConfirm={() => {
          patchUser.mutate({ id: suspendFor.id, patch: { status: 'suspended' }, successTitle: 'Đã tạm khoá tài khoản' });
          setSuspendFor(null);
        }}
      />
    </div>
  );
}

/** Cong/tru XP hoac xu. Ly do la bat buoc vi backend ghi vao nhat ky quan tri. */
function AdjustDialog({ user, onClose, onSubmit, pending }) {
  const [metric, setMetric] = React.useState('xp');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (user) { setMetric('xp'); setAmount(''); setReason(''); }
  }, [user]);

  if (!user) return null;
  const value = Number(amount);
  const valid = Number.isFinite(value) && value !== 0 && reason.trim().length > 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Điều chỉnh điểm · {user.full_name}</DialogTitle>
          <DialogDescription>
            Số dương là cộng thêm, số âm là trừ bớt. Mọi điều chỉnh đều được ghi vào nhật ký quản trị.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            {['xp', 'coin'].map((m) => (
              <Button
                key={m}
                type="button"
                variant={metric === m ? 'default' : 'outline'}
                className="flex-1 rounded-xl"
                onClick={() => setMetric(m)}
              >
                {m === 'xp' ? 'XP' : 'Xu'}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-amount">Số điểm</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="rounded-xl"
                aria-label="Giảm 10 điểm" title="Giảm 10"
                onClick={() => setAmount(String((Number(amount) || 0) - 10))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="adjust-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="VD: 50 hoặc -50"
                className="rounded-xl text-center"
              />
              <Button type="button" variant="outline" size="icon" className="rounded-xl"
                aria-label="Tăng 10 điểm" title="Tăng 10"
                onClick={() => setAmount(String((Number(amount) || 0) + 10))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">Lý do (bắt buộc)</Label>
            <Input
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: thưởng bài chia sẻ nổi bật"
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Huỷ bỏ</Button>
          <Button
            className="rounded-full"
            disabled={!valid || pending}
            onClick={() => onSubmit({
              target_user_id: user.id, metric, amount: value, reason: reason.trim(),
            })}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Áp dụng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * So diem cua mot hoc vien: tung dong XP va xu, tu dau ra.
 *
 * Truoc day trang Hoc vien chi thay TONG XP va TONG xu. Khi ai do hoi "sao xu
 * cua em bi tru" thi khong co cach nao tra loi ngoai mo database - trong khi so
 * cai (`xp_transactions`, `coin_transactions`) da ghi day du tu dau.
 *
 * Gop hai bang lai va xep theo thoi gian: nguoi doc quan tam "chuyen gi da xay
 * ra theo thu tu", khong quan tam no nam o bang nao.
 */
/**
 * Bai tap thu thach cua MOT hoc vien, xem tu trang Hoc vien.
 *
 * VI SAO CAN: trang Duyet bai xep theo TRANG THAI (cho duyet / da duyet / da tu
 * choi) - hop khi ngoi cham hang loat. Nhung khi mot nguoi nhan tin hoi "sao em
 * nop roi ma khong thay", cau hoi la "NGUOI NAY da nop nhung gi" - va truoc day
 * khong man hinh nao tra loi duoc, phai mo tung tab ra do bang mat.
 */
function BaiTapDialog({ user, onClose }) {
  const bai = useQuery({
    queryKey: ['admin', 'bai-tap-cua', user?.id],
    queryFn: () => base44.entities.ChallengeSubmission.filter({ user_id: user.id }, '-created_date', 100),
    enabled: !!user,
  });

  // Xep theo NGAY cua thu thach, khong theo luc nop: cau hoi luon la "ngay 3 co
  // nop chua", chu khong phai "bai nao nop truoc".
  const ds = React.useMemo(
    () => [...(bai.data || [])].sort((a, b) => Number(a.day) - Number(b.day)),
    [bai.data],
  );

  const nhan = (tt) => (tt === 'approved' ? 'Đã duyệt' : tt === 'rejected' ? 'Bị từ chối' : 'Chờ duyệt');
  const mau = (tt) => (tt === 'approved' ? 'good' : tt === 'rejected' ? 'bad' : 'warn');

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bài tập — {user?.full_name || user?.email}</DialogTitle>
          <DialogDescription>
            {fmtNumber(ds.length)} bài đã nộp, xếp theo ngày của thử thách.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {bai.isLoading ? (
            <LoadingBlock />
          ) : ds.length === 0 ? (
            <EmptyBlock>Học viên này chưa nộp bài nào.</EmptyBlock>
          ) : (
            <div className="space-y-2.5">
              {ds.map((b) => (
                <div key={b.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">Ngày {b.day}</span>
                    <StatusPill tone={mau(b.status)}>{nhan(b.status)}</StatusPill>
                  </div>
                  {b.content && (
                    <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
                      {b.content}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {b.link && (
                      <a
                        href={b.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Bài tập
                      </a>
                    )}
                    {b.file_url && (
                      <a
                        href={b.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Cảm nhận Facebook
                      </a>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Nộp {timeAgo(b.created_date)}
                    {b.reviewed_at && ` · chấm ${timeAgo(b.reviewed_at)}`}
                  </div>
                  {b.feedback && (
                    <p className="mt-1.5 rounded-lg bg-muted/60 p-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {b.feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoDiemDialog({ user, onClose }) {
  const xp = useQuery({
    queryKey: ['admin', 'xp-tx', user?.id],
    queryFn: () => base44.entities.XpTransaction.filter({ user_id: user.id }, '-created_date', 200),
    enabled: !!user,
  });
  const coin = useQuery({
    queryKey: ['admin', 'coin-tx', user?.id],
    queryFn: () => base44.entities.CoinTransaction.filter({ user_id: user.id }, '-created_date', 200),
    enabled: !!user,
  });

  const dong = React.useMemo(() => [
    ...(xp.data || []).map((r) => ({ ...r, loai: 'xp' })),
    ...(coin.data || []).map((r) => ({ ...r, loai: 'coin' })),
  ].sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))), [xp.data, coin.data]);

  const dangTai = xp.isLoading || coin.isLoading;

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sổ điểm — {user?.full_name || user?.email}</DialogTitle>
          <DialogDescription>
            Tổng {fmtNumber(user?.total_xp)} XP · {fmtNumber(user?.total_coin)} xu.
            Đây là từng dòng tạo nên hai con số đó.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {dangTai ? <LoadingBlock /> : dong.length === 0 ? (
            <EmptyBlock>Học viên này chưa có giao dịch điểm nào.</EmptyBlock>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 font-semibold">Lúc</th>
                  <th className="p-2 font-semibold">Việc</th>
                  <th className="p-2 text-right font-semibold">Thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((r) => (
                  <tr key={`${r.loai}-${r.id}`} className="border-b border-border last:border-0">
                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{timeAgo(r.created_date)}</td>
                    <td className="p-2">
                      <div>{r.description || r.source}</div>
                      <div className="text-xs text-muted-foreground">{r.source}</div>
                    </td>
                    <td className={`p-2 text-right font-bold ${r.amount >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {r.amount >= 0 ? '+' : ''}{fmtNumber(r.amount)} {r.loai === 'xp' ? 'XP' : 'xu'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Nhung nguoi co tai khoan ma chua bao gio nhan duoc thu moi vao lop.
 *
 * Chuyen nay da xay ra that: mot loat thu dau tien that bai vi het han muc gui
 * trong ngay cua Resend, va khong co gi thu lai. Ho co tai khoan, co ca link
 * dat mat khau nam trong database, ma khong he biet - vi khong ai bao ho.
 *
 * Khoi nay chi hien khi CON nguoi chua nhan duoc. Bam nut la gui that, nen de
 * mac dinh 25 nguoi mot lan: het han muc thi dung, khong ban het vao tuong.
 */
function ThuMoiChuaDen() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const thieu = useQuery({
    queryKey: ['admin', 'thu-moi-chua-den'],
    queryFn: () => base44.functions.invoke('thuMoiChuaDen', {}),
  });
  const tong = (thieu.data?.data || thieu.data)?.tong || 0;

  const gui = useMutation({
    mutationFn: () => base44.functions.invoke('guiLaiThuMoiHangLoat', { limit: 25 }),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries({ queryKey: ['admin', 'thu-moi-chua-den'] });
      toast({
        title: `Đã gửi ${d.da_gui} thư mời`,
        description: d.dung_vi === 'het_han_muc'
          ? 'Dừng giữa chừng vì hết hạn mức gửi trong ngày của Resend. Mai bấm tiếp, hoặc nâng gói.'
          : `Còn ${d.con_lai} người chưa nhận được.`,
      });
    },
    onError: (err) => toast({ title: 'Không gửi được', description: errText(err), variant: 'destructive' }),
  });

  if (thieu.isLoading || tong === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <div className="text-[13px] text-amber-900">
        <b>{fmtNumber(tong)} học viên chưa nhận được thư mời vào lớp.</b>{' '}
        Họ đã có tài khoản nhưng thư gửi đi bị lỗi, nên không có đường nào vào.
      </div>
      <Button
        size="sm"
        className="rounded-full"
        disabled={gui.isPending}
        onClick={() => gui.mutate()}
      >
        {gui.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gửi lại (25 người)'}
      </Button>
    </div>
  );
}


/**
 * Chia nhom ngau nhien cho nhung nguoi chua co nhom.
 *
 * Man hinh vao lop KHONG con hoi nhom nua: chi Thanh chia sau buoi Zoom dau
 * tien. Voi ba tram nguoi thi doi tung o chon trong bang duoi la mot buoi toi
 * ngoi bam chuot, va gan nhu chac chan bo sot ai do.
 *
 * Chi hien khi CON nguoi chua co nhom - chia xong thi khoi nay tu bien mat.
 */
function ChiaNhom() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [hoi, setHoi] = React.useState(false);

  const chuaCoNhom = useQuery({
    queryKey: ['admin', 'chua-co-nhom'],
    queryFn: () => base44.entities.User.filter({ team_id: null, role: 'member' }, '-created_date', 2000),
  });
  const con = (chuaCoNhom.data || []).length;

  // So nhom doc tu co so du lieu, KHONG viet cung. Truoc day dai nay ghi cung
  // "vao 5 nhom"; them nhom thu 6 xong thi no van noi 5, va nguoi doc tuong nut
  // bam chia sai so nhom - trong khi ham phia may chu vot het bang teams va
  // chia dung 6.
  const doi = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => base44.entities.Team.list('name', 100),
  });
  const soNhom = (doi.data || []).length;

  const chia = useMutation({
    mutationFn: () => base44.functions.invoke('chiaNhomNgauNhien', {}),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries();
      setHoi(false);
      toast({
        title: `Đã chia ${fmtNumber(d.da_chia)} học viên vào nhóm`,
        description: Object.entries(d.theo_nhom || {}).map(([k, v]) => `${k}: ${v}`).join(' · '),
      });
    },
    onError: (err) => toast({ title: 'Không chia được', description: errText(err), variant: 'destructive' }),
  });

  if (chuaCoNhom.isLoading || con === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="text-[13px]">
          <b>{fmtNumber(con)} học viên chưa có nhóm.</b>{' '}
          {/* Khong co nhom nao thi cau cu doc ra thanh "chia deu vao 0 nhom" -
              mot cau vo nghia, va nut ben canh van bam duoc. */}
          {soNhom > 0
            ? `Chia ngẫu nhiên và đều vào ${soNhom} nhóm — không nhóm nào lệch quá một người.`
            : 'Chưa có nhóm nào để chia. Tạo ít nhất một nhóm ở phần bên trên trước đã.'}
        </div>
        <Button
          size="sm"
          className="rounded-full"
          disabled={chia.isPending || soNhom === 0}
          title={soNhom === 0 ? 'Cần có ít nhất một nhóm trước khi chia.' : undefined}
          onClick={() => setHoi(true)}
        >
          {chia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Chia nhóm ngẫu nhiên'}
        </Button>
      </div>

      <ConfirmDialog
        open={hoi}
        onOpenChange={setHoi}
        title={`Chia ${fmtNumber(con)} học viên vào ${soNhom || 0} nhóm?`}
        description="Chia ngẫu nhiên và đều. Chỉ đụng tới người chưa có nhóm — ai đã ở nhóm nào thì giữ nguyên. Sau đó vẫn đổi tay được từng người trong bảng bên dưới."
        confirmLabel="Chia ngay"
        pending={chia.isPending}
        onConfirm={() => chia.mutate()}
      />
    </>
  );
}
