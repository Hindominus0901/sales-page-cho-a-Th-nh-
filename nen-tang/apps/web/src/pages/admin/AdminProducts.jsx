/**
 * San pham cua gian hang: khoa hoc, goi nang cap, ve.
 *
 * BA THU DE SAI, doc truoc khi sua:
 *
 * 1. `sku` la KHOA THAT SU. Don hang luu `product_sku`, va `fulfilOrder` tra
 *    bang nay theo sku de biet mo quyen gi. Doi sku cua mot san pham da co don
 *    la lam nhung don cu khong con biet minh mua gi - nen sua duoc nhung phai
 *    biet minh dang lam gi.
 *
 * 2. `grants_json` la thu QUYET DINH nguoi mua duoc mo cai gi. De rong thi ho
 *    tra tien xong chi nhan mot quyen `package` tro tro, khong mo duoc khoa hoc
 *    nao - video van bi may chu che. Day cung la danh sach ma tab "Khu vuc VIP"
 *    doc de biet khoa nao thuoc VIP.
 *
 * 3. `is_active = 0` thi khong ai mua duoc: `createOrder` tu choi thang. Dung
 *    de tam ngung ban chu khong phai de an khoi danh sach.
 */
import React from 'react';
import { useKhaNang } from '@/lib/useKhaNang';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, ImagePlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellLink, CellSelect, ConfirmDialog, EmptyBlock, LoadingBlock,
  PageHeader, Panel, QueryState, TableScroll, errText, fmtNumber, loiLink,
} from './_shared';

const KIND = [
  { value: 'course', label: 'Khoá học' },
  { value: 'package', label: 'Gói' },
  { value: 'ticket', label: 'Vé' },
];

export default function AdminProducts() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const sanPham = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => base44.entities.Product.list('sort_order', 200),
  });

  // Danh sach khoa hoc de chi Thanh chon "mua cai nay thi mo khoa nao", thay vi
  // phai tu go id khoa hoc vao JSON.
  const khoaHoc = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: () => base44.entities.Course.list('sort_order', 200),
  });

  const lamMoi = () => qc.invalidateQueries({ queryKey: ['admin', 'products'] });

  const them = useMutation({
    mutationFn: () => base44.entities.Product.create({
      sku: `SP${Date.now().toString(36).toUpperCase().slice(-6)}`,
      name: 'Sản phẩm mới',
      kind: 'course',
      price: 0,
      currency: 'VND',
      grants_json: [],
      is_active: false,       // chua dat gia thi chua duoc ban
      sort_order: (sanPham.data?.length || 0) + 1,
    }),
    onSuccess: () => { toast({ title: 'Đã thêm sản phẩm' }); lamMoi(); },
    onError: (err) => toast({ title: 'Không thêm được', description: errText(err), variant: 'destructive' }),
  });

  const luu = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.Product.update(id, patch),
    onSuccess: () => { toast({ title: 'Đã lưu' }); lamMoi(); },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const xoa = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá sản phẩm' }); lamMoi(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const ds = sanPham.data || [];
  const chuaDatGia = ds.filter((p) => p.is_active && !(Number(p.price) > 0));
  // Chua dat hoa hong thi he thong van tra tien - bang ty le chung cua nguoi
  // gioi thieu (mac dinh 20%). Im lang nhu vay la dung cai nguy hiem: mot khoa
  // vai trieu bat ban ma quen dat ty le se tu dong tra 20% moi don, khong log,
  // khong canh bao. Neu ngoai le, bam 0 la cau tra loi ro rang.
  const chuaDatHoaHong = ds.filter(
    (p) => p.is_active && (p.commission_rate === null || p.commission_rate === undefined));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sản phẩm"
        description="Hàng bày trong Cửa hàng. Giá, ảnh, và quyền được mở khi mua."
      />

      <div className="flex items-center gap-3">
        <Button className="rounded-full" disabled={them.isPending} onClick={() => them.mutate()}>
          {them.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          Thêm sản phẩm
        </Button>
        <span className="text-sm text-muted-foreground">{fmtNumber(ds.length)} sản phẩm</span>
      </div>

      {/* Bat gia 0 ma van bat ban: createOrder se tu choi, nhung o day noi truoc
          de chi Thanh khong phai doi khach bao moi biet. */}
      {chuaDatGia.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
          <b>{chuaDatGia.length} sản phẩm đang bật bán nhưng chưa đặt giá.</b>{' '}
          Khách bấm Mua sẽ bị từ chối. Đặt giá hoặc tắt Đang bán:{' '}
          {chuaDatGia.map((p) => p.name).join(', ')}
        </div>
      )}

      {chuaDatHoaHong.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
          <b>{chuaDatHoaHong.length} sản phẩm đang bán nhưng chưa đặt hoa hồng.</b>{' '}
          Bán được thì hệ thống vẫn trả theo tỷ lệ chung của người giới thiệu.
          Đặt số cho từng sản phẩm, hoặc gõ 0 nếu sản phẩm này không trả hoa hồng:{' '}
          {chuaDatHoaHong.map((p) => p.name).join(', ')}
        </div>
      )}

      <Panel>
        <QueryState query={sanPham} empty={ds.length === 0} emptyText="Chưa có sản phẩm nào.">
          <TableScroll>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2.5 font-semibold">Sản phẩm</th>
                  <th className="p-2.5 font-semibold">Mã (SKU)</th>
                  <th className="p-2.5 font-semibold">Loại</th>
                  <th className="p-2.5 text-right font-semibold">Giá</th>
                  <th className="p-2.5 text-right font-semibold">Hoa hồng</th>
                  <th className="p-2.5 font-semibold">Sức chứa</th>
                  <th className="p-2.5 font-semibold">Mua xong nhận gì</th>
                  <th className="p-2.5 font-semibold">Đang bán</th>
                  <th className="p-2.5" />
                </tr>
              </thead>
              <tbody>
                {ds.map((p) => (
                  <DongSanPham
                    key={p.id}
                    sp={p}
                    khoaHoc={khoaHoc.data || []}
                    onSave={(patch) => luu.mutate({ id: p.id, patch })}
                    onDelete={() => xoa.mutate(p.id)}
                    dangLuu={luu.isPending}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
          {khoaHoc.isLoading && <LoadingBlock />}
          {!khoaHoc.isLoading && (khoaHoc.data || []).length === 0 && (
            <EmptyBlock>
              Chưa có khoá học nào để gắn vào sản phẩm. Vào trang “Khoá học” tạo một khoá trước đã.
            </EmptyBlock>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}

function DongSanPham({ sp, khoaHoc, onSave, onDelete, dangLuu }) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState(sp);
  const [hoiXoa, setHoiXoa] = React.useState(false);
  const [dangTaiAnh, setDangTaiAnh] = React.useState(false);
  const { khaNang } = useKhaNang();

  React.useEffect(() => setDraft(sp), [sp]);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  // grants_json co the la mang (entity da parse) hoac chuoi. Chuan hoa mot lan.
  const mo = React.useMemo(() => {
    let v = draft.grants_json;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
    return (Array.isArray(v) ? v : []).filter((g) => g?.kind === 'course' && g?.ref).map((g) => g.ref);
  }, [draft.grants_json]);

  const doiKhoa = (courseId, bat) => {
    const moi = bat ? [...new Set([...mo, courseId])] : mo.filter((x) => x !== courseId);
    setDraft((d) => ({ ...d, grants_json: moi.map((ref) => ({ kind: 'course', ref })) }));
  };

  // Chan Luu khi con o link sai dang. Luu duoc mot link hong thi khong ai biet
  // cho toi khi co hoc vien bam vao no va rot vao trang 404.
  //
  // KHONG kiem `image_url`: anh tai len co duong noi bo dang /api/files/u/...
  // - hop le nhung khong bat dau bang https://, kiem no la chan mat chinh cai
  // nut Tai anh ben canh.
  const coLinkSai = [draft.delivery_url, draft.zalo_group_url].some((v) => !!loiLink(v));

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

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="p-2.5">
        <div className="flex items-start gap-2.5">
          {/* Cung ty le 4:3 va cung kieu contain voi the ma hoc vien nhin thay -
              xem truoc phai giong that, khong thi dan anh vao roi khong biet no
              bi xen. */}
          <div
            className="aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted bg-contain bg-center bg-no-repeat"
            style={draft.image_url ? { backgroundImage: `url(${draft.image_url})` } : undefined}
            aria-hidden="true"
          />
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <CellInput value={draft.name || ''} onChange={set('name')} className="font-semibold" />
            <div className="flex items-center gap-1.5">
              <CellInput
                value={draft.image_url || ''}
                onChange={set('image_url')}
                placeholder={khaNang.uploads ? 'Link ảnh, hoặc bấm Tải ảnh' : 'Dán link ảnh vào đây'}
                className="flex-1"
              />
              {/* Xem chu thich cung loai o AdminRewards: nut tai anh chi co
                  nghia khi kho anh dang bat. */}
              {khaNang.uploads && (
                <label className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-secondary">
                  {dangTaiAnh
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <span className="flex items-center gap-1"><ImagePlus className="h-3.5 w-3.5" /> Tải ảnh</span>}
                  <input type="file" accept="image/*" hidden onChange={chonAnh} disabled={dangTaiAnh} />
                </label>
              )}
            </div>
            <CellInput
              value={draft.description || ''}
              onChange={set('description')}
              placeholder="Mô tả ngắn (học viên đọc trước khi mua)"
            />
          </div>
        </div>
      </td>

      <td className="p-2.5">
        <CellInput value={draft.sku || ''} onChange={set('sku')} className="w-28 font-mono" />
      </td>

      <td className="p-2.5">
        <CellSelect value={draft.kind || 'course'} onChange={set('kind')} className="w-28">
          {KIND.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </CellSelect>
      </td>

      <td className="p-2.5 text-right">
        <CellInput
          type="number"
          value={draft.price ?? 0}
          onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
          className="w-28 text-right font-mono"
        />
      </td>

      {/* Nhap theo PHAN TRAM cho de doc, luu xuong la phan thap phan (20 -> 0.2).
          De trong = chua dat -> roi ve ty le chung cua tung nguoi gioi thieu,
          dung bang hanh vi truoc khi co cot nay. So 0 KHAC de trong: 0 nghia la
          san pham nay co y khong tra hoa hong. */}
      <td className="p-2.5 text-right">
        <CellInput
          type="number"
          min="0"
          max="100"
          placeholder="—"
          value={draft.commission_rate === null || draft.commission_rate === undefined
            ? ''
            : Math.round(Number(draft.commission_rate) * 1000) / 10}
          onChange={(e) => setDraft((d) => ({
            ...d,
            commission_rate: e.target.value === '' ? null : Number(e.target.value) / 100,
          }))}
          className="w-20 text-right font-mono"
        />
        <span className="ml-1 text-xs text-muted-foreground">%</span>
      </td>

      {/* Suc chua theo khoa.

          De TRONG = khong gioi han, va do la mac dinh. Dat mot con so vao day
          la tu do `createOrder` tu choi don MOI khi da du - tuc la cau "Toi da
          30 cho moi khoa" tren trang ban hang tro thanh su that thay vi mot loi
          hua khong ai giu.

          Nut "Mo khoa moi" la phan BAT BUOC di kem, khong phai tien ich: dat
          tran ma khong co duong dat lai moc dem thi ban du 30 la cong dang ky
          dong VINH VIEN, va khong mot nut nao trong ca trang quan tri mo lai
          duoc. */}
      <td className="p-2.5 align-top">
        <div className="min-w-[190px] space-y-1.5">
          <div className="flex items-center gap-1.5">
            <CellInput
              type="number"
              min="0"
              placeholder="—"
              value={draft.seats_total === null || draft.seats_total === undefined
                ? '' : draft.seats_total}
              onChange={(e) => setDraft((d) => ({
                ...d,
                seats_total: e.target.value === '' ? null : Number(e.target.value),
              }))}
              className="w-20 text-right font-mono"
              aria-label="Số chỗ tối đa mỗi khoá"
            />
            <span className="text-xs text-muted-foreground">chỗ/khoá</span>
          </div>

          {draft.seats_total === null || draft.seats_total === undefined ? (
            <p className="text-[11px] text-muted-foreground">
              Để trống = không giới hạn.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                {draft.cohort_start_at
                  ? `Đang đếm đơn đã trả tiền từ ${String(draft.cohort_start_at).slice(0, 10)}.`
                  : 'Đang đếm toàn bộ đơn đã trả tiền từ trước tới nay.'}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-full text-[11px]"
                onClick={() => setDraft((d) => ({ ...d, cohort_start_at: new Date().toISOString() }))}
                title="Đặt lại mốc đếm về hôm nay — đơn của khoá cũ thôi chiếm chỗ của khoá mới"
              >
                Mở khoá mới (đếm lại từ hôm nay)
              </Button>
            </>
          )}
        </div>
      </td>

      <td className="p-2.5">
        <div className="min-w-[280px] space-y-2">
          {/* Ba duong giao hang, dung duoc rieng le hoac cung luc. Truoc day chi
              co duong dau - nen mot san pham khong phai khoa hoc thi mua xong
              KHONG NHAN DUOC GI ma he thong cung khong bao loi. */}
          <div>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Mở khoá học
            </span>
            <div className="max-h-20 space-y-1 overflow-y-auto">
              {khoaHoc.length === 0 ? (
                <span className="text-xs text-muted-foreground">Chưa có khoá học nào</span>
              ) : khoaHoc.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={mo.includes(c.id)}
                    onChange={(e) => doiKhoa(c.id, e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Link tài liệu
            </span>
            <CellLink
              value={draft.delivery_url}
              onChange={set('delivery_url')}
              placeholder="https://...notion.site/..."
              className="w-full"
            />
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Nhóm Zalo riêng
            </span>
            <CellLink
              value={draft.zalo_group_url}
              onChange={set('zalo_group_url')}
              placeholder="https://zalo.me/g/..."
              className="w-full"
            />
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Lời nhắn sau khi mua
            </span>
            <CellInput
              value={draft.delivery_note || ''}
              onChange={set('delivery_note')}
              placeholder="VD: Mật khẩu mở tài liệu là..."
              className="w-full"
            />
          </div>
        </div>
      </td>

      <td className="p-2.5">
        <CellSelect
          value={draft.is_active ? '1' : '0'}
          onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.value === '1' }))}
          className="w-24"
        >
          <option value="1">Đang bán</option>
          <option value="0">Tạm ngưng</option>
        </CellSelect>
      </td>

      <td className="p-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="rounded-full"
            disabled={dangLuu || coLinkSai}
            title={coLinkSai ? 'Sửa đường link sai định dạng trước đã' : undefined}
            onClick={() => onSave({
              sku: draft.sku,
              name: draft.name,
              kind: draft.kind,
              price: Number(draft.price) || 0,
              commission_rate: draft.commission_rate === null || draft.commission_rate === undefined
                ? null
                : Number(draft.commission_rate),
              currency: draft.currency || 'VND',
              description: draft.description || '',
              image_url: draft.image_url || '',
              delivery_url: (draft.delivery_url || '').trim(),
              delivery_note: (draft.delivery_note || '').trim(),
              zalo_group_url: (draft.zalo_group_url || '').trim(),
              grants_json: mo.map((ref) => ({ kind: 'course', ref })),
              is_active: !!draft.is_active,
              sort_order: Number(draft.sort_order) || 0,
              // null phai di xuong nguyen ven: no la "khong gioi han", khac han
              // so 0. `Number(null) || 0` se bien no thanh 0 - tuc la KHONG CON
              // CHO NAO, dong cong thanh toan ngay lap tuc.
              seats_total: draft.seats_total === null || draft.seats_total === undefined
                ? null
                : Number(draft.seats_total),
              seats_offset: Number(draft.seats_offset) || 0,
              cohort_start_at: draft.cohort_start_at || null,
            })}
          >
            Lưu
          </Button>
          <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => setHoiXoa(true)} aria-label={`Xoá sản phẩm ${draft.name || ''}`} title="Xoá sản phẩm này">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <ConfirmDialog
          open={hoiXoa}
          onOpenChange={setHoiXoa}
          title={`Xoá "${sp.name}"?`}
          description="Đơn hàng cũ vẫn giữ nguyên, nhưng sản phẩm này sẽ biến mất khỏi Cửa hàng."
          confirmLabel="Xoá sản phẩm"
          onConfirm={() => { setHoiXoa(false); onDelete(); }}
        />
      </td>
    </tr>
  );
}
