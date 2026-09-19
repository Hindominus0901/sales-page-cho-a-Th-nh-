/**
 * Quan ly Challenge: tao/sua/xoa challenge, va sua nhiem vu tung ngay cua
 * challenge dang chon.
 *
 * Nhiem vu ngay nam o bang rieng (ChallengeDayTask) nen phai chon challenge
 * truoc roi moi sua duoc ngay - giong dung luong cua ban thiet ke.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import ONhapVideo from '@/components/ONhapVideo';
import ONhapAnh from '@/components/ONhapAnh';
import {
  CellInput, CellSelect, ConfirmDialog, EmptyBlock, LoadingBlock, PageHeader, Panel, QueryState,
  StatusPill, errText, fmtDate, fmtNumber,
} from './_shared';

const EMPTY_CHALLENGE = {
  name: '', description: '', start_date: '', end_date: '', duration_days: 21,
  reward_xp: 0, reward_coin: 0, hero_video_url: '', banner_url: '', reward_badge_id: '', rules: '',
  requires_unlock: false, is_active: true,
};

/** "Dang dien ra / Sap dien ra / Da ket thuc" suy ra tu ngay, khong luu cot rieng. */
function challengeState(c) {
  const now = Date.now();
  const start = c.start_date ? new Date(c.start_date).getTime() : null;
  const end = c.end_date ? new Date(c.end_date).getTime() : null;
  if (c.is_active === false) return { label: 'Đang tắt', tone: 'muted' };
  if (start && now < start) return { label: 'Sắp diễn ra', tone: 'warn' };
  if (end && now > end) return { label: 'Đã kết thúc', tone: 'muted' };
  return { label: 'Đang diễn ra', tone: 'good' };
}

export default function AdminChallenges() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState(null);
  const [editing, setEditing] = React.useState(null);      // object dang sua, null = dong
  const [deleting, setDeleting] = React.useState(null);
  const [deletingTask, setDeletingTask] = React.useState(null);

  const challenges = useQuery({
    queryKey: ['admin', 'challenges'],
    queryFn: () => base44.entities.Challenge.list('-created_date', 100),
  });

  const list = challenges.data || [];
  const selected = list.find((c) => c.id === selectedId) || list[0] || null;

  const tasks = useQuery({
    queryKey: ['admin', 'dayTasks', selected?.id],
    queryFn: () => base44.entities.ChallengeDayTask.filter({ challenge_id: selected.id }, 'day', 200),
    enabled: !!selected,
  });

  const invalidateChallenges = () => qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
  const invalidateTasks = () => qc.invalidateQueries({ queryKey: ['admin', 'dayTasks'] });

  const saveChallenge = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.Challenge.update(id, data)
      : base44.entities.Challenge.create(data)),
    onSuccess: (res, vars) => {
      toast({ title: vars.id ? 'Đã lưu challenge' : 'Đã tạo challenge mới' });
      if (!vars.id && res?.id) setSelectedId(res.id);
      setEditing(null);
      invalidateChallenges();
    },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const removeChallenge = useMutation({
    mutationFn: (id) => base44.entities.Challenge.delete(id),
    onSuccess: () => {
      toast({ title: 'Đã xoá challenge' });
      setDeleting(null);
      setSelectedId(null);
      invalidateChallenges();
    },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  // Buoi live de gan vao tung ngay. Co gan thi the ngay ben phia hoc vien moi
  // hien nut diem danh - va diem danh o do voi o trang Lich la MOT ban ghi.
  const events = useQuery({
    queryKey: ['admin', 'calendar-events', 'chon'],
    queryFn: () => base44.entities.CalendarEvent.list('-starts_at', 100),
  });

  const saveTask = useMutation({
    mutationFn: ({ id, data }) => (id
      ? base44.entities.ChallengeDayTask.update(id, data)
      : base44.entities.ChallengeDayTask.create(data)),
    onSuccess: () => { toast({ title: 'Đã lưu nhiệm vụ' }); invalidateTasks(); },
    onError: (err) => toast({ title: 'Không lưu được', description: errText(err), variant: 'destructive' }),
  });

  const removeTask = useMutation({
    mutationFn: (id) => base44.entities.ChallengeDayTask.delete(id),
    onSuccess: () => { toast({ title: 'Đã xoá ngày' }); setDeletingTask(null); invalidateTasks(); },
    onError: (err) => toast({ title: 'Không xoá được', description: errText(err), variant: 'destructive' }),
  });

  const taskList = tasks.data || [];
  const nextDay = taskList.length ? Math.max(...taskList.map((t) => t.day || 0)) + 1 : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quản lý Challenge"
        description="Tạo challenge, đặt phần thưởng, và soạn nhiệm vụ cùng tài liệu cho từng ngày."
      >
        <Button className="rounded-full" onClick={() => setEditing({ ...EMPTY_CHALLENGE })}>
          <Plus className="mr-1 h-4 w-4" /> Tạo Challenge mới
        </Button>
      </PageHeader>

      <Panel title={`${fmtNumber(list.length)} challenge`}>
        <QueryState query={challenges} empty={list.length === 0} emptyText="Chưa có challenge nào. Bấm “Tạo Challenge mới” để bắt đầu.">
          <div className="space-y-2">
            {list.map((c) => {
              const state = challengeState(c);
              const active = selected?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-2xl border p-4',
                    active ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30',
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(c.start_date)} – {fmtDate(c.end_date)}
                      {c.duration_days ? ` · ${c.duration_days} ngày` : ''}
                      {c.requires_unlock ? ' · cần mở khoá' : ''}
                    </div>
                  </button>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-primary">+{fmtNumber(c.reward_xp)} XP</div>
                    <div className="text-[10px] text-muted-foreground">Phần thưởng</div>
                  </div>
                  <StatusPill tone={state.tone}>{state.label}</StatusPill>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(c)}>
                      Sửa
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="rounded-full text-destructive"
                      onClick={() => setDeleting(c)}
                      aria-label="Xoá challenge"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </QueryState>
      </Panel>

      {selected && (
        <Panel
          title={`Nhiệm vụ & video hướng dẫn theo ngày · ${selected.name}`}
          description="Mỗi ngày là một nhiệm vụ học viên phải nộp. Sửa xong nhớ bấm Lưu ở từng ngày."
          action={(
            <Button
              variant="outline"
              className="rounded-full"
              disabled={saveTask.isPending}
              onClick={() => saveTask.mutate({
                data: {
                  challenge_id: selected.id, day: nextDay, title: 'Nhiệm vụ mới',
                  guide: '', video_title: '', video_url: '', assignment_url: '', doc_url: '',
                  xp: 0, coin: 0, event_id: '',
                },
              })}
            >
              <Plus className="mr-1 h-4 w-4" /> Thêm ngày
            </Button>
          )}
        >
          {tasks.isLoading ? (
            <LoadingBlock />
          ) : taskList.length === 0 ? (
            <EmptyBlock>Challenge này chưa có nhiệm vụ ngày nào.</EmptyBlock>
          ) : (
            <div className="space-y-3">
              {taskList.map((t) => (
                <DayTaskRow
                  key={`${t.id}-${t.updated_date}`}
                  task={t}
                  events={events.data || []}
                  pending={saveTask.isPending}
                  onSave={(data) => saveTask.mutate({ id: t.id, data })}
                  onDelete={() => setDeletingTask(t)}
                />
              ))}
            </div>
          )}
        </Panel>
      )}

      <ChallengeDialog
        value={editing}
        onClose={() => setEditing(null)}
        pending={saveChallenge.isPending}
        onSubmit={(data) => saveChallenge.mutate({ id: editing?.id, data })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Xoá challenge “${deleting?.name || ''}”?`}
        description="Xoá vĩnh viễn challenge này. Nhiệm vụ theo ngày, tiến độ và bài nộp của học viên trong challenge sẽ không còn chỗ để hiển thị. Không hoàn tác được."
        confirmLabel="Xoá challenge"
        pending={removeChallenge.isPending}
        onConfirm={() => removeChallenge.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={!!deletingTask}
        onOpenChange={(v) => !v && setDeletingTask(null)}
        title={`Xoá nhiệm vụ ngày ${deletingTask?.day || ''}?`}
        description="Học viên sẽ không còn thấy nhiệm vụ và tài liệu của ngày này nữa. Không hoàn tác được."
        confirmLabel="Xoá ngày"
        pending={removeTask.isPending}
        onConfirm={() => removeTask.mutate(deletingTask.id)}
      />
    </div>
  );
}

/** Mot ngay = mot form nho, giu ban nhap rieng de khong ghi de khi dang go. */
function DayTaskRow({ task, events = [], onSave, onDelete, pending }) {
  const [draft, setDraft] = React.useState(task);
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-extrabold text-primary">
          D{task.day}
        </span>
        <CellInput
          value={draft.title || ''}
          onChange={set('title')}
          placeholder="Tên nhiệm vụ"
          className="min-w-[220px] flex-1 font-semibold"
        />
        <CellInput
          type="number"
          value={draft.day ?? ''}
          onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}
          className="w-20"
          placeholder="Ngày"
        />
        <Button
          size="sm"
          className="rounded-full"
          disabled={pending}
          onClick={() => onSave({
            day: Number(draft.day) || task.day,
            title: draft.title || '',
            guide: draft.guide || '',
            video_title: draft.video_title || '',
            video_url: draft.video_url || '',
            assignment_url: draft.assignment_url || '',
            doc_url: draft.doc_url || '',
            xp: Number(draft.xp) || 0,
            coin: Number(draft.coin) || 0,
            event_id: draft.event_id || '',
          })}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
        </Button>
        <Button size="icon" variant="outline" className="rounded-full text-destructive" onClick={onDelete} aria-label="Xoá ngày">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Textarea
          value={draft.guide || ''}
          onChange={set('guide')}
          placeholder="Hướng dẫn thực hiện..."
          className="min-h-[76px] rounded-xl text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CellInput value={draft.video_title || ''} onChange={set('video_title')} placeholder="Tên video hướng dẫn" />
          <ONhapVideo
            value={draft.video_url || ''}
            onChange={set('video_url')}
            placeholder="Dán link video, hoặc mã video"
            xemThu={false}
          />
          <CellInput value={draft.assignment_url || ''} onChange={set('assignment_url')} placeholder="Link bài tập" />
          <CellInput value={draft.doc_url || ''} onChange={set('doc_url')} placeholder="Link tài liệu" />
          {/* Hai o nay KHONG con tra ra gi: nop bai da bo cong diem, diem cua
              mot ngay den tu diem danh. Giu cot lai de doi y quay lai chi la
              them lai mot loi goi awardPoints - nhung phai noi ro o day, khong
              thi chi Thanh dat 15 XP roi ngoi doi mot thu khong bao gio toi. */}
          <div className="sm:col-span-2 rounded-xl border border-amber-400/50 bg-amber-500/5 px-3 py-2 text-[12px] leading-relaxed">
            <b>Nộp bài không cộng điểm.</b> Điểm của mỗi ngày đến từ <b>điểm danh</b>
            {' '}(10 XP + 10 xu). Hai ô XP/Xu dưới đây hiện không trả ra gì.
          </div>
          <CellInput
            type="number"
            value={draft.xp ?? 0}
            onChange={(e) => setDraft({ ...draft, xp: e.target.value })}
            placeholder="XP (không dùng)"
          />
          <CellInput
            type="number"
            value={draft.coin ?? 0}
            onChange={(e) => setDraft({ ...draft, coin: e.target.value })}
            placeholder="Xu (không dùng)"
          />
          <CellSelect
            value={draft.event_id || ''}
            onChange={set('event_id')}
            className="sm:col-span-2"
          >
            <option value="">Buổi live để điểm danh — chưa gắn</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {`${e.title} · ${new Date(e.starts_at).toLocaleString('vi-VN', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}`}
              </option>
            ))}
          </CellSelect>
        </div>
      </div>
    </div>
  );
}

function ChallengeDialog({ value, onClose, onSubmit, pending }) {
  const [draft, setDraft] = React.useState(EMPTY_CHALLENGE);

  // Huy hieu trao khi hoan thanh ca thu thach. Truoc day cot nay co trong co so
  // du lieu nhung khong co o nao chon - nen khong thu thach nao trao huy hieu.
  const huyHieu = useQuery({
    queryKey: ['admin', 'badges'],
    queryFn: () => base44.entities.Badge.list('sort_order', 100),
  });

  React.useEffect(() => { if (value) setDraft({ ...EMPTY_CHALLENGE, ...value }); }, [value]);

  if (!value) return null;
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value.id ? 'Sửa challenge' : 'Tạo challenge mới'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Tên challenge">
            <Input value={draft.name} onChange={set('name')} className="rounded-xl" placeholder="VD: 21 Ngày Xây Hệ Thống AI" />
          </Field>
          <Field label="Mô tả">
            <Textarea value={draft.description || ''} onChange={set('description')} className="min-h-[70px] rounded-xl" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày bắt đầu">
              <Input type="date" value={(draft.start_date || '').slice(0, 10)} onChange={set('start_date')} className="rounded-xl" />
            </Field>
            <Field label="Ngày kết thúc">
              <Input type="date" value={(draft.end_date || '').slice(0, 10)} onChange={set('end_date')} className="rounded-xl" />
            </Field>
            <Field label="Số ngày">
              <Input type="number" value={draft.duration_days ?? 0} onChange={set('duration_days')} className="rounded-xl" />
            </Field>
            <Field label="Ảnh bìa thử thách">
              {/* Truoc day o nay la mot o chu tran: khong nut tai len, nen
                  nguoi van hanh co mot tam anh trong may thi khong co duong
                  nao dua no len. Gio co ca hai duong - xem ONhapAnh.jsx. */}
              <ONhapAnh
                nhan="Ảnh bìa"
                value={draft.banner_url}
                onChange={(v) => setDraft((d) => ({ ...d, banner_url: v }))}
              />
            </Field>
            <Field label="Link video giới thiệu">
              {/* ONhapVideo tu bao khi link sai, khi ma tran dang bi doan nha
                  cung cap, va khi gap link .../s/... cua Wistia - dung luc
                  nguoi ta vua dan, thay vi mot doan chu co dinh doc truoc do
                  chua thay lien quan gi. */}
              <ONhapVideo
                value={draft.hero_video_url || ''}
                onChange={set('hero_video_url')}
                placeholder="Dán link video giới thiệu, hoặc mã video"
              />
            </Field>
            <Field label="Huy hiệu trao khi hoàn thành">
              <select
                value={draft.reward_badge_id || ''}
                onChange={set('reward_badge_id')}
                className="h-9 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Không trao huy hiệu</option>
                {(huyHieu.data || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.icon} {b.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Thưởng XP khi hoàn thành">
              <Input type="number" value={draft.reward_xp ?? 0} onChange={set('reward_xp')} className="rounded-xl" />
            </Field>
            <Field label="Thưởng xu khi hoàn thành">
              <Input type="number" value={draft.reward_coin ?? 0} onChange={set('reward_coin')} className="rounded-xl" />
            </Field>
          </div>
          <Field label="Thể lệ">
            <Textarea value={draft.rules || ''} onChange={set('rules')} className="min-h-[70px] rounded-xl" />
          </Field>

          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm font-semibold">Đang mở cho học viên</span>
            <Switch checked={draft.is_active !== false} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm font-semibold">Phải được admin mở khoá mới vào được</span>
            <Switch checked={!!draft.requires_unlock} onCheckedChange={(v) => setDraft({ ...draft, requires_unlock: v })} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Huỷ bỏ</Button>
          <Button
            className="rounded-full"
            disabled={pending || !draft.name.trim()}
            onClick={() => onSubmit({
              name: draft.name.trim(),
              description: draft.description || '',
              start_date: draft.start_date || '',
              end_date: draft.end_date || '',
              duration_days: Number(draft.duration_days) || 0,
              reward_xp: Number(draft.reward_xp) || 0,
              reward_coin: Number(draft.reward_coin) || 0,
              hero_video_url: draft.hero_video_url || '',
              banner_url: (draft.banner_url || '').trim(),
              reward_badge_id: draft.reward_badge_id || '',
              rules: draft.rules || '',
              requires_unlock: !!draft.requires_unlock,
              is_active: draft.is_active !== false,
            })}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
