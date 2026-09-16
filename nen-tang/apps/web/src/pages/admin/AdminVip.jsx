/**
 * Khu vuc VIP - mot cho duy nhat de chinh moi thu lien quan toi VIP: goi ban,
 * VA noi dung ben trong.
 *
 * TRUOC DAY viec nay nam rai o hai trang: gia va anh o "San pham", con noi dung
 * thi phai sang tab "Khoa hoc" tao khoa roi nho bat mot cong tac. Chi Thanh di
 * tim "cho chinh VIP" va khong thay dau ca - dung ra thi mot khai niem ma nguoi
 * dung nghi ve no nhu MOT THU thi phai co MOT trang.
 *
 * Trang nay khong them co che moi nao. No van ghi vao dung nhung cho cu:
 *   - `products` (sku = BRAND.productSku): gia, mo ta, anh
 *   - `courses` + `lessons`: noi dung, y het tab Khoa hoc (dung chung _khoahoc)
 *   - `products.grants_json`: khoa nao thuoc VIP
 *
 * DIEU QUAN TRONG NHAT o day: dua mot khoa vao VIP phai lam HAI viec cung luc.
 * Gan vao grants_json (de nguoi mua duoc mo) VA bat requires_unlock (de may chu
 * che video voi nguoi chua mua). Thieu ve dau cung hong theo huong nguoc nhau:
 * chi gan thi ai cung xem duoc, chi khoa thi nguoi da tra tien cung khong xem
 * duoc. Nen o day khong cho ai chinh tay tung ve mot - moi duong vao (tao moi,
 * keo khoa co san vao, bo ra) deu di qua `datVip` lam ca hai.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Loader2, ImagePlus, ExternalLink, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useKhaNang } from '@/lib/useKhaNang';
import ODanLinkAnh from '@/components/ODanLinkAnh';
import BRAND from '@/brand.generated.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  ConfirmDialog, EmptyBlock, LoadingBlock, PageHeader, Panel, StatusPill,
  errText, fmtNumber,
} from './_shared';
import {
  CourseCard, CourseDialog, EMPTY_COURSE, idKhoaTrongGoi,
} from './_khoahoc';

export default function AdminVip() {
  const { khaNang } = useKhaNang();
  const qc = useQueryClient();
  const { toast } = useToast();

  const goi = useQuery({
    queryKey: ['admin', 'product', BRAND.productSku],
    queryFn: () => base44.entities.Product.filter({ sku: BRAND.productSku }, 'sku', 1),
  });
  const sp = goi.data?.[0] || null;

  const khoaHoc = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => base44.entities.Course.list('sort_order', 200),
  });

  // Dem nguoi da mua - de chi Thanh biet bat noi dung len la bao nhieu nguoi
  // thay ngay, chu khong phai doan. May chu chan o 200 dong (LIMITS.default)
  // nen cham tran thi ghi "200+", dung noi con so sai.
  const daMua = useQuery({
    queryKey: ['admin', 'entitlements', BRAND.productSku],
    queryFn: () => base44.entities.Entitlement.filter(
      { kind: 'package', ref: BRAND.productSku }, '-created_date', 200),
  });

  const [draft, setDraft] = React.useState(null);
  const [dangTaiAnh, setDangTaiAnh] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);
  React.useEffect(() => { if (sp) setDraft(sp); }, [sp]);

  const idKhoaVip = React.useMemo(() => idKhoaTrongGoi(sp), [sp]);

  const luuGoi = useMutation({
    mutationFn: (patch) => base44.entities.Product.update(sp.id, patch),
    onSuccess: () => {
      toast({ title: 'Đã lưu gói VIP' });
      qc.invalidateQueries({ queryKey: ['admin', 'product', BRAND.productSku] });
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  /** Chi ghi danh sach khoa cua goi VIP. */
  const ghiDanhSachVip = (ids) => base44.entities.Product.update(sp.id, {
    grants_json: [...new Set(ids)].map((ref) => ({ kind: 'course', ref })),
  });

  /**
   * Dua mot khoa vao VIP hoac bo ra. Lam ca hai ve cung luc - xem ghi chu dau
   * file. Moi cho trong trang nay deu goi ham nay, khong ai duoc di duong tat.
   */
  const datVip = async (course, bat) => {
    await ghiDanhSachVip(bat
      ? [...idKhoaVip, course.id]
      : idKhoaVip.filter((x) => x !== course.id));
    if (course.id && !!course.requires_unlock !== bat) {
      await base44.entities.Course.update(course.id, { requires_unlock: bat });
    }
  };

  const lamMoi = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'product', BRAND.productSku] });
    qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
  };

  const doiKhoa = useMutation({
    mutationFn: ({ course, bat }) => datVip(course, bat),
    onSuccess: (_r, v) => {
      toast({ title: v.bat ? `Đã đưa “${v.course.name}” vào VIP` : `Đã bỏ “${v.course.name}” khỏi VIP` });
      lamMoi();
    },
    onError: (err) => toast({ title: 'Không đổi được', description: errText(err), variant: 'destructive' }),
  });

  const luuKhoa = useMutation({
    mutationFn: async ({ id, data }) => {
      // Khoa trong khu vuc VIP luon phai khoa lai, khong thi nguoi chua mua
      // cung xem duoc video.
      const duLieu = { ...data, requires_unlock: true };
      const res = id
        ? await base44.entities.Course.update(id, duLieu)
        : await base44.entities.Course.create(duLieu);
      const cid = id || res?.id;
      // Khoa moi tao o day mac nhien la khoa VIP - do la ly do nguoi dung bam
      // nut o trang nay chu khong phai trang Khoa hoc.
      if (cid && !idKhoaVip.includes(cid)) {
        await datVip({ ...duLieu, id: cid }, true);
      }
      return res;
    },
    onSuccess: (res, vars) => {
      toast({ title: vars.id ? 'Đã lưu khoá học' : 'Đã tạo khoá học VIP mới' });
      if (!vars.id && res?.id) setOpenId(res.id);
      setEditing(null);
      lamMoi();
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const xoaKhoa = useMutation({
    // Xoa khoa thi phai go luon khoi grants_json, khong thi goi VIP con tro toi
    // mot khoa khong con ton tai - im lang, cho toi khi co nguoi mua VIP va
    // thieu mat mot khoa.
    // Go khoi grants_json TRUOC roi moi xoa: nguoc lai thi buoc go se di sua
    // mot khoa vua bi xoa -> bao "Khong xoa duoc" trong khi no da xoa xong roi.
    mutationFn: async (course) => {
      if (idKhoaVip.includes(course.id)) {
        await ghiDanhSachVip(idKhoaVip.filter((x) => x !== course.id));
      }
      await base44.entities.Course.delete(course.id);
    },
    onSuccess: () => { toast({ title: 'Đã xoá khoá học' }); setDeleting(null); lamMoi(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const chonAnh = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDangTaiAnh(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setDraft((d) => ({ ...d, image_url: res.file_url }));
      toast({ title: 'Đã tải ảnh lên — nhớ bấm Lưu' });
    } catch (err) {
      toast({ title: 'Tải ảnh thất bại', description: errText(err), variant: 'destructive' });
    } finally {
      setDangTaiAnh(false);
      e.target.value = '';
    }
  };

  const ds = khoaHoc.data || [];
  const khoaVip = ds.filter((c) => idKhoaVip.includes(c.id));
  const khoaThuong = ds.filter((c) => !idKhoaVip.includes(c.id));
  const dsMua = daMua.data || [];
  const soNguoiMua = dsMua.filter((e) => !e.revoked_at).length;
  const chamTran = dsMua.length >= 200;

  if (goi.isLoading) return <LoadingBlock />;

  if (!sp) {
    return (
      <div className="space-y-5">
        <PageHeader title="Khu vực VIP" description="Gói VIP và nội dung dành riêng cho người đã mua." />
        <Panel>
          <EmptyBlock>
            Chưa có sản phẩm nào mang mã <b>{BRAND.productSku}</b>. Vào{' '}
            <Link to="/admin/products" className="font-bold text-primary underline">Sản phẩm</Link>{' '}
            tạo một sản phẩm với đúng mã này trước.
          </EmptyBlock>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Khu vực VIP"
        description="Gói VIP, giá bán, và nội dung chỉ người đã mua VIP mới xem được."
      >
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/lop-vip" target="_blank">
            Xem như học viên <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-500/5 px-4 py-3">
        <Crown className="h-5 w-5 shrink-0 text-amber-600" />
        <span className="text-[13.5px]">
          <b>{chamTran ? '200+' : fmtNumber(soNguoiMua)} người</b> đã mua gói VIP. Thêm một
          bài giảng vào đây là họ thấy ngay, không phải cấp lại quyền cho từng người.
        </span>
      </div>

      {/* ------------------------------------------------------- noi dung VIP
          Khong boc trong <Panel>: moi CourseCard da la mot Panel roi, long hai
          lop vien vao nhau nhin ra mot cai hop trong cai hop. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Nội dung VIP</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Khoá học và bài giảng chỉ người đã mua VIP mới xem được video.
            </p>
          </div>
          <Button className="rounded-full" onClick={() => setEditing({ ...EMPTY_COURSE, requires_unlock: true })}>
            <Plus className="mr-1 h-4 w-4" /> Tạo khoá học VIP
          </Button>
        </div>

        {khoaHoc.isLoading ? (
          <LoadingBlock />
        ) : khoaVip.length === 0 ? (
          <Panel>
            <EmptyBlock>
              Khu vực VIP chưa có nội dung nào. Bấm <b>Tạo khoá học VIP</b> để bắt đầu — hoặc
              đưa một khoá có sẵn vào VIP ở phần dưới.
            </EmptyBlock>
          </Panel>
        ) : (
          khoaVip.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onEdit={() => setEditing(c)}
              onDelete={() => setDeleting(c)}
              huyHieu={<StatusPill tone="warn">VIP</StatusPill>}
            />
          ))
        )}
      </div>

      {/* ------------------------------------- keo khoa co san vao / bo ra VIP */}
      {(khoaThuong.length > 0 || khoaVip.length > 0) && (
        <Panel
          title="Khoá có sẵn"
          description="Bật một khoá đang mở cho tất cả học viên thành khoá chỉ dành cho VIP, hoặc ngược lại."
        >
          <div className="space-y-2">
            {[...khoaVip, ...khoaThuong].map((c) => {
              const bat = idKhoaVip.includes(c.id);
              const dangDoi = doiKhoa.isPending && doiKhoa.variables?.course?.id === c.id;
              return (
                <label key={c.id} className={cnLop(bat)}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                      {bat
                        ? 'Chỉ người mua VIP xem được'
                        : c.requires_unlock
                          ? 'Đang khoá — cần admin mở tay cho từng người'
                          : 'Mở cho tất cả học viên'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {dangDoi && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch
                      checked={bat}
                      disabled={doiKhoa.isPending}
                      onCheckedChange={(v) => doiKhoa.mutate({ course: c, bat: v })}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ------------------------------------------------------------ goi VIP */}
      <Panel title="Gói VIP" description={`Mã sản phẩm: ${sp.sku} — dùng cho cả trang bán hàng lẫn Cửa hàng.`}>
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            <div
              className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted bg-contain bg-center bg-no-repeat"
              style={draft?.image_url ? { backgroundImage: `url(${draft.image_url})` } : undefined}
            />
            {khaNang.uploads ? (
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary">
                {dangTaiAnh
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><ImagePlus className="h-3.5 w-3.5" /> Tải ảnh bìa</>}
                <input type="file" accept="image/*" hidden onChange={chonAnh} disabled={dangTaiAnh} />
              </label>
            ) : (
              <ODanLinkAnh
                value={draft?.image_url}
                onChange={(v) => setDraft((d) => ({ ...d, image_url: v }))}
                nhan="Link ảnh bìa"
              />
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tên gói</Label>
              <Input
                value={draft?.name || ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mô tả ngắn (học viên đọc trước khi mua)</Label>
              <Textarea
                value={draft?.description || ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="min-h-[70px] rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Giá (đ)</Label>
                <Input
                  type="number"
                  value={draft?.price ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                  className="rounded-xl font-mono"
                />
              </div>
              <label className="flex items-center justify-between self-end rounded-xl border border-border p-3">
                <span className="text-sm font-semibold">Đang bán</span>
                <Switch
                  checked={!!draft?.is_active}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                />
              </label>
            </div>

            <Button
              className="rounded-full"
              disabled={luuGoi.isPending}
              onClick={() => luuGoi.mutate({
                name: draft.name,
                description: draft.description || '',
                image_url: draft.image_url || '',
                price: Number(draft.price) || 0,
                is_active: !!draft.is_active,
              })}
            >
              {luuGoi.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Lưu gói VIP
            </Button>
          </div>
        </div>
      </Panel>

      <CourseDialog
        value={editing}
        onClose={() => setEditing(null)}
        pending={luuKhoa.isPending}
        anCongTacVip
        onSubmit={(data) => luuKhoa.mutate({ id: editing?.id, data })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Xoá khoá học “${deleting?.name || ''}”?`}
        description="Xoá vĩnh viễn khoá học này khỏi khu vực VIP. Bài giảng bên trong và tiến độ học của học viên sẽ không còn hiển thị được. Không hoàn tác được."
        confirmLabel="Xoá khoá học"
        pending={xoaKhoa.isPending}
        onConfirm={() => xoaKhoa.mutate(deleting)}
      />
    </div>
  );
}

const cnLop = (bat) => [
  'flex items-center justify-between gap-3 rounded-xl border p-3',
  bat ? 'border-amber-400/60 bg-amber-500/5' : 'border-border',
].join(' ');
