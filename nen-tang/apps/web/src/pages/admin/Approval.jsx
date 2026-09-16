/**
 * Duyet bai: hoat dong hang ngay VA bai nop thu thach.
 *
 * Ban thiet ke chi co hai the "AI da duyet / AI da tu choi" - tuc la mot so
 * nhat ky, admin khong bam gi ca. Nhung AI cham sai la chuyen co that va khi do
 * khong con duong nao sua, nen o day them nut duyet/tu choi tay.
 *
 * Bai nop THU THACH truoc day khong xuat hien o bat ky trang quan tri nao. Nguoi
 * hoc nop xong chi thay dong chu "Dang cho cham bai..." nhap nhay mai mai: duong
 * cham duy nhat la nho AI, ma AI thi can ANTHROPIC_API_KEY - chua dat thi tra
 * 503 va bai nam o 'pending' vinh vien. Gio hai loai bai nam chung mot cho, va
 * ca hai deu cham tay duoc.
 */
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Loader2, Sparkles, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useKhaNang } from '@/lib/useKhaNang';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  InitialAvatar, PageHeader, QueryState, ReasonDialog, StatusPill, errText, timeAgo,
} from './_shared';

/**
 * Nhan cu ghi "AI da duyet / AI da tu choi", nhung bo loc chi loc theo `status` -
 * khong phan biet AI hay nguoi cham. Doi lai cho dung su that.
 */
const TABS = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Đã từ chối' },
];

/** Hai loai bai nop, hai bang du lieu, hai ham cham - nhung cung mot cho lam viec. */
const LOAI = [
  { key: 'activity', label: 'Hoạt động hằng ngày' },
  { key: 'challenge', label: 'Bài thử thách' },
];

/** ai_rubric_json co the ve dang mang da parse hoac chuoi JSON tho. */
function readRubric(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

export default function Approval() {
  const { khaNang } = useKhaNang();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = React.useState('pending');
  const [loai, setLoai] = React.useState('activity');
  const [rejecting, setRejecting] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);

  const activities = useQuery({
    queryKey: ['admin', 'activities', tab],
    queryFn: () => base44.entities.Activity.filter({ status: tab }, '-created_date', 200),
    enabled: loai === 'activity',
  });

  const baiThuThach = useQuery({
    queryKey: ['admin', 'challenge-submissions', tab],
    queryFn: () => base44.entities.ChallengeSubmission.filter({ status: tab }, '-created_date', 200),
    enabled: loai === 'challenge',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'activities'] });
    qc.invalidateQueries({ queryKey: ['admin', 'challenge-submissions'] });
    qc.invalidateQueries({ queryKey: ['admin', 'pendingCount'] });
  };

  const decide = useMutation({
    mutationFn: (payload) => base44.functions.invoke('approveActivity', payload),
    onSuccess: (res) => {
      toast({ title: res?.status === 'approved' ? 'Đã duyệt bài' : 'Đã từ chối bài' });
      setRejecting(null);
      refresh();
    },
    onError: (err) => toast({ title: 'Không xử lý được', description: errText(err), variant: 'destructive' }),
    onSettled: () => setBusyId(null),
  });

  const score = useMutation({
    mutationFn: (id) => base44.functions.invoke('scoreActivity', { activity_id: id }),
    onSuccess: (res) => {
      toast({ title: `AI chấm: ${res?.score ?? '?'}/100`, description: res?.feedback });
      refresh();
    },
    onError: (err) => toast({ title: 'AI chưa chấm được', description: errText(err), variant: 'destructive' }),
    onSettled: () => setBusyId(null),
  });

  const chamThuThach = useMutation({
    mutationFn: (payload) => base44.functions.invoke('reviewChallengeDay', payload),
    onSuccess: (res) => {
      const d = res?.data || res;
      toast({
        title: d?.passed ? 'Đã duyệt bài thử thách' : 'Đã từ chối bài thử thách',
        description: d?.awarded?.xp ? `+${d.awarded.xp} XP · +${d.awarded.coin} xu` : undefined,
      });
      setRejecting(null);
      refresh();
    },
    onError: (err) => toast({ title: 'Không chấm được', description: errText(err), variant: 'destructive' }),
    onSettled: () => setBusyId(null),
  });

  const aiChamThuThach = useMutation({
    mutationFn: (id) => base44.functions.invoke('scoreChallengeDay', { submission_id: id }),
    onSuccess: (res) => {
      const d = res?.data || res;
      toast({ title: `AI chấm: ${d?.score ?? '?'}/100`, description: d?.feedback });
      refresh();
    },
    onError: (err) => toast({ title: 'AI chưa chấm được', description: errText(err), variant: 'destructive' }),
    onSettled: () => setBusyId(null),
  });

  const items = activities.data || [];
  const dsThuThach = baiThuThach.data || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Duyệt bài"
        description="Hoạt động hằng ngày và bài nộp thử thách. Bạn duyệt tay được mọi lúc; nhờ AI chấm là tuỳ chọn thêm."
      />

      <div className="flex flex-wrap gap-2">
        {LOAI.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLoai(l.key)}
            className={cn(
              'rounded-xl border px-4 py-2 text-[13px] font-bold transition-colors',
              loai === l.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full border px-4 py-2 text-[13px] font-bold transition-colors',
              tab === t.key
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loai === 'challenge' && (
        <QueryState
          query={baiThuThach}
          empty={dsThuThach.length === 0}
          emptyText={tab === 'pending' ? 'Không còn bài thử thách nào chờ chấm.' : 'Chưa có bài nào trong mục này.'}
        >
          <div className="space-y-3">
            {dsThuThach.map((b) => (
              <TheBaiThuThach
                key={b.id}
                bai={b}
                busy={busyId === b.id}
                dangCham={chamThuThach.isPending}
                dangNhoAi={aiChamThuThach.isPending}
                onDuyet={() => { setBusyId(b.id); chamThuThach.mutate({ submission_id: b.id, action: 'approve' }); }}
                onTuChoi={() => setRejecting({ ...b, _loai: 'challenge' })}
                onNhoAi={() => { setBusyId(b.id); aiChamThuThach.mutate(b.id); }}
              />
            ))}
          </div>
        </QueryState>
      )}

      {loai === 'activity' && (
      <QueryState
        query={activities}
        empty={items.length === 0}
        emptyText={tab === 'pending' ? 'Không còn bài nào chờ duyệt.' : 'Chưa có bài nào trong mục này.'}
      >
        <div className="space-y-3">
          {items.map((a) => {
            const rubric = readRubric(a.ai_rubric_json);
            const scored = a.ai_score !== null && a.ai_score !== undefined;
            const passed = scored && a.ai_score >= 60;
            const busy = busyId === a.id;

            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <InitialAvatar name={a.user_name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {a.user_name}
                      <span className="font-semibold text-muted-foreground">
                        {' · '}{a.activity_type_name || a.activity_type_key}
                      </span>
                    </div>
                    {a.title && <div className="mt-0.5 text-sm font-semibold">{a.title}</div>}
                    {a.description && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.description}</p>
                    )}
                    {a.screenshot_url && (
                      <div className="mt-2 w-32 overflow-hidden rounded-xl border border-border">
                        <Image src={a.screenshot_url} alt="bài nộp" fittingType="fill" className="h-24 w-full" />
                      </div>
                    )}
                    {a.evidence_link && (
                      <a
                        href={a.evidence_link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Xem bằng chứng
                      </a>
                    )}
                    {/* Hoat dong VAN cong diem (tru nhung muc bi tat trong
                        `st-hoat-dong-khong-cong-diem`), nen giu con so - nhung
                        chi hien khi thuc su co, khong hien "+0 XP". */}
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Nộp {timeAgo(a.created_date)}
                      {a.reviewed_at && ` · duyệt ${timeAgo(a.reviewed_at)}`}
                      {a.status === 'approved' && (a.xp_awarded || a.coin_awarded)
                        ? ` · +${a.xp_awarded || 0} XP · +${a.coin_awarded || 0} xu`
                        : ''}
                    </div>
                    {a.rejection_reason && (
                      <p className="mt-1 text-xs font-semibold text-destructive">
                        Lý do từ chối: {a.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      AI chấm
                    </div>
                    <div className="mt-1">
                      {scored ? (
                        <StatusPill tone={passed ? 'good' : 'bad'}>
                          {passed ? `✓ ĐẠT · ${a.ai_score}` : `✕ CHƯA ĐẠT · ${a.ai_score}`}
                        </StatusPill>
                      ) : (
                        <StatusPill tone="muted">Chưa chấm</StatusPill>
                      )}
                    </div>
                  </div>
                </div>

                {rubric.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {rubric.map((rb, i) => (
                      <span
                        key={`${rb.label}-${i}`}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          rb.pass ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive',
                        )}
                      >
                        {rb.pass ? '✓' : '✕'} {rb.label}
                      </span>
                    ))}
                  </div>
                )}

                {a.ai_feedback && (
                  <p className="mt-2 rounded-xl bg-muted/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {a.ai_feedback}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {a.status === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => {
                          setBusyId(a.id);
                          decide.mutate({ activity_id: a.id, action: 'approve' });
                        }}
                      >
                        {busy && decide.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><Check className="mr-1 h-4 w-4" /> Duyệt</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={busy}
                        onClick={() => setRejecting(a)}
                      >
                        <X className="mr-1 h-4 w-4" /> Từ chối
                      </Button>
                    </>
                  ) : (
                    <StatusPill tone={a.status === 'approved' ? 'good' : 'bad'}>
                      {a.status === 'approved' ? '✓ Đã duyệt' : '✕ Đã từ chối'}
                    </StatusPill>
                  )}

                  {khaNang.ai && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto rounded-full"
                      disabled={busy}
                      onClick={() => { setBusyId(a.id); score.mutate(a.id); }}
                    >
                      {busy && score.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Sparkles className="mr-1 h-4 w-4" /> {scored ? 'AI chấm lại' : 'Nhờ AI chấm'}</>}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </QueryState>
      )}

      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title="Từ chối bài nộp"
        description={`Học viên ${rejecting?.user_name || ''} sẽ nhận được thông báo kèm lý do này và có thể nộp lại.`}
        confirmLabel="Từ chối bài"
        reasonLabel="Lý do từ chối (bắt buộc)"
        placeholder="VD: thiếu phần định giá trong Hero Offer"
        pending={decide.isPending || chamThuThach.isPending}
        onConfirm={(reason) => {
          setBusyId(rejecting.id);
          if (rejecting._loai === 'challenge') {
            chamThuThach.mutate({ submission_id: rejecting.id, action: 'reject', feedback: reason });
          } else {
            decide.mutate({ activity_id: rejecting.id, action: 'reject', rejection_reason: reason });
          }
        }}
      />
    </div>
  );
}


/**
 * Mot bai nop thu thach.
 *
 * Khac the hoat dong o hai diem: khong co anh chung minh (nguoi hoc chi dan
 * duoc link vi kho anh R2 chua bat), va co so ngay - thu tu ngay la thu quan
 * trong nhat khi cham mot chuong trinh 21 ngay.
 */
function TheBaiThuThach({ bai, busy, dangCham, dangNhoAi, onDuyet, onTuChoi, onNhoAi }) {
  const { khaNang } = useKhaNang();
  const daCham = bai.score !== null && bai.score !== undefined;
  const dat = bai.status === 'approved';

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <InitialAvatar name={bai.user_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            {bai.user_name}
            <span className="font-semibold text-muted-foreground">{' · '}Ngày {bai.day}</span>
          </div>
          {bai.content && (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{bai.content}</p>
          )}
          {/* Hai duong dan rieng biet. Truoc day chi hien mot nut "Xem bai lam",
              nen link bai cam nhan tren Facebook khong co duong nao mo ra -
              chi Thanh phai tin la no dung ma khong xem duoc. */}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {bai.link && (
              <a
                href={bai.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Bài tập
              </a>
            )}
            {bai.file_url && (
              <a
                href={bai.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Cảm nhận trên Facebook
              </a>
            )}
          </div>
          {/* Lich su cham: ai cham va cham luc nao. Truoc day the chi ghi luc
              NOP, nen mo tab "Da duyet" ra khong biet bai nao vua cham va bai
              nao cham tu hom kia.
              Da bo phan "+X XP": nop bai khong con cong diem tu 11/09, hien
              mot con so 0 chi lam nguoi doc tuong he thong hong. */}
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Nộp {timeAgo(bai.created_date)}
            {bai.reviewed_at && ` · chấm ${timeAgo(bai.reviewed_at)}`}
            {bai.reviewed_by === 'ai' && ' · bởi AI'}
          </div>
          {bai.feedback && (
            <p className="mt-2 rounded-xl bg-muted/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
              {bai.feedback}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Điểm</div>
          <div className="mt-1">
            {daCham
              ? <StatusPill tone={dat ? 'good' : 'bad'}>{dat ? '✓' : '✕'} {bai.score}/100</StatusPill>
              : <StatusPill tone="muted">Chưa chấm</StatusPill>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {bai.status === 'pending' ? (
          <>
            <Button
              size="sm"
              className="rounded-full bg-emerald-600 hover:bg-emerald-700"
              disabled={busy}
              onClick={onDuyet}
            >
              {busy && dangCham
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Check className="mr-1 h-4 w-4" /> Duyệt</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={onTuChoi}
            >
              <X className="mr-1 h-4 w-4" /> Cần sửa lại
            </Button>
          </>
        ) : (
          <StatusPill tone={dat ? 'good' : 'bad'}>
            {dat ? '✓ Đã duyệt' : '✕ Cần sửa lại'}
          </StatusPill>
        )}

        {bai.status === 'pending' && khaNang.ai && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto rounded-full"
            disabled={busy}
            onClick={onNhoAi}
          >
            {busy && dangNhoAi
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Sparkles className="mr-1 h-4 w-4" /> Nhờ AI chấm</>}
          </Button>
        )}
      </div>
    </div>
  );
}
