/**
 * Huy hieu: dinh nghia huy hieu, trao tay, thu hoi, va ra soat lai ca lop.
 *
 * Truoc trang nay, KHONG MOT AI trong he thong tung duoc trao huy hieu - bang
 * `user_badges` chua bao gio duoc ghi vao. Tam huy hieu trong database chi la do
 * trang tri, va trang "Huy hieu & Rank" cua moi hoc vien trong vinh vien.
 *
 * Dieu kien nam trong database chu khong viet cung, nen doi "Ben bi 7 ngay"
 * thanh 10 ngay chi la sua mot o trong bang nay. De trong cot Dieu kien = huy
 * hieu chi trao tay (vi du "Nguoi dan dat" - thu he thong khong do duoc).
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Wand2, Award } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, ConfirmDialog, EmptyBlock, InitialAvatar, LoadingBlock,
  PageHeader, Panel, QueryState, ReasonDialog, TableScroll, errText, fmtNumber, timeAgo,
} from './_shared';

/** Cac kieu dieu kien may cham duoc - phai khop doChiSo() o worker/src/points/badges.js. */
const DIEU_KIEN = [
  { value: '', label: 'Chỉ trao tay' },
  { value: 'activity_count', label: 'Tổng số hoạt động đã duyệt' },
  { value: 'content_count', label: 'Số bài content' },
  { value: 'call_count', label: 'Số cuộc gọi' },
  { value: 'assignment_count', label: 'Số bài tập' },
  { value: 'streak', label: 'Chuỗi ngày dài nhất' },
  { value: 'level', label: 'Đạt cấp bậc' },
  { value: 'course_count', label: 'Số khoá đã hoàn thành' },
  { value: 'referral_count', label: 'Số người đã mời' },
  { value: 'total_xp', label: 'Tổng XP' },
  { value: 'total_coin', label: 'Tổng xu' },
];

function BadgeRow({ badge, pending, onSave, onDelete }) {
  const [f, setF] = React.useState({
    name: badge.name || '', key: badge.key || '', icon: badge.icon || '',
    description: badge.description || '',
    condition_type: badge.condition_type || '',
    condition_value: badge.condition_value ?? 0,
    xp_bonus: badge.xp_bonus ?? 0, coin_bonus: badge.coin_bonus ?? 0,
    is_active: badge.is_active !== false,
    sort_order: badge.sort_order ?? 0,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="p-2"><CellInput value={f.icon} onChange={set('icon')} className="w-14 text-center text-lg" /></td>
      <td className="p-2"><CellInput value={f.name} onChange={set('name')} className="w-40" /></td>
      <td className="p-2"><CellInput value={f.key} onChange={set('key')} className="w-32 font-mono text-xs" /></td>
      <td className="p-2"><CellInput value={f.description} onChange={set('description')} className="w-56" /></td>
      <td className="p-2">
        <CellSelect value={f.condition_type} onChange={set('condition_type')} className="w-52">
          {DIEU_KIEN.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </CellSelect>
      </td>
      <td className="p-2">
        <CellInput
          type="number" value={f.condition_value} onChange={set('condition_value')}
          className="w-20 text-right" disabled={!f.condition_type}
        />
      </td>
      <td className="p-2"><CellInput type="number" value={f.xp_bonus} onChange={set('xp_bonus')} className="w-20 text-right" /></td>
      <td className="p-2"><CellInput type="number" value={f.coin_bonus} onChange={set('coin_bonus')} className="w-20 text-right" /></td>
      <td className="p-2">
        <CellSelect
          value={f.is_active ? '1' : '0'}
          onChange={(e) => setF((x) => ({ ...x, is_active: e.target.value === '1' }))}
          className="w-24"
        >
          <option value="1">Đang bật</option>
          <option value="0">Đang tắt</option>
        </CellSelect>
      </td>
      <td className="p-2 whitespace-nowrap text-right">
        <Button
          size="sm" variant="outline" className="rounded-full text-xs" disabled={pending}
          onClick={() => onSave({
            ...f,
            condition_type: f.condition_type || null,
            condition_value: f.condition_type ? Number(f.condition_value) || 0 : null,
            xp_bonus: Number(f.xp_bonus) || 0,
            coin_bonus: Number(f.coin_bonus) || 0,
            sort_order: Number(f.sort_order) || 0,
          })}
        >
          Lưu
        </Button>
        <Button size="icon" variant="ghost" className="ml-1 h-8 w-8 text-muted-foreground" onClick={onDelete} aria-label={`Xoá huy hiệu ${f.name || ''}`} title="Xoá huy hiệu này">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export default function AdminBadges() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(null);
  const [thuHoi, setThuHoi] = React.useState(null);
  const [chonNguoi, setChonNguoi] = React.useState('');
  const [chonHuyHieu, setChonHuyHieu] = React.useState('');
  const [tim, setTim] = React.useState('');

  const badges = useQuery({
    queryKey: ['admin', 'badges'],
    queryFn: () => base44.entities.Badge.list('sort_order', 100),
  });
  // 2000 = tran cua entity User o worker. Xin 500 la khong trao duoc huy hieu
  // cho nguoi thu 501 tro di, va khong co gi bao la ho bi thieu.
  const members = useQuery({
    queryKey: ['admin', 'members'],
    queryFn: () => base44.entities.User.list('-total_xp', 2000),
  });
  const daTrao = useQuery({
    queryKey: ['admin', 'user-badges'],
    queryFn: () => base44.entities.UserBadge.list('-created_date', 300),
  });

  const lamMoi = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'badges'] });
    qc.invalidateQueries({ queryKey: ['admin', 'user-badges'] });
  };

  const luu = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.Badge.update(id, data)
      : base44.entities.Badge.create(data)),
    onSuccess: () => { toast({ title: 'Đã lưu huy hiệu' }); lamMoi(); },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const xoa = useMutation({
    mutationFn: (id) => base44.entities.Badge.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá huy hiệu' }); setDeleting(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const trao = useMutation({
    mutationFn: () => base44.functions.invoke('grantBadge', {
      target_user_id: chonNguoi, badge_id: chonHuyHieu,
    }),
    onSuccess: () => {
      toast({ title: 'Đã trao huy hiệu', description: 'Học viên nhận được thông báo và phần thưởng ngay.' });
      setChonNguoi(''); setChonHuyHieu(''); lamMoi();
    },
    onError: (err) => toast({ title: 'Không trao được', description: errText(err), variant: 'destructive' }),
  });

  const boTrao = useMutation({
    mutationFn: ({ row, reason }) => base44.functions.invoke('revokeBadge', {
      target_user_id: row.user_id, badge_id: row.badge_id, reason,
    }),
    onSuccess: () => { toast({ title: 'Đã thu hồi huy hiệu' }); setThuHoi(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không thu hồi được', description: errText(err), variant: 'destructive' }),
  });

  const raSoat = useMutation({
    mutationFn: () => base44.functions.invoke('backfillBadges', {}),
    onSuccess: (res) => {
      const d = res.data || res;
      const n = (d.da_trao || []).reduce((s, x) => s + x.badges.length, 0);
      toast({
        title: n ? `Đã trao ${n} huy hiệu` : 'Không ai mới đủ điều kiện',
        description: `Đã rà soát ${d.so_nguoi} học viên.`,
      });
      lamMoi();
    },
    onError: (err) => toast({ title: 'Rà soát thất bại', description: errText(err), variant: 'destructive' }),
  });

  const dsBadge = badges.data || [];
  const dsMember = members.data || [];
  const dsTrao = (daTrao.data || []).filter((r) => {
    if (!tim.trim()) return true;
    const q = tim.trim().toLowerCase();
    return (r.user_name || '').toLowerCase().includes(q)
      || (r.badge_name || '').toLowerCase().includes(q);
  });
  const nextOrder = dsBadge.reduce((m, b) => Math.max(m, b.sort_order || 0), 0) + 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Huy hiệu"
        description="Đặt điều kiện để hệ thống tự trao, hoặc trao tay cho những việc máy không đo được."
      >
        <Button
          variant="outline" className="rounded-full" disabled={raSoat.isPending}
          onClick={() => raSoat.mutate()}
        >
          {raSoat.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
          Rà soát cả lớp
        </Button>
        <Button
          className="rounded-full" disabled={luu.isPending}
          onClick={() => luu.mutate({
            data: {
              name: 'Huy hiệu mới', key: `badge_${Date.now()}`, icon: '🏅', description: '',
              condition_type: null, condition_value: null,
              xp_bonus: 0, coin_bonus: 0, is_active: false, sort_order: nextOrder,
            },
          })}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm huy hiệu
        </Button>
      </PageHeader>

      <Panel
        title={`${fmtNumber(dsBadge.length)} huy hiệu`}
        description={'Hệ thống tự rà soát sau mỗi lần cộng điểm. Nút "Rà soát cả lớp" dùng cho những '
          + 'người đã đủ điều kiện từ trước khi có máy trao huy hiệu.'}
      >
        <QueryState query={badges} empty={dsBadge.length === 0} emptyText="Chưa có huy hiệu nào.">
          <TableScroll>
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Icon</th>
                  <th className="p-2.5 font-semibold">Tên</th>
                  <th className="p-2.5 font-semibold">Mã</th>
                  <th className="p-2.5 font-semibold">Mô tả</th>
                  <th className="p-2.5 font-semibold">Điều kiện</th>
                  <th className="p-2.5 font-semibold">Ngưỡng</th>
                  <th className="p-2.5 font-semibold">XP thưởng</th>
                  <th className="p-2.5 font-semibold">Xu thưởng</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {dsBadge.map((b) => (
                  <BadgeRow
                    key={`${b.id}-${b.updated_date}`}
                    badge={b}
                    pending={luu.isPending}
                    onSave={(data) => luu.mutate({ id: b.id, data })}
                    onDelete={() => setDeleting(b)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      <Panel
        title="Trao tay"
        description="Dành cho những việc hệ thống không đo được: dẫn dắt nhóm, chia sẻ một bài chạm, đi đủ buổi."
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="bd-user">Học viên</label>
            <CellSelect id="bd-user" value={chonNguoi} onChange={(e) => setChonNguoi(e.target.value)} className="w-full">
              <option value="">— Chọn học viên —</option>
              {dsMember.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </CellSelect>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="bd-badge">Huy hiệu</label>
            <CellSelect id="bd-badge" value={chonHuyHieu} onChange={(e) => setChonHuyHieu(e.target.value)} className="w-full">
              <option value="">— Chọn huy hiệu —</option>
              {dsBadge.map((b) => (
                <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
              ))}
            </CellSelect>
          </div>
          <Button
            className="rounded-full"
            disabled={!chonNguoi || !chonHuyHieu || trao.isPending}
            onClick={() => trao.mutate()}
          >
            {trao.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Award className="mr-1 h-4 w-4" />}
            Trao huy hiệu
          </Button>
        </div>
      </Panel>

      <Panel
        // Truy van chan o 300 dong, nen con so nay KHONG phai tong that khi
        // vuot nguong - hien "300+" thay vi mot con so tron nghe nhu da dem
        // het. Mau lay tu AdminVip.jsx.
        title={`Đã trao (${(daTrao.data || []).length >= 300
          ? '300+'
          : fmtNumber((daTrao.data || []).length)})`}
        action={(
          <CellInput
            value={tim}
            onChange={(e) => setTim(e.target.value)}
            placeholder="Tìm theo tên học viên hoặc huy hiệu"
            className="w-64"
          />
        )}
      >
        {daTrao.isLoading ? <LoadingBlock /> : dsTrao.length === 0 ? (
          <EmptyBlock>Chưa trao huy hiệu nào.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Học viên</th>
                  <th className="p-2.5 font-semibold">Huy hiệu</th>
                  <th className="p-2.5 font-semibold">Lúc</th>
                  <th className="p-2.5 font-semibold">Bởi</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {dsTrao.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <InitialAvatar name={r.user_name} size={28} />
                        <span className="font-semibold">{r.user_name || '—'}</span>
                      </div>
                    </td>
                    <td className="p-2.5">{r.badge_icon} {r.badge_name}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{timeAgo(r.created_date)}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">
                      {r.created_by === 'he_thong' ? 'Hệ thống' : 'Trao tay'}
                    </td>
                    <td className="p-2.5 text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="rounded-full text-xs text-muted-foreground"
                        onClick={() => setThuHoi(r)}
                      >
                        Thu hồi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xoá huy hiệu này?"
        description={deleting
          ? `"${deleting.name}" sẽ biến mất khỏi danh sách. Những học viên đã nhận vẫn giữ huy hiệu trong hồ sơ.`
          : ''}
        pending={xoa.isPending}
        onConfirm={() => xoa.mutate(deleting.id)}
      />

      <ReasonDialog
        open={!!thuHoi}
        onOpenChange={(v) => !v && setThuHoi(null)}
        title="Thu hồi huy hiệu"
        description={thuHoi
          ? `Gỡ "${thuHoi.badge_name}" khỏi ${thuHoi.user_name}. Số xu đã thưởng KHÔNG bị đòi lại — `
            + 'học viên có thể đã tiêu rồi. Cần đòi lại thì dùng nút cộng/trừ điểm ở trang Học viên.'
          : ''}
        confirmLabel="Thu hồi"
        placeholder="Ví dụ: trao nhầm người, phát hiện gian lận..."
        pending={boTrao.isPending}
        onConfirm={(reason) => boTrao.mutate({ row: thuHoi, reason })}
      />
    </div>
  );
}
