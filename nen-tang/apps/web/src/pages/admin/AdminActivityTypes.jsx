/**
 * Loai hoat dong - thu hoc vien chon khi bam "Ghi nhan hoat dong".
 *
 * ============ VI SAO TRANG NAY MOI DUOC THEM ============
 *
 * Entity `ActivityType` da duoc hai man hinh hoc vien doc tu lau:
 *   - Dashboard.jsx  - de hien danh sach nut
 *   - ActivityModal.jsx - de hien tieu chi cham (ai_criteria) cho hoc vien doc
 *
 * Nhung `grep ActivityType apps/web/src/pages/admin/` tra ve RONG. Nghia la
 * khong mot trang quan tri nao sua duoc bang do. Du lieu chi co duoc nho mot
 * lenh INSERT trong migration 0004_seed.sql.
 *
 * Hau qua: khi Dashboard bao "Chua co loai hoat dong nao duoc mo", trong ca
 * san pham khong co mot cai nut nao de xu ly chuyen do. Muon them mot muc, doi
 * so XP, hay tat mot muc di - deu phai goi lap trinh vien va cho mot lan deploy.
 *
 * ============ VI SAO `key` BI KHOA SAU KHI TAO ============
 *
 * `key` khong phai mot cai nhan. No la hai thu cung luc:
 *
 *   1. Moi dong trong bang `activities` luu `activity_type_key`. Doi key la
 *      toan bo lich su cua muc do mo coi - bai da duyet khong con noi ve dau.
 *   2. worker/src/functions/index.js:166 anh xa CUNG key do sang cot dem cua
 *      nguoi dung: content -> content_count, call -> call_count,
 *      assignment -> assignment_count.
 *
 * Nen o nhap `key` chi mo khi TAO MOI. Sua dong da co thi no thanh chu thuong,
 * doc duoc ma khong go duoc. Day la mot han che co y, khong phai sot.
 */
import React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, ConfirmDialog, PageHeader, Panel, QueryState,
  TableScroll, errText, fmtNumber,
} from './_shared';

const MOI = {
  name: '', key: '', description: '', icon: '', category: '',
  xp_reward: 10, coin_reward: 5, daily_cap: 1,
  is_active: true, sort_order: 0, ai_criteria: '',
};

function Dong({ loai, moi, pending, onSave, onDelete }) {
  const [f, setF] = React.useState({ ...MOI, ...loai });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Key chi duoc go MOT LAN, luc tao. Xem chu thich dau file.
  const khoaKey = !moi;
  const thieuTen = !String(f.name || '').trim();
  const keyXau = moi && !/^[a-z][a-z0-9_]{1,30}$/.test(String(f.key || '').trim());
  const loiLuu = thieuTen
    ? 'Cần có tên hiển thị.'
    : keyXau
      ? 'Mã chỉ gồm chữ thường, số và dấu _, bắt đầu bằng chữ (VD: dang_bai).'
      : '';

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="p-2">
        <CellInput value={f.name} onChange={set('name')} className="w-40" placeholder="Đăng content" />
      </td>
      <td className="p-2">
        {khoaKey ? (
          <span
            className="block w-32 font-mono text-xs text-muted-foreground"
            title="Mã không đổi được sau khi tạo — mọi hoạt động đã ghi đều tham chiếu tới nó."
          >
            {f.key}
          </span>
        ) : (
          <CellInput value={f.key} onChange={set('key')} className="w-32 font-mono text-xs" placeholder="dang_bai" />
        )}
      </td>
      <td className="p-2">
        <CellInput value={f.description} onChange={set('description')} className="w-56" placeholder="Học viên đọc câu này" />
      </td>
      <td className="p-2">
        <CellInput type="number" value={f.xp_reward} onChange={set('xp_reward')} className="w-20 text-right" />
      </td>
      <td className="p-2">
        <CellInput type="number" value={f.coin_reward} onChange={set('coin_reward')} className="w-20 text-right" />
      </td>
      <td className="p-2">
        <CellInput type="number" value={f.daily_cap} onChange={set('daily_cap')} className="w-20 text-right" />
      </td>
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
          size="sm"
          variant="outline"
          className="rounded-full text-xs"
          disabled={pending || !!loiLuu}
          title={loiLuu || undefined}
          onClick={() => onSave({
            name: String(f.name).trim(),
            key: String(f.key).trim(),
            description: f.description || '',
            icon: f.icon || '',
            category: f.category || '',
            ai_criteria: f.ai_criteria || '',
            xp_reward: Number(f.xp_reward) || 0,
            coin_reward: Number(f.coin_reward) || 0,
            daily_cap: Number(f.daily_cap) || 0,
            is_active: !!f.is_active,
            sort_order: Number(f.sort_order) || 0,
          })}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lưu'}
        </Button>
        {!moi && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-1 h-8 w-8 text-muted-foreground"
            onClick={onDelete}
            aria-label={`Xoá loại hoạt động ${f.name}`}
            title="Xoá loại này"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </td>
      {loiLuu && (
        <td className="p-2 text-[11.5px] leading-snug text-destructive">{loiLuu}</td>
      )}
    </tr>
  );
}

export default function AdminActivityTypes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [themMoi, setThemMoi] = React.useState(false);
  const [xoa, setXoa] = React.useState(null);

  const ds = useQuery({
    queryKey: ['admin', 'activity-types'],
    queryFn: () => base44.entities.ActivityType.list('sort_order', 100),
  });

  const lamMoi = () => qc.invalidateQueries({ queryKey: ['admin', 'activity-types'] });

  const luu = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.ActivityType.update(id, data)
      : base44.entities.ActivityType.create(data)),
    onSuccess: (_r, v) => {
      toast({ title: v.id ? 'Đã lưu' : 'Đã thêm loại hoạt động' });
      setThemMoi(false);
      lamMoi();
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const xoaMut = useMutation({
    mutationFn: (id) => base44.entities.ActivityType.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá' }); setXoa(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const list = ds.data || [];
  const dangBat = list.filter((t) => t.is_active !== false).length;
  const tiepTheo = list.length ? Math.max(...list.map((t) => t.sort_order || 0)) + 1 : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loại hoạt động"
        description="Những mục học viên chọn khi bấm “Ghi nhận hoạt động”. Tắt một mục là nó biến mất khỏi app học viên ngay."
      >
        <Button className="rounded-full" onClick={() => setThemMoi(true)} disabled={themMoi}>
          <Plus className="mr-1 h-4 w-4" /> Thêm loại
        </Button>
      </PageHeader>

      <Panel
        title={`${fmtNumber(list.length)} loại · ${fmtNumber(dangBat)} đang bật`}
        description="Trần/ngày là số lần tối đa một học viên được cộng điểm cho mục này trong một ngày. Vượt trần vẫn ghi nhận, chỉ không cộng thêm."
      >
        <QueryState
          query={ds}
          empty={list.length === 0 && !themMoi}
          emptyText="Chưa có loại hoạt động nào — học viên sẽ không ghi nhận được gì. Bấm “Thêm loại” để tạo mục đầu tiên."
        >
          <TableScroll>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2 font-semibold">Tên hiển thị</th>
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 font-semibold">Mô tả</th>
                  <th className="p-2 font-semibold">XP</th>
                  <th className="p-2 font-semibold">Xu</th>
                  <th className="p-2 font-semibold">Trần/ngày</th>
                  <th className="p-2 font-semibold">Trạng thái</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {themMoi && (
                  <Dong
                    moi
                    loai={{ ...MOI, sort_order: tiepTheo }}
                    pending={luu.isPending}
                    onSave={(data) => luu.mutate({ data })}
                  />
                )}
                {list.map((t) => (
                  <Dong
                    key={`${t.id}-${t.updated_date}`}
                    loai={t}
                    pending={luu.isPending}
                    onSave={(data) => luu.mutate({ id: t.id, data })}
                    onDelete={() => setXoa(t)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>

          {themMoi && (
            <Button variant="ghost" size="sm" className="mt-2 rounded-full" onClick={() => setThemMoi(false)}>
              Huỷ thêm mới
            </Button>
          )}
        </QueryState>
      </Panel>

      <ConfirmDialog
        open={!!xoa}
        onOpenChange={(v) => !v && setXoa(null)}
        title={`Xoá loại “${xoa?.name || ''}”?`}
        description={'Những hoạt động học viên đã ghi theo mục này vẫn còn trong hệ thống, nhưng sẽ không '
          + 'còn tra ra được tên mục. Nếu chỉ muốn ẩn đi thì chọn “Đang tắt” thay vì xoá.'}
        confirmLabel="Xoá loại này"
        pending={xoaMut.isPending}
        onConfirm={() => xoaMut.mutate(xoa.id)}
      />
    </div>
  );
}
