/**
 * Khoa hoc & Lop hoc: CRUD khoa hoc va bai giang cua tung khoa.
 *
 * Bo dung khoa/bai giang nam o `_khoahoc.jsx` vi tab "Khu vuc VIP" dung y het -
 * chi khac o cho no chi hien nhung khoa thuoc goi VIP.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import BRAND from '@/brand.generated.js';
import { ConfirmDialog, PageHeader, QueryState, errText } from './_shared';
import {
  CourseCard, CourseDialog, EMPTY_COURSE, idKhoaTrongGoi,
} from './_khoahoc';

export default function AdminCourses() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openId, setOpenId] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);

  const courses = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => base44.entities.Course.list('sort_order', 100),
  });

  // Goi VIP: `grants_json` cua no vua quyet dinh nguoi mua duoc mo khoa nao,
  // vua la danh sach ma tab "Khu vuc VIP" doc de biet hien khoa nao. Mot nguon
  // su that cho ca hai - va do la co y: neu tach ra thi se co ngay mot khoa
  // hien o tab VIP ma nguoi mua VIP khong xem duoc video.
  const goiVip = useQuery({
    queryKey: ['admin', 'product', BRAND.productSku],
    queryFn: () => base44.entities.Product.filter({ sku: BRAND.productSku }, 'sku', 1),
  });
  const spVip = goiVip.data?.[0] || null;
  const idKhoaVip = React.useMemo(() => idKhoaTrongGoi(spVip), [spVip]);

  /** Them/bo mot khoa khoi goi VIP. */
  const datVip = async (courseId, bat) => {
    if (!spVip) {
      toast({
        title: 'Chưa có gói VIP để gắn',
        description: `Vào Quản trị → Sản phẩm tạo sản phẩm có mã ${BRAND.productSku} trước nhé.`,
        variant: 'destructive',
      });
      return;
    }
    const moi = bat
      ? [...new Set([...idKhoaVip, courseId])]
      : idKhoaVip.filter((x) => x !== courseId);
    await base44.entities.Product.update(spVip.id, {
      grants_json: moi.map((ref) => ({ kind: 'course', ref })),
    });
    qc.invalidateQueries({ queryKey: ['admin', 'product', BRAND.productSku] });
  };

  const saveCourse = useMutation({
    mutationFn: async ({ id, data, laVip }) => {
      const { laVip: _bo, ...duLieu } = data;
      const res = id
        ? await base44.entities.Course.update(id, duLieu)
        : await base44.entities.Course.create(duLieu);
      // Gan/bo VIP SAU khi khoa da ton tai - khoa moi thi truoc do chua co id
      // de ghi vao grants_json.
      const cid = id || res?.id;
      if (cid && laVip !== undefined && laVip !== idKhoaVip.includes(cid)) {
        await datVip(cid, laVip);
      }
      return res;
    },
    onSuccess: (res, vars) => {
      toast({ title: vars.id ? 'Đã lưu khoá học' : 'Đã tạo khoá học mới' });
      if (!vars.id && res?.id) setOpenId(res.id);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const removeCourse = useMutation({
    // Xoa khoa thi phai go luon khoi grants_json, khong thi goi VIP con tro toi
    // mot khoa khong con ton tai - im lang, khong ai thay, cho toi khi co nguoi
    // mua VIP va thieu mat mot khoa.
    mutationFn: async (id) => {
      if (spVip && idKhoaVip.includes(id)) await datVip(id, false);
      await base44.entities.Course.delete(id);
    },
    onSuccess: () => {
      toast({ title: 'Đã xoá khoá học' });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const list = courses.data || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Khoá học & Lớp học"
        description="Tạo khoá học, thêm bài giảng, gắn video và tài liệu cho từng bài."
      >
        <Button className="rounded-full" onClick={() => setEditing({ ...EMPTY_COURSE })}>
          <Plus className="mr-1 h-4 w-4" /> Tạo khoá học
        </Button>
      </PageHeader>

      <QueryState query={courses} empty={list.length === 0} emptyText="Chưa có khoá học nào.">
        <div className="space-y-3">
          {list.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onEdit={() => setEditing(c)}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </div>
      </QueryState>

      <CourseDialog
        value={editing}
        onClose={() => setEditing(null)}
        pending={saveCourse.isPending}
        laVipBanDau={editing?.id ? idKhoaVip.includes(editing.id) : false}
        onSubmit={(data, laVip) => saveCourse.mutate({ id: editing?.id, data, laVip })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Xoá khoá học “${deleting?.name || ''}”?`}
        description="Xoá vĩnh viễn khoá học này. Bài giảng bên trong và tiến độ học của học viên sẽ không còn hiển thị được. Không hoàn tác được."
        confirmLabel="Xoá khoá học"
        pending={removeCourse.isPending}
        onConfirm={() => removeCourse.mutate(deleting.id)}
      />
    </div>
  );
}
