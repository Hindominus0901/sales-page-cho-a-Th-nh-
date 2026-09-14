/**
 * Qua tang: kho qua va hang doi doi qua.
 *
 * Doi qua KHONG sua thang bang Redemption ma phai qua ham updateRedemption -
 * huy don thi backend hoan xu lai cho hoc vien, sua tay se lam mat so xu do.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { base44, adminApi } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  CellInput, CellLink, CellSelect, ConfirmDialog, EmptyBlock, InitialAvatar, LoadingBlock,
  PageHeader, Panel, QueryState, ReasonDialog, StatusPill, TableScroll,
  errText, fmtNumber, timeAgo,
} from './_shared';

const REDEMPTION_TABS = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'cancelled', label: 'Đã huỷ' },
];

const REDEMPTION_TONE = { pending: 'warn', approved: 'brand', delivered: 'good', cancelled: 'bad' };
const REDEMPTION_LABEL = { pending: 'Chờ duyệt', approved: 'Đã duyệt', delivered: 'Đã giao', cancelled: 'Đã huỷ' };

export default function AdminRewards() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(null);
  const [tab, setTab] = React.useState('pending');
  const [cancelling, setCancelling] = React.useState(null);

  const rewards = useQuery({
    queryKey: ['admin', 'rewards'],
    queryFn: () => base44.entities.Reward.list('sort_order', 200),
  });
  const levels = useQuery({
    queryKey: ['levels'],
    queryFn: () => base44.entities.Level.list('level_number', 20),
  });
  const redemptions = useQuery({
    queryKey: ['admin', 'redemptions', tab],
    queryFn: () => base44.entities.Redemption.filter({ status: tab }, '-created_date', 200),
  });

  const saveReward = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.Reward.update(id, data)
      : base44.entities.Reward.create(data)),
    onSuccess: (_res, vars) => {
      toast({ title: vars.id ? 'Đã lưu quà tặng' : 'Đã thêm quà tặng' });
      qc.invalidateQueries({ queryKey: ['admin', 'rewards'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const traoBu = useMutation({
    mutationFn: () => adminApi.traoThuongBu(),
    onSuccess: (res) => {
      const d = res?.data || res;
      toast({
        title: d?.so_nguoi
          ? `Đã trao cho ${d.so_nguoi} người`
          : 'Không còn ai đang chờ — mọi người đã nhận đủ',
        description: d?.so_nguoi
          ? `${d.so_qua || 0} phần quà${d.so_ve_vip ? `, ${d.so_ve_vip} vé VIP` : ''}.`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
    },
    onError: (err) => toast({ title: 'Không trao được', description: errText(err), variant: 'destructive' }),
  });

  const removeReward = useMutation({
    mutationFn: (id) => base44.entities.Reward.delete(id),
    onSuccess: () => {
      toast({ title: 'Đã xoá quà tặng' });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin', 'rewards'] });
    },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const updateRedemption = useMutation({
    mutationFn: (payload) => base44.functions.invoke('updateRedemption', payload),
    onSuccess: (_res, vars) => {
      toast({
        title: vars.status === 'cancelled' ? 'Đã huỷ đơn và hoàn xu' : 'Đã cập nhật đơn đổi quà',
      });
      setCancelling(null);
      qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
    },
    onError: (err) => toast({ title: 'Không cập nhật được', description: errText(err), variant: 'destructive' }),
  });

  const rewardList = rewards.data || [];
  const levelList = levels.data || [];
  const redemptionList = redemptions.data || [];
  const nextOrder = rewardList.length ? Math.max(...rewardList.map((r) => r.sort_order || 0)) + 1 : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý Quà tặng"
        description="Kho quà học viên đổi bằng xu, và hàng đợi xử lý các đơn đã đổi."
      >
        <Button
          className="rounded-full"
          disabled={saveReward.isPending}
          onClick={() => saveReward.mutate({
            data: {
              name: 'Quà tặng mới', description: '', image_url: '', category: 'Khác',
              coin_cost: 100, quantity: 10, min_level: 1, min_referrals: 0,
              is_active: false, is_hot: false,
              delivery_url: null,
              sort_order: nextOrder,
            },
          })}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm quà tặng
        </Button>
      </PageHeader>

      {/* Kho qua co hang nhung khong hang nao bat "Hien thi" = hoc vien mo trang
          Doi qua ra mot man hinh trong, con o day nhin thay day du mot bang.
          Khong noi ra thi khong ai doan duoc hai man hinh dang khac nhau. */}
      {rewardList.length > 0 && !rewardList.some((r) => r.is_active) && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900">
          <b>Học viên đang không thấy quà nào.</b> Tất cả quà trong kho đều đang tắt —
          bật cột <b>Hiển thị</b> ở dòng quà rồi bấm <b>Lưu</b> thì trang Đổi quà mới có hàng.
        </div>
      )}

      {/* Dat "Moi du" > 0 cho mot mon qua thi tu hom sau cron se trao cho ai da
          du dieu kien - nhung nguoi vua dat xong thuong muon thay ket qua NGAY,
          va bat ho cho den 1 gio sang de kiem tra la vo ly. */}
      {rewardList.some((r) => Number(r.min_referrals) > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <div className="text-[13px]">
            <b>Quà mở khoá bằng lời mời</b> được trao tự động cho ai mời đủ số người —
            mỗi khi có lượt mới, và một lần mỗi ngày. Vừa thêm quà mới thì bấm đây để trao ngay
            cho những người đã đủ điều kiện từ trước.
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={traoBu.isPending}
            onClick={() => traoBu.mutate()}
          >
            {traoBu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Trao bù ngay'}
          </Button>
        </div>
      )}

      <Panel title={`${fmtNumber(rewardList.length)} quà tặng`} description="Sửa trực tiếp trong bảng rồi bấm Lưu ở cuối dòng.">
        <QueryState query={rewards} empty={rewardList.length === 0} emptyText="Kho quà đang trống.">
          <TableScroll>
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Quà tặng</th>
                  <th className="p-2.5 font-semibold">Nhóm</th>
                  <th className="p-2.5 font-semibold">Link nhận quà</th>
                  <th className="p-2.5 font-semibold">Giá (xu)</th>
                  <th className="p-2.5 font-semibold">Cấp tối thiểu</th>
                  <th className="p-2.5 font-semibold">Mời đủ (người)</th>
                  <th className="p-2.5 font-semibold">Còn lại</th>
                  <th className="p-2.5 font-semibold">Hiển thị</th>
                  <th className="p-2.5 font-semibold">Nổi bật</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rewardList.map((r) => (
                  <RewardRow
                    key={`${r.id}-${r.updated_date}`}
                    reward={r}
                    levels={levelList}
                    pending={saveReward.isPending}
                    onSave={(data) => saveReward.mutate({ id: r.id, data })}
                    onDelete={() => setDeleting(r)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      <Panel
        title="Hàng đợi đổi quà"
        description="Huỷ đơn sẽ tự động hoàn lại số xu đã trừ của học viên."
        action={(
          <div className="flex flex-wrap gap-1.5">
            {REDEMPTION_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                  tab === t.key
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      >
        {redemptions.isLoading ? (
          <LoadingBlock />
        ) : redemptionList.length === 0 ? (
          <EmptyBlock>Không có đơn nào trong mục này.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Học viên</th>
                  <th className="p-2.5 font-semibold">Quà</th>
                  <th className="p-2.5 text-right font-semibold">Xu đã trừ</th>
                  <th className="p-2.5 font-semibold">Thời gian</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                  <th className="p-2.5 font-semibold">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {redemptionList.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="p-2.5">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={r.user_name} size={30} />
                        <span className="font-semibold">{r.user_name}</span>
                      </div>
                    </td>
                    <td className="p-2.5">{r.reward_name}</td>
                    <td className="p-2.5 text-right font-bold text-amber-600">{fmtNumber(r.coin_spent)}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{timeAgo(r.created_date)}</td>
                    <td className="p-2.5">
                      <StatusPill tone={REDEMPTION_TONE[r.status] || 'muted'}>
                        {REDEMPTION_LABEL[r.status] || r.status}
                      </StatusPill>
                      {r.note && <div className="mt-1 text-[11px] text-muted-foreground">{r.note}</div>}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {r.status === 'pending' && (
                          <Button
                            size="sm"
                            className="rounded-full"
                            disabled={updateRedemption.isPending}
                            onClick={() => updateRedemption.mutate({ redemption_id: r.id, status: 'approved' })}
                          >
                            Duyệt
                          </Button>
                        )}
                        {(r.status === 'pending' || r.status === 'approved') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              disabled={updateRedemption.isPending}
                              onClick={() => updateRedemption.mutate({ redemption_id: r.id, status: 'delivered' })}
                            >
                              Đã giao
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-destructive"
                              onClick={() => setCancelling(r)}
                            >
                              Huỷ
                            </Button>
                          </>
                        )}
                        {(r.status === 'delivered' || r.status === 'cancelled') && (
                          <span className="text-xs text-muted-foreground">Đã xong</span>
                        )}
                      </div>
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
        title={`Xoá quà “${deleting?.name || ''}”?`}
        description="Quà sẽ biến mất khỏi kho đổi quà của học viên. Các đơn đã đổi trước đó vẫn giữ nguyên. Không hoàn tác được."
        confirmLabel="Xoá quà"
        pending={removeReward.isPending}
        onConfirm={() => removeReward.mutate(deleting.id)}
      />

      <ReasonDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Huỷ đơn đổi quà"
        description={`Huỷ đơn “${cancelling?.reward_name || ''}” của ${cancelling?.user_name || ''}. Hệ thống sẽ hoàn lại ${fmtNumber(cancelling?.coin_spent)} xu cho học viên.`}
        confirmLabel="Huỷ đơn và hoàn xu"
        reasonLabel="Lý do huỷ (bắt buộc)"
        placeholder="VD: hết hàng, học viên đổi nhầm"
        pending={updateRedemption.isPending}
        onConfirm={(reason) => updateRedemption.mutate({
          redemption_id: cancelling.id, status: 'cancelled', note: reason,
        })}
      />
    </div>
  );
}

function RewardRow({ reward, levels, onSave, onDelete, pending }) {

  const [draft, setDraft] = React.useState(reward);
  const { toast } = useToast();
  const [dangTaiAnh, setDangTaiAnh] = React.useState(false);

  /** Tai anh tu may len R2 roi dien duong dan vao o. Giong Community.jsx. */
  const chonAnh = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDangTaiAnh(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setDraft((d) => ({ ...d, image_url: res.file_url }));
    } catch (err) {
      toast({ title: 'Không tải được ảnh', description: errText(err), variant: 'destructive' });
    } finally {
      setDangTaiAnh(false);
    }
  };

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2.5">
        <div className="flex items-center gap-2.5">
          {/* Xem truoc phai giong HET the ma hoc vien nhin thay: cung ty le
              4:3, cung kieu contain. Truoc day o day la mot o vuong 40px kieu
              cover - quan tri vien dan anh vao, thay no vua khit, va khong bao
              gio biet ban that bi xen mat chu. */}
          <div
            className="aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted bg-contain bg-center bg-no-repeat"
            style={draft.image_url ? { backgroundImage: `url(${draft.image_url})` } : undefined}
            aria-hidden="true"
          />
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <CellInput value={draft.name || ''} onChange={set('name')} className="font-semibold" />

            {/* Anh bia cua qua. Truoc day o nay khong co nhan gi, nam lot thom
                duoi ten qua va chi dan duoc link - nen nhin vao khong ai biet
                no la cho de anh. Gio co nhan, va co nut tai anh len that. */}
            <div className="flex items-center gap-1.5">
              <CellInput
                value={draft.image_url || ''}
                onChange={set('image_url')}
                className="text-xs"
                placeholder="Ảnh quà — dán link hoặc bấm Tải ảnh"
              />
              <label className={cn(
                'shrink-0 cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold',
                'hover:bg-secondary',
                dangTaiAnh && 'pointer-events-none opacity-60',
              )}>
                {dangTaiAnh ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tải ảnh'}
                <input type="file" accept="image/*" className="hidden" onChange={chonAnh} />
              </label>
            </div>

            <CellInput
              value={draft.description || ''}
              onChange={set('description')}
              className="text-xs"
              placeholder="Mô tả ngắn (học viên đọc trước khi đổi)"
            />
          </div>
        </div>
      </td>
      <td className="p-2.5">
        <CellInput value={draft.category || ''} onChange={set('category')} className="w-32" placeholder="Nhóm" />
      </td>
      <td className="p-2.5">
        {/* Qua co link nay duoc giao NGAY khi hoc vien doi, khong qua hang doi
            duyet - thuong la mot trang Notion. De trong thi qua van vao hang doi
            nhu cu cho quan tri vien gui tay. */}
        <div className="w-56 space-y-1.5">
          <CellLink
            value={draft.delivery_url}
            onChange={set('delivery_url')}
            className="w-full"
            placeholder="https://...notion.site/..."
          />
          {/* Loi nhan di kem mon qua: mat khau mo tai lieu, han dung, cach dung.
              Truoc day cot nay co trong co so du lieu nhung khong co o nao de
              dien - nen khong ai dung toi no. */}
          <CellInput
            value={draft.delivery_note || ''}
            onChange={set('delivery_note')}
            className="w-full"
            placeholder="Lời nhắn kèm quà (VD: mật khẩu là...)"
          />
        </div>
      </td>
      <td className="p-2.5">
        <CellInput type="number" value={draft.coin_cost ?? 0} onChange={set('coin_cost')} className="w-24" />
      </td>
      <td className="p-2.5">
        <CellSelect value={draft.min_level ?? 0} onChange={set('min_level')} className="w-32">
          <option value={0}>Không giới hạn</option>
          {levels.map((l) => (
            <option key={l.id} value={l.level_number}>{l.icon} {l.name}</option>
          ))}
        </CellSelect>
      </td>
      {/* "Mo khoa bang loi moi, khong phai bang tien" - dung cau tren trang ban
          hang. Dat > 0 thi mon qua nay TU DUOC TRAO cho ai moi du so nguoi do,
          khong cho ho phai bam doi va khong tru xu. */}
      <td className="p-2.5">
        <CellInput
          type="number"
          value={draft.min_referrals ?? 0}
          onChange={set('min_referrals')}
          className="w-24"
        />
      </td>
      <td className="p-2.5">
        <CellInput type="number" value={draft.quantity ?? 0} onChange={set('quantity')} className="w-24" />
      </td>
      <td className="p-2.5">
        <CellSelect
          value={draft.is_active ? '1' : '0'}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.value === '1' })}
          className="w-24"
        >
          <option value="1">Hiện</option>
          <option value="0">Ẩn</option>
        </CellSelect>
      </td>
      <td className="p-2.5">
        <CellSelect
          value={draft.is_hot ? '1' : '0'}
          onChange={(e) => setDraft({ ...draft, is_hot: e.target.value === '1' })}
          className="w-24"
        >
          <option value="0">Thường</option>
          <option value="1">🔥 Nổi bật</option>
        </CellSelect>
      </td>
      <td className="p-2.5">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => onSave({
              name: draft.name || '',
              image_url: draft.image_url || '',
            description: draft.description || '',
              category: draft.category || '',
              delivery_url: (draft.delivery_url || '').trim() || null,
              delivery_note: (draft.delivery_note || '').trim(),
              coin_cost: Number(draft.coin_cost) || 0,
              min_level: Number(draft.min_level) || 0,
              min_referrals: Number(draft.min_referrals) || 0,
              quantity: Number(draft.quantity) || 0,
              is_active: !!draft.is_active,
              is_hot: !!draft.is_hot,
            })}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
          </Button>
          <Button size="icon" variant="outline" className="rounded-full text-destructive" onClick={onDelete} aria-label="Xoá quà">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
