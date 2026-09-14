/**
 * Tuy chinh Member Portal: bat/tat, doi ten va sap xep cac phan tren app hoc
 * vien.
 *
 * "Ma phan" (section_key) la thu app hoc vien dua vao de biet ve cai gi. Doi
 * ten thi tu do, nhung them mot ma la khong co trong app thi se khong hien ra
 * gi ca - vi vay man hinh noi ro dieu do thay vi de admin doan.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  CellInput, ConfirmDialog, EmptyBlock, PageHeader, Panel, QueryState, errText,
} from './_shared';

/** Cac trang cua app hoc vien - de admin them phan vao ca trang chua co dong nao. */
const PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'journey', label: 'Hành trình' },
  { key: 'leaderboard', label: 'Bảng xếp hạng' },
  { key: 'rewards', label: 'Đổi quà' },
  { key: 'badges', label: 'Huy hiệu & Cấp bậc' },
  { key: 'submit', label: 'Challenge & Nộp bài' },
  { key: 'affiliate', label: 'Affiliate' },
];

export default function PortalBuilder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = React.useState(null);

  const sections = useQuery({
    queryKey: ['admin', 'portalSections'],
    queryFn: () => base44.entities.PortalSection.list('sort_order', 300),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'portalSections'] });

  const save = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.PortalSection.update(id, data)
      : base44.entities.PortalSection.create(data)),
    onSuccess: (_res, vars) => {
      // Bat/tat con mat da thay doi ngay tren man hinh, khong can bao them.
      if (!vars.silent) toast({ title: vars.id ? 'Đã lưu' : 'Đã thêm phần mới' });
      invalidate();
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const swap = useMutation({
    // Doi cho hai dong = doi cho sort_order cua chung, khong danh so lai ca list.
    mutationFn: async ({ a, b }) => {
      await base44.entities.PortalSection.update(a.id, { sort_order: b.sort_order });
      await base44.entities.PortalSection.update(b.id, { sort_order: a.sort_order });
    },
    onSuccess: invalidate,
    onError: (err) => toast({ title: 'Không đổi thứ tự được', description: errText(err), variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.PortalSection.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá phần' }); setDeleting(null); invalidate(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const all = sections.data || [];
  const extraKeys = [...new Set(all.map((s) => s.page_key))]
    .filter((k) => !PAGES.some((p) => p.key === k))
    .map((k) => ({ key: k, label: k }));
  const pages = [...PAGES, ...extraKeys];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tuỳ chỉnh Member Portal"
        description="Ẩn/hiện, đổi tên, sắp xếp lại hoặc xoá các phần hiển thị trên app học viên — thay đổi áp dụng cho tất cả học viên."
      />

      <QueryState query={sections}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {pages.map((page) => {
            const rows = all
              .filter((s) => s.page_key === page.key)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 1 : 1;

            return (
              <Panel
                key={page.key}
                title={page.label}
                action={(
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={save.isPending}
                    onClick={() => save.mutate({
                      data: {
                        page_key: page.key,
                        section_key: `new_${Date.now()}`,
                        label: 'Phần mới',
                        visible: true,
                        sort_order: nextOrder,
                      },
                    })}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Thêm phần
                  </Button>
                )}
              >
                {rows.length === 0 ? (
                  <EmptyBlock>Trang này chưa khai báo phần nào.</EmptyBlock>
                ) : (
                  <div className="space-y-2">
                    {rows.map((s, i) => (
                      <SectionRow
                        key={`${s.id}-${s.updated_date}`}
                        section={s}
                        isFirst={i === 0}
                        isLast={i === rows.length - 1}
                        busy={save.isPending || swap.isPending}
                        onRename={(label) => save.mutate({ id: s.id, data: { label } })}
                        onToggle={() => save.mutate({ id: s.id, data: { visible: !s.visible }, silent: true })}
                        onMoveUp={() => swap.mutate({ a: s, b: rows[i - 1] })}
                        onMoveDown={() => swap.mutate({ a: s, b: rows[i + 1] })}
                        onDelete={() => setDeleting(s)}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </QueryState>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Xoá phần “${deleting?.label || ''}”?`}
        description="Phần này biến mất khỏi app học viên. Nếu chỉ muốn tạm giấu thì dùng nút con mắt thay vì xoá — xoá rồi phải thêm lại bằng tay."
        confirmLabel="Xoá phần"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(deleting.id)}
      />
    </div>
  );
}

function SectionRow({ section, isFirst, isLast, busy, onRename, onToggle, onMoveUp, onMoveDown, onDelete }) {
  const [label, setLabel] = React.useState(section.label || '');
  const dirty = label !== (section.label || '');

  return (
    <div className={cn('flex items-center gap-2 rounded-xl border border-border p-2', !section.visible && 'opacity-60')}>
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isFirst || busy}
          onClick={onMoveUp}
          aria-label="Đưa lên trên"
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={isLast || busy}
          onClick={onMoveDown}
          aria-label="Đưa xuống dưới"
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <CellInput value={label} onChange={(e) => setLabel(e.target.value)} className="font-semibold" />
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">{section.section_key}</div>
      </div>

      {dirty && (
        <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onRename(label)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
        </Button>
      )}

      <Button
        size="icon"
        variant="outline"
        className="rounded-full"
        disabled={busy}
        onClick={onToggle}
        aria-label={section.visible ? 'Ẩn phần này' : 'Hiện phần này'}
        title={section.visible ? 'Đang hiện — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}
      >
        {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="rounded-full text-destructive"
        onClick={onDelete}
        aria-label="Xoá phần"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
