/**
 * Quan tri Lich & su kien.
 *
 * Hai viec: tao/sua buoi, va diem danh. Diem danh la cho DUY NHAT cong diem
 * `event_attended` - luat da nam san trong point_rules tu dau nhung truoc gio
 * chua co ai goi toi.
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Check, X, Users } from 'lucide-react';
import BRAND from '@/brand.generated';
import { base44 } from '@/api/base44Client';
import ONhapAnh from '@/components/ONhapAnh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  PageHeader, Panel, LoadingBlock, ErrorBlock, EmptyBlock, TableScroll,
  StatusPill, CellInput, CellSelect, ConfirmDialog, errText, fmtDateTime,
} from './_shared';

const KINDS = [
  { value: 'live', label: 'Buổi live' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'qna', label: 'Hỏi đáp' },
  { value: 'offline', label: 'Gặp mặt trực tiếp' },
];

const STATUSES = [
  { value: 'scheduled', label: 'Đã lên lịch' },
  { value: 'live', label: 'Đang diễn ra' },
  { value: 'done', label: 'Đã kết thúc' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

/**
 * "9:00 -> 9:15" thay vi "mo 0 phut, dong 15 phut".
 *
 * Chi Thanh nghi bang GIO CHOT ("9 gio 15 la het han"), khong nghi bang so phut
 * lech. Bat cho tu nham hai con so ra gio la moi lan doi lai phai doan xem minh
 * vua lam gi - va doan sai thi ca lop khong diem danh duoc.
 *
 * Doc theo gio thuong hieu (getUTC* sau khi cong do lech), khong theo mui gio
 * cua may: chi Thanh mo trang quan tri tu dau thi cung phai thay 9:15.
 */
function khungDiemDanh(startsAt, moPhut, dongPhut) {
  if (!startsAt) return 'Đặt giờ bắt đầu trước đã.';
  const t = Date.parse(startsAt);
  if (Number.isNaN(t)) return 'Giờ bắt đầu chưa hợp lệ.';
  const lech = (Number(BRAND.tzOffsetMinutes) || 0) * 60000;
  const gio = (phut) => {
    const d = new Date(t + lech + (Number(phut) || 0) * 60000);
    const hai = (n) => String(n).padStart(2, '0');
    return `${hai(d.getUTCHours())}:${hai(d.getUTCMinutes())}`;
  };
  const mo = gio(moPhut);
  const dong = gio(dongPhut);
  if (Number(dongPhut) <= Number(moPhut)) {
    return `${mo} → ${dong} — giờ đóng không sau giờ mở, sẽ không ai điểm danh được.`;
  }
  return `${mo} → ${dong}`;
}

const BLANK = {
  title: '', description: '', kind: 'live', starts_at: '', ends_at: '',
  location: '', join_url: '', cover_url: '', capacity: 0, min_level: 0, requires_unlock: false,
  checkin_open_min: 0, checkin_close_min: 15,
  recording_url: '', status: 'scheduled', is_active: true,
};

/** <input type="datetime-local"> can "YYYY-MM-DDTHH:mm" theo GIO DIA PHUONG. */
/**
 * O `datetime-local` khong mang mui gio: no chi la mot xau "2026-09-09T09:00".
 * Truoc day hai ham nay doi xau do bang `new Date(v)` va `d.getHours()` - tuc
 * la theo mui gio CUA MAY dang mo trang quan tri.
 *
 * Do la mot cai bay im lang: mot laptop dat mui gio Sydney (UTC+10) go 9:00 se
 * luu thanh 06:00 gio Viet Nam. Khong bao loi, khong canh bao - chi la buoi hoc
 * hien sai gio, va khung diem danh 15 phut dong lai truoc khi buoi hoc bat dau
 * ba tieng. Chuyen nay DA XAY RA voi buoi Kick-Off.
 *
 * Nen ca hai chieu deu neo vao mui gio cua THUONG HIEU (brand.json), khong bao
 * gio hoi may dang dung.
 */
const LECH_PHUT = Number(BRAND.tzOffsetMinutes) || 0;

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Doi sang gio thuong hieu roi doc bang cac ham UTC - khong dung getHours().
  const t = new Date(d.getTime() + LECH_PHUT * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};

const fromLocalInput = (v) => {
  if (!v) return '';
  // Them 'Z' de xau duoc doc nhu gio UTC (khong phu thuoc may), roi tru do lech
  // di la ra dung moc thoi gian that.
  const utcGia = new Date(`${v.length === 16 ? v : v.slice(0, 16)}:00Z`);
  if (Number.isNaN(utcGia.getTime())) return '';
  return new Date(utcGia.getTime() - LECH_PHUT * 60000).toISOString();
};

function Attendance({ event, onClose }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const signups = useQuery({
    queryKey: ['event-signups', event.id],
    queryFn: () => base44.entities.EventSignup.filter({ event_id: event.id }, '-created_date', 500),
  });

  const mark = useMutation({
    mutationFn: ({ userIds, present }) =>
      base44.functions.invoke('markEventAttendance', {
        event_id: event.id, user_ids: userIds, present,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['event-signups', event.id] });
      const ok = (res?.results || []).filter((r) => r.ok).length;
      const xp = (res?.results || []).reduce((n, r) => n + (r.award?.xp || 0), 0);
      toast({ title: `Đã cập nhật ${ok} người`, description: xp ? `Cộng tổng ${xp} XP.` : undefined });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Không điểm danh được', description: errText(err) }),
  });

  const rows = (signups.data || []).filter((r) => r.status !== 'cancelled');
  const pending = rows.filter((r) => r.status === 'registered').map((r) => r.user_id);

  return (
    <Panel
      title={`Điểm danh — ${event.title}`}
      description="Đánh dấu có mặt sẽ cộng XP và xu cho học viên. Điểm danh lại không cộng thêm lần nữa."
      action={<Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>}
    >
      {signups.isLoading ? <LoadingBlock /> : !rows.length ? (
        <EmptyBlock>Chưa ai đăng ký buổi này.</EmptyBlock>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!pending.length || mark.isPending}
              onClick={() => mark.mutate({ userIds: pending, present: true })}
            >
              {mark.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Điểm danh tất cả còn lại ({pending.length})
            </Button>
          </div>
          <TableScroll>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="pb-2 pr-4 font-medium">Học viên</th>
                  <th className="pb-2 pr-4 font-medium">Đăng ký lúc</th>
                  <th className="pb-2 pr-4 font-medium">Trạng thái</th>
                  <th className="pb-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{r.user_name || r.user_id}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{fmtDateTime(r.registered_at)}</td>
                    <td className="py-2 pr-4">
                      <StatusPill tone={r.status === 'attended' ? 'good' : r.status === 'absent' ? 'bad' : 'muted'}>
                        {r.status === 'attended' ? 'Có mặt' : r.status === 'absent' ? 'Vắng' : 'Đã đăng ký'}
                      </StatusPill>
                    </td>
                    <td className="py-2">
                      {/* CO CHU, khong chi bieu tuong.
                          Truoc day o day la mot dau V va mot dau X tran, khong
                          nhan, khong aria-label, va ca hai deu bi lam mo khi
                          dong da o dung trang thai do - ma khong noi vi sao.
                          Diem danh mot buoi hoc dang dien ra bang cach doan xem
                          dau xam nao nghia la gi la chuyen khong nen bat ai lam. */}
                      <div className="flex gap-1.5">
                        <Button
                          size="sm" variant="outline" className="h-7 px-2 text-[11.5px] font-bold"
                          disabled={mark.isPending || r.status === 'attended'}
                          title={r.status === 'attended' ? 'Đã đánh dấu có mặt rồi' : 'Đánh dấu người này có mặt'}
                          onClick={() => mark.mutate({ userIds: [r.user_id], present: true })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Có mặt
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-[11.5px] font-bold"
                          disabled={mark.isPending || r.status === 'absent'}
                          title={r.status === 'absent' ? 'Đã đánh dấu vắng rồi' : 'Đánh dấu người này vắng'}
                          onClick={() => mark.mutate({ userIds: [r.user_id], present: false })}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Vắng
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </Panel>
  );
}

export default function AdminEvents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState(null);
  const [attending, setAttending] = useState(null);
  const [removing, setRemoving] = useState(null);

  const events = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => base44.entities.CalendarEvent.list('-starts_at', 300),
  });

  const allSignups = useQuery({
    queryKey: ['event-signups'],
    queryFn: () => base44.entities.EventSignup.list('-created_date', 2000),
  });

  const seatsOf = useMemo(() => {
    const map = {};
    for (const s of allSignups.data || []) {
      if (s.status === 'cancelled') continue;
      map[s.event_id] = (map[s.event_id] || 0) + 1;
    }
    return map;
  }, [allSignups.data]);

  const done = () => {
    qc.invalidateQueries({ queryKey: ['admin-events'] });
    setDraft(null);
  };

  const save = useMutation({
    mutationFn: (d) => {
      const body = { ...d, capacity: Number(d.capacity) || 0, min_level: Number(d.min_level) || 0 };
      return d.id ? base44.entities.CalendarEvent.update(d.id, body)
        : base44.entities.CalendarEvent.create(body);
    },
    onSuccess: () => { done(); toast({ title: 'Đã lưu' }); },
    onError: (err) => toast({ variant: 'destructive', title: 'Không lưu được', description: errText(err) }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.CalendarEvent.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      setRemoving(null);
      toast({ title: 'Đã xoá' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Không xoá được', description: errText(err) }),
  });

  const set = (key) => (e) => {
    const v = e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value;
    setDraft((d) => ({ ...d, [key]: v }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch & sự kiện"
        description="Buổi live, workshop, hỏi đáp — và điểm danh để cộng XP."
      >
        <Button onClick={() => setDraft({ ...BLANK })}>
          <Plus className="mr-2 h-4 w-4" />Tạo buổi mới
        </Button>
      </PageHeader>

      {draft && (
        <Panel
          title={draft.id ? 'Sửa buổi' : 'Buổi mới'}
          action={<Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Huỷ</Button>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Tiêu đề</span>
              <Input value={draft.title} onChange={set('title')} placeholder="Live tuần 1: Dựng bộ khung hệ thống" />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Mô tả</span>
              <Textarea rows={2} value={draft.description || ''} onChange={set('description')} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Loại</span>
              <CellSelect value={draft.kind} onChange={set('kind')}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </CellSelect>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Trạng thái</span>
              <CellSelect value={draft.status} onChange={set('status')}>
                {STATUSES.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </CellSelect>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Bắt đầu</span>
              <CellInput
                type="datetime-local"
                value={toLocalInput(draft.starts_at)}
                onChange={(e) => setDraft((d) => ({ ...d, starts_at: fromLocalInput(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Kết thúc</span>
              <CellInput
                type="datetime-local"
                value={toLocalInput(draft.ends_at)}
                onChange={(e) => setDraft((d) => ({ ...d, ends_at: fromLocalInput(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Địa điểm / phòng</span>
              <CellInput value={draft.location || ''} onChange={set('location')} placeholder="Zoom / Google Meet / địa chỉ" />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Đường vào phòng</span>
              <CellInput value={draft.join_url || ''} onChange={set('join_url')} placeholder="https://..." />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Số chỗ (0 = không giới hạn)</span>
              <CellInput type="number" min="0" value={draft.capacity ?? 0} onChange={set('capacity')} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Cấp tối thiểu (0 = ai cũng vào)</span>
              <CellInput type="number" min="0" value={draft.min_level ?? 0} onChange={set('min_level')} />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Link xem lại (dán sau khi buổi kết thúc)</span>
              <CellInput value={draft.recording_url || ''} onChange={set('recording_url')} placeholder="https://..." />
            </label>
            <div className="grid gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Ảnh bìa buổi học</span>
              <ONhapAnh
                nhan="Ảnh bìa"
                value={draft.cover_url}
                onChange={(v) => setDraft((d) => ({ ...d, cover_url: v }))}
              />
            </div>

            {/* Khung diem danh. TRUOC DAY khong co o nao o day, nen muon doi
                gio chot 9:15 la phai sua thang trong co so du lieu - chi Thanh
                khong tu lam duoc. Tinh bang PHUT so voi gio bat dau, va cho so
                am, vi "mo cua truoc 15 phut" la thu hay dung nhat. */}
            <label className="grid gap-1">
              <span className="text-sm font-medium">Mở điểm danh (phút so với giờ bắt đầu)</span>
              <CellInput
                type="number"
                value={draft.checkin_open_min ?? 0}
                onChange={set('checkin_open_min')}
              />
              <span className="text-[11.5px] text-muted-foreground">
                0 = đúng giờ bắt đầu. −15 = mở sớm 15 phút.
              </span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Đóng điểm danh (phút sau giờ bắt đầu)</span>
              <CellInput
                type="number"
                value={draft.checkin_close_min ?? 15}
                onChange={set('checkin_close_min')}
              />
              <span className="text-[11.5px] text-muted-foreground">
                15 = chốt lúc 9:15 nếu buổi bắt đầu 9:00.
              </span>
            </label>
            <p className="sm:col-span-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed">
              <b>Khung điểm danh hiện tại:</b>{' '}
              {khungDiemDanh(draft.starts_at, draft.checkin_open_min, draft.checkin_close_min)}
            </p>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={!!draft.requires_unlock} onChange={set('requires_unlock')} />
              <span className="text-sm">Cần được mở khoá mới đăng ký được (buổi trả phí)</span>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.is_active !== false}
                onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              />
              <span className="text-sm">Đang hiện cho học viên</span>
            </label>
          </div>

          <p className="mt-3 text-[13px] text-muted-foreground">
            Đường vào phòng và link xem lại chỉ gửi cho người đã đăng ký — máy chủ
            cắt sẵn, không phải chỉ ẩn nút.
          </p>

          <div className="mt-4">
            <Button onClick={() => save.mutate(draft)} disabled={!draft.title || !draft.starts_at || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu
            </Button>
          </div>
        </Panel>
      )}

      {attending && <Attendance event={attending} onClose={() => setAttending(null)} />}

      <Panel title="Tất cả các buổi">
        {events.isLoading ? <LoadingBlock /> : events.error ? (
          <ErrorBlock error={events.error} onRetry={events.refetch} />
        ) : !(events.data || []).length ? (
          <EmptyBlock>Chưa có buổi nào. Bấm "Tạo buổi mới" để bắt đầu.</EmptyBlock>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="pb-2 pr-4 font-medium">Buổi</th>
                  <th className="pb-2 pr-4 font-medium">Thời gian</th>
                  <th className="pb-2 pr-4 font-medium">Chỗ</th>
                  <th className="pb-2 pr-4 font-medium">Trạng thái</th>
                  <th className="pb-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {(KINDS.find((k) => k.value === e.kind) || {}).label || e.kind}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(e.starts_at)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {seatsOf[e.id] || 0}{Number(e.capacity) > 0 ? ` / ${e.capacity}` : ''}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusPill tone={e.status === 'cancelled' ? 'bad' : e.status === 'done' ? 'muted' : 'good'}>
                        {(STATUSES.find((s) => s.value === e.status) || {}).label || e.status}
                      </StatusPill>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setAttending(e)}>
                          <Users className="mr-1 h-3.5 w-3.5" />Điểm danh
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setDraft({ ...e })}>Sửa</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setRemoving(e)} aria-label={`Xoá buổi ${e.title || ''}`} title="Xoá buổi này">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Xoá buổi này?"
        description={removing ? `"${removing.title}" sẽ bị xoá. Danh sách đăng ký vẫn còn trong database nhưng không hiện ở đâu nữa.` : ''}
        confirmLabel="Xoá"
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}
