/**
 * Nhan su: nguoi (va AI) dang cham bai, phu trach hoc vien.
 *
 * Dong "Trợ lý AI" trong du lieu khoi tao la co y: AI cham bai duoc
 * mo hinh hoa nhu mot nhan su, de so bai da duyet cua no dung chung mot cho voi
 * cua coach - dung xoa nham.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, ConfirmDialog, InitialAvatar, PageHeader, Panel, QueryState,
  StatusPill, TableScroll, errText, fmtNumber,
} from './_shared';

export default function Staff() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(null);

  const staff = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: () => base44.entities.Staff.list('sort_order', 200),
  });

  const save = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.Staff.update(id, data)
      : base44.entities.Staff.create(data)),
    onSuccess: (_res, vars) => {
      toast({ title: vars.id ? 'Đã lưu nhân sự' : 'Đã thêm nhân sự' });
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.Staff.delete(id),
    onSuccess: () => {
      toast({ title: 'Đã xoá nhân sự' });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const list = staff.data || [];
  const nextOrder = list.length ? Math.max(...list.map((s) => s.sort_order || 0)) + 1 : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhân sự"
        description="Đội ngũ đang phụ trách học viên và chấm bài — gồm cả trợ lý AI."
      >
        <Button
          className="rounded-full"
          disabled={save.isPending}
          onClick={() => save.mutate({
            data: {
              name: 'Nhân sự mới', email: '', role_label: 'Coach', avatar_url: '',
              assigned_members: 0, reviewed_count: 0, is_active: true, sort_order: nextOrder,
            },
          })}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm nhân sự
        </Button>
      </PageHeader>

      <Panel title={`${fmtNumber(list.length)} nhân sự`} description="Sửa trực tiếp trong bảng rồi bấm Lưu ở cuối dòng.">
        <QueryState query={staff} empty={list.length === 0} emptyText="Chưa có nhân sự nào.">
          <TableScroll>
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Nhân sự</th>
                  <th className="p-2.5 font-semibold">Email</th>
                  <th className="p-2.5 font-semibold">Vai trò</th>
                  <th className="p-2.5 font-semibold">Học viên phụ trách</th>
                  <th className="p-2.5 font-semibold">Bài đã duyệt</th>
                  <th className="p-2.5 font-semibold">Trạng thái</th>
                  <th className="p-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <StaffRow
                    key={`${s.id}-${s.updated_date}`}
                    staff={s}
                    pending={save.isPending}
                    onSave={(data) => save.mutate({ id: s.id, data })}
                    onDelete={() => setDeleting(s)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </QueryState>
      </Panel>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Xoá “${deleting?.name || ''}” khỏi danh sách nhân sự?`}
        description="Dòng nhân sự này bị xoá vĩnh viễn. Tài khoản đăng nhập (nếu có) không bị ảnh hưởng, nhưng số liệu phụ trách và đã duyệt sẽ mất."
        confirmLabel="Xoá nhân sự"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(deleting.id)}
      />
    </div>
  );
}

function StaffRow({ staff, onSave, onDelete, pending }) {
  const [draft, setDraft] = React.useState(staff);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2.5">
        <div className="flex items-center gap-2.5">
          <InitialAvatar name={draft.name} size={32} />
          <CellInput value={draft.name || ''} onChange={set('name')} className="min-w-[180px] font-semibold" />
        </div>
      </td>
      <td className="p-2.5">
        <CellInput value={draft.email || ''} onChange={set('email')} className="min-w-[180px]" placeholder="email@..." />
      </td>
      <td className="p-2.5">
        <CellInput value={draft.role_label || ''} onChange={set('role_label')} className="w-36" placeholder="VD: Coach" />
      </td>
      <td className="p-2.5">
        <CellInput type="number" value={draft.assigned_members ?? 0} onChange={set('assigned_members')} className="w-24" />
      </td>
      <td className="p-2.5">
        <CellInput type="number" value={draft.reviewed_count ?? 0} onChange={set('reviewed_count')} className="w-24" />
      </td>
      <td className="p-2.5">
        <CellSelect
          value={draft.is_active === false ? '0' : '1'}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.value === '1' })}
          className="w-32"
        >
          <option value="1">Hoạt động</option>
          <option value="0">Tạm nghỉ</option>
        </CellSelect>
      </td>
      <td className="p-2.5">
        <div className="flex items-center gap-1.5">
          {staff.user_id ? null : <StatusPill tone="brand">Không có tài khoản</StatusPill>}
          <Button
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => onSave({
              name: draft.name || '',
              email: draft.email || '',
              role_label: draft.role_label || '',
              assigned_members: Number(draft.assigned_members) || 0,
              reviewed_count: Number(draft.reviewed_count) || 0,
              is_active: draft.is_active !== false,
            })}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
          </Button>
          <Button size="icon" variant="outline" className="rounded-full text-destructive" onClick={onDelete} aria-label="Xoá nhân sự">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
