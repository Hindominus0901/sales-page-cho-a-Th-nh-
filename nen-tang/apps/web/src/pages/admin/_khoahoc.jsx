/**
 * Bo dung khoa hoc dung chung cho hai trang quan tri: "Khoa hoc & Lop hoc" va
 * "Khu vuc VIP".
 *
 * VI SAO TACH RA: chi Thanh muon them noi dung VIP ngay trong tab VIP, chu
 * khong phai nhay sang tab Khoa hoc roi nho bat mot cong tac. Hai trang can y
 * het bo dung khoa/bai giang, nen chep doi la chac chan co ngay mot ben sua ma
 * ben kia quen - va nguoi dung se gap hai giao dien khac nhau cho cung mot viec.
 *
 * Luu y khac ban thiet ke: bai giang KHONG luu mot duong dan video, ma luu nha
 * cung cap (youtube/vimeo...) va ma video rieng - de doi ben phat video sau nay
 * khong phai sua tung dong du lieu.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { nhanDangVideo, videoEmbedUrl, NHA_CUNG_CAP } from '@/lib/video';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  CellInput, CellSelect, ConfirmDialog, EmptyBlock, LoadingBlock, Panel,
  StatusPill, errText, fmtNumber, loiLink,
} from './_shared';

export const EMPTY_COURSE = {
  name: '', description: '', thumbnail_url: '', min_level: 0,
  requires_unlock: false, is_active: true, sort_order: 0,
  recording_url: '', doc_url: '',
};

// Chi liet ke nhung noi ma lib/video.js dung duoc link nhung. Truoc day o day
// co 'drive' va 'other' nhung khong cho nao dung duoc chung -> chon vao la bai
// hoc khong phat duoc, ma nguoi nhap khong he biet.
//
// Danh sach GIA TRI lay tu NHA_CUNG_CAP trong lib/video.js chu khong go lai o
// day - day la hop dong ngam giua dropdown nay va ham ghep link nhung, hai ben
// phai biet cung mot bo. O day chi con giu TEN HIEN THI cho nguoi doc.
const TEN_HIEN = {
  wistia: 'Wistia', youtube: 'YouTube', vimeo: 'Vimeo', stream: 'Cloudflare Stream',
};
export const VIDEO_PROVIDERS = NHA_CUNG_CAP.map((value) => ({ value, label: TEN_HIEN[value] || value }));

/** Doc danh sach id khoa hoc trong `grants_json` cua mot san pham. */
export function idKhoaTrongGoi(sanPham) {
  let v = sanPham?.grants_json;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return (Array.isArray(v) ? v : [])
    .filter((g) => g?.kind === 'course' && g?.ref).map((g) => g.ref);
}

export function CourseCard({ course, open, onToggle, onEdit, onDelete, huyHieu }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deletingLesson, setDeletingLesson] = React.useState(null);

  const lessons = useQuery({
    queryKey: ['admin', 'lessons', course.id],
    queryFn: () => base44.entities.Lesson.filter({ course_id: course.id }, 'sort_order', 200),
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'lessons', course.id] });

  const saveLesson = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.Lesson.update(id, data)
      : base44.entities.Lesson.create(data)),
    onSuccess: () => { toast({ title: 'Đã lưu bài giảng' }); invalidate(); },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const removeLesson = useMutation({
    mutationFn: (id) => base44.entities.Lesson.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá bài giảng' }); setDeletingLesson(null); invalidate(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const list = lessons.data || [];
  const nextOrder = list.length ? Math.max(...list.map((l) => l.sort_order || 0)) + 1 : 1;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{course.name}</div>
            <div className="text-xs text-muted-foreground">
              {open ? `${fmtNumber(list.length)} bài giảng` : 'Bấm để xem bài giảng'}
              {course.min_level ? ` · cần cấp ${course.min_level}` : ''}
              {course.requires_unlock ? ' · cần mở khoá' : ''}
            </div>
          </div>
        </button>
        {huyHieu}
        <StatusPill tone={course.is_active === false ? 'muted' : 'good'}>
          {course.is_active === false ? 'Đang ẩn' : 'Đang mở'}
        </StatusPill>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onEdit}>Sửa</Button>
        <Button size="icon" variant="outline" className="rounded-full text-destructive" onClick={onDelete} aria-label="Xoá khoá học">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          {lessons.isLoading ? (
            <LoadingBlock />
          ) : (
            <>
              {list.length === 0 ? (
                <EmptyBlock>Khoá học này chưa có bài giảng nào.</EmptyBlock>
              ) : (
                <div className="space-y-3">
                  {list.map((l) => (
                    <LessonRow
                      key={`${l.id}-${l.updated_date}`}
                      lesson={l}
                      pending={saveLesson.isPending}
                      onSave={(data) => saveLesson.mutate({ id: l.id, data })}
                      onDelete={() => setDeletingLesson(l)}
                    />
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                className="mt-3 rounded-full"
                disabled={saveLesson.isPending}
                onClick={() => saveLesson.mutate({
                  data: {
                    course_id: course.id, title: 'Bài giảng mới', guide: '',
                    video_provider: 'wistia', video_id: '', duration: '',
                    assignment_url: '', doc_url: '', xp: 0, coin: 0, sort_order: nextOrder,
                  },
                })}
              >
                <Plus className="mr-1 h-4 w-4" /> Thêm bài giảng
              </Button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingLesson}
        onOpenChange={(v) => !v && setDeletingLesson(null)}
        title={`Xoá bài giảng “${deletingLesson?.title || ''}”?`}
        description="Học viên sẽ không còn thấy bài giảng này, và tiến độ đã học của bài cũng mất chỗ hiển thị. Không hoàn tác được."
        confirmLabel="Xoá bài giảng"
        pending={removeLesson.isPending}
        onConfirm={() => removeLesson.mutate(deletingLesson.id)}
      />
    </Panel>
  );
}

export function LessonRow({ lesson, onSave, onDelete, pending }) {
  const [draft, setDraft] = React.useState(lesson);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  /**
   * O video nhan CA LINK LAN MA.
   *
   * Cho nay tung la bay lon nhat cua trang quan tri. O chi ghi "Ma video (khong
   * phai link)" va khong kiem gi ca, nen ai dan link YouTube vao - dong tac tu
   * nhien nhat, vi bam "Chia se" tren YouTube thi duoc mot cai link - se luu
   * thanh cong, khong loi, roi hoc vien mo bai giang ra thay mot o den. Khong
   * mot dau hieu nao chi ve day.
   *
   * Ham boc ma da co san trong lib/video.js tu lau (embedFromUrl), chi la chua
   * ai noi no vao form. Gio noi vao: dan gi cung duoc, tu dien lai dropdown cho
   * dung, va sai thi bao ngay tai cho.
   */
  const doiVideo = (e) => {
    const raw = e.target.value;
    const ra = nhanDangVideo(raw, draft.video_provider);
    if (ra.ok) {
      setDraft({ ...draft, video_id: ra.id, video_provider: ra.provider });
    } else {
      setDraft({ ...draft, video_id: raw });
    }
  };

  const nhanDang = nhanDangVideo(draft.video_id || '', draft.video_provider);
  const loiVideo = (draft.video_id || '').trim() && !nhanDang.ok ? nhanDang.loi : '';
  const xemThu = nhanDang.ok
    ? videoEmbedUrl({ video_provider: nhanDang.provider, video_id: nhanDang.id })
    : null;

  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CellInput
          type="number"
          value={draft.sort_order ?? 0}
          onChange={set('sort_order')}
          className="w-16"
          aria-label="Thứ tự"
        />
        <CellInput
          value={draft.title || ''}
          onChange={set('title')}
          placeholder="Tên bài giảng"
          className="min-w-[220px] flex-1 font-semibold"
        />
        <Button
          size="sm"
          className="rounded-full"
          // Chan luu mot ma video hong. De luu duoc thi bai giang trong danh
          // sach van "co video", chi la khong phat - va loi do chi lo ra khi
          // mot hoc vien mo bai ra xem.
          disabled={pending || !!loiVideo}
          title={loiVideo || undefined}
          onClick={() => onSave({
            title: draft.title || '',
            guide: draft.guide || '',
            video_provider: draft.video_provider || 'wistia',
            video_id: draft.video_id || '',
            duration: draft.duration || '',
            assignment_url: draft.assignment_url || '',
            doc_url: draft.doc_url || '',
            xp: Number(draft.xp) || 0,
            coin: Number(draft.coin) || 0,
            sort_order: Number(draft.sort_order) || 0,
          })}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
        </Button>
        <Button size="icon" variant="outline" className="rounded-full text-destructive" onClick={onDelete} aria-label="Xoá bài giảng">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Textarea
          value={draft.guide || ''}
          onChange={set('guide')}
          placeholder="Hướng dẫn cho học viên..."
          className="min-h-[76px] rounded-xl text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CellSelect value={draft.video_provider || 'wistia'} onChange={set('video_provider')}>
            {VIDEO_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </CellSelect>
          <div className="space-y-1">
            <CellInput
              value={draft.video_id || ''}
              onChange={doiVideo}
              placeholder="Dán link video hoặc mã video"
              aria-label="Link hoặc mã video"
              className={loiVideo ? 'border-destructive' : undefined}
            />
            {loiVideo && <p className="text-[11.5px] leading-snug text-destructive">{loiVideo}</p>}
          </div>
          <CellInput value={draft.duration || ''} onChange={set('duration')} placeholder="Thời lượng, VD 12:40" />
          <CellInput value={draft.assignment_url || ''} onChange={set('assignment_url')} placeholder="Link bài tập" />
          <CellInput value={draft.doc_url || ''} onChange={set('doc_url')} placeholder="Link tài liệu" />
          <div className="grid grid-cols-2 gap-2">
            <CellInput type="number" value={draft.xp ?? 0} onChange={set('xp')} placeholder="XP" />
            <CellInput type="number" value={draft.coin ?? 0} onChange={set('coin')} placeholder="Xu" />
          </div>
        </div>
      </div>

      {/* XEM THU NGAY TAI DAY.
          Mot ma video dung cu phap van co the tro toi mot video da xoa, dat che
          do rieng tu, hoac chan nhung. Khong cach nao biet duoc tu phia trinh
          duyet ngoai viec phat thu. Chi Thanh nhin thay no chay o day thi biet
          chac hoc vien cung se thay no chay. */}
      {xemThu && (
        <div className="mt-2.5">
          <p className="mb-1 text-[11.5px] font-semibold text-muted-foreground">
            Xem thử — {VIDEO_PROVIDERS.find((p) => p.value === nhanDang.provider)?.label || nhanDang.provider}
            {' · mã '}<code>{nhanDang.id}</code>
          </p>
          <iframe
            key={xemThu}
            src={xemThu}
            title="Xem thử video bài giảng"
            className="aspect-video w-full max-w-md rounded-xl border border-border bg-black"
            allow="fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

/**
 * @param {boolean} anCongTacVip  An cong tac "Chi danh cho VIP". Trang VIP dat
 *   co nay: o do moi khoa deu la VIP roi, hien them mot cong tac tu tat chinh
 *   minh chi lam nguoi dung phan van.
 */
const cnLink = (v) => ['rounded-xl', loiLink(v) && 'border-destructive'].filter(Boolean).join(' ');

export function CourseDialog({
  value, onClose, onSubmit, pending, laVipBanDau = false, anCongTacVip = false,
}) {
  const [draft, setDraft] = React.useState(EMPTY_COURSE);
  const [laVip, setLaVip] = React.useState(false);

  React.useEffect(() => { if (value) setDraft({ ...EMPTY_COURSE, ...value }); }, [value]);
  React.useEffect(() => { setLaVip(!!laVipBanDau); }, [laVipBanDau, value]);

  if (!value) return null;
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value.id ? 'Sửa khoá học' : 'Tạo khoá học'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tên khoá học</Label>
            <Input value={draft.name} onChange={set('name')} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mô tả</Label>
            <Textarea value={draft.description || ''} onChange={set('description')} className="min-h-[70px] rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ảnh bìa (URL)</Label>
              <Input value={draft.thumbnail_url || ''} onChange={set('thumbnail_url')} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cấp bậc tối thiểu</Label>
              <Input type="number" value={draft.min_level ?? 0} onChange={set('min_level')} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Thứ tự hiển thị</Label>
              <Input type="number" value={draft.sort_order ?? 0} onChange={set('sort_order')} className="rounded-xl" />
            </div>
          </div>

          {/* Ban ghi buoi hoc va tai lieu cua CA KHOA.
              Ban ghi Zoom khong vua khuon video cua bai giang (nha cung cap +
              ma video), nen truoc day khong co cho nao dan no vao.
              May chu CHE hai link nay voi nguoi chua mo khoa - xem gatedFields
              cua Course. */}
          <div className="space-y-1.5">
            <Label className="text-xs">Link bản ghi buổi học</Label>
            <Input
              value={draft.recording_url || ''}
              onChange={set('recording_url')}
              placeholder="https://... (Zoom, Drive, YouTube không công khai)"
              className={cnLink(draft.recording_url)}
            />
            {loiLink(draft.recording_url) && (
              <span className="text-[11px] font-semibold text-destructive">
                {loiLink(draft.recording_url)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link tài liệu</Label>
            <Input
              value={draft.doc_url || ''}
              onChange={set('doc_url')}
              placeholder="https://...notion.site/... hoặc Drive"
              className={cnLink(draft.doc_url)}
            />
            {loiLink(draft.doc_url) && (
              <span className="text-[11px] font-semibold text-destructive">
                {loiLink(draft.doc_url)}
              </span>
            )}
          </div>
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed">
            Hai link này chỉ người đã mở khoá mới thấy — máy chủ cắt sẵn, không
            phải chỉ ẩn nút.
          </p>

          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm font-semibold">Đang mở cho học viên</span>
            <Switch checked={draft.is_active !== false} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm font-semibold">Phải được admin mở khoá mới học được</span>
            <Switch checked={!!draft.requires_unlock} onCheckedChange={(v) => setDraft({ ...draft, requires_unlock: v })} />
          </label>

          {/* Bat VIP la lam HAI viec cung luc, va phai cung luc:
              - gan khoa nay vao goi VIP (grants_json) -> nguoi mua VIP duoc mo
              - bat requires_unlock -> may chu che video voi nguoi chua mua
              Thieu ve dau cung hong: chi gan ma khong khoa thi ai cung xem duoc;
              chi khoa ma khong gan thi nguoi da tra tien cung khong xem duoc. */}
          {!anCongTacVip && (
            <label className="flex items-start justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-500/5 p-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Chỉ dành cho VIP</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                  Hiện ở tab “Khu vực VIP”, và chỉ người đã mua gói VIP mới xem được video.
                </span>
              </span>
              <Switch
                checked={laVip}
                onCheckedChange={(v) => {
                  setLaVip(v);
                  if (v) setDraft((d) => ({ ...d, requires_unlock: true }));
                }}
              />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Huỷ bỏ</Button>
          <Button
            className="rounded-full"
            disabled={pending || !draft.name.trim()
              || !!loiLink(draft.recording_url) || !!loiLink(draft.doc_url)}
            onClick={() => onSubmit({
              name: draft.name.trim(),
              description: draft.description || '',
              thumbnail_url: draft.thumbnail_url || '',
              recording_url: (draft.recording_url || '').trim(),
              doc_url: (draft.doc_url || '').trim(),
              min_level: Number(draft.min_level) || 0,
              sort_order: Number(draft.sort_order) || 0,
              requires_unlock: !!draft.requires_unlock,
              is_active: draft.is_active !== false,
            }, laVip)}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
