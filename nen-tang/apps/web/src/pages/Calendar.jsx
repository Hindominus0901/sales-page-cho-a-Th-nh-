/**
 * Lich & su kien cho hoc vien.
 *
 * Duong vao phong hop (join_url) va ban ghi lai KHONG do trang nay quyet dinh
 * an hay hien - may chu chi tra ve chung cho nguoi da dang ky (xem gatedFields
 * cua CalendarEvent). O day chi hien thi lai thu may chu da cho.
 */
import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon, Clock, MapPin, Users, Video, Loader2, Check, Lock,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ErrorBlock } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { theoGioThuongHieu } from "@/lib/format";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

const KIND_LABEL = {
  live: "Buổi live",
  workshop: "Workshop",
  qna: "Hỏi đáp",
  offline: "Gặp mặt trực tiếp",
};

/** "Thứ 5, 12/09 · 20:00" - doc nhanh hon mot dau thoi gian ISO. */
function whenText(iso) {
  if (!iso) return "—";
  // Doc bang getUTC* TREN moc da doi sang gio thuong hieu, chu khong dung
  // getDay()/getHours() - hai ham do tra ve gio cua may dang mo trang, nen mot
  // buoi 9:00 gio Viet Nam hien thanh 12:00 tren may dat mui gio Sydney.
  const d = theoGioThuongHieu(iso);
  if (!d) return "—";
  const thu = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][d.getUTCDay()];
  const hai = (n) => String(n).padStart(2, "0");
  return `${thu}, ${hai(d.getUTCDate())}/${hai(d.getUTCMonth() + 1)} · ${hai(d.getUTCHours())}:${hai(d.getUTCMinutes())}`;
}

function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms < 0) return null;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `còn ${days} ngày`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `còn ${hours} giờ`;
  return `còn ${Math.max(1, Math.floor(ms / 60000))} phút`;
}

/**
 * Buoi nay da KET THUC chua?
 *
 * Truoc day cho la "da qua" ngay khi den GIO BAT DAU - va do la mot loi nang:
 * cua diem danh mo tu 9:00 den 9:15, tuc la dung luc buoi vua bi xep vao "Da
 * qua". Nguoi vao lop dung gio thi thay "Buoi nay da ket thuc", mat nut "Vao
 * phong", mat ca nut giu cho - trong khi buoi dang dien ra.
 *
 * Co gio ket thuc thi lay gio ket thuc. Khong co thi cho ba tieng ke tu luc bat
 * dau: dai hon moi buoi live, va van tu chuyen sang "da qua" trong ngay.
 */
const BA_TIENG = 3 * 60 * 60 * 1000;
function daKetThuc(event, mocThoiGian = Date.now()) {
  // Buoi da huy van gia di theo thoi gian nhu moi buoi khac: neu khong, no nam
  // mai o "Sap dien ra" va lam ban danh sach cua nhung buoi that su sap toi.
  if (event.status === 'done') return true;
  const ket = event.ends_at ? new Date(event.ends_at).getTime() : null;
  const batDau = new Date(event.starts_at).getTime();
  const hetLuc = Number.isFinite(ket) && ket ? ket : batDau + BA_TIENG;
  return mocThoiGian > hetLuc;
}

function EventCard({ event, signup, seats, onJoin, onLeave, onCheckIn, busy, nowMs }) {
  const joined = signup && signup.status !== "cancelled";
  const attended = signup?.status === "attended";
  const past = daKetThuc(event);
  const cancelled = event.status === "cancelled";
  const full = Number(event.capacity) > 0 && seats >= Number(event.capacity) && !joined;

  // Khung gio diem danh, tinh bang phut so voi gio bat dau (mac dinh 0..15 =
  // "9:00-9:15, sau 9:15 khoa"). May chu moi la noi quyet dinh - o day chi de
  // biet luc nao hien nut va hien chu gi, khong phai de chan.
  const batDau = new Date(event.starts_at).getTime();
  const moLuc = batDau + Number(event.checkin_open_min ?? 0) * 60000;
  const dongLuc = batDau + Number(event.checkin_close_min ?? 15) * 60000;
  const dangMo = nowMs >= moLuc && nowMs <= dongLuc;
  const sapMo = nowMs < moLuc && moLuc - nowMs <= 60 * 60000;   // trong 1 tieng toi
  const daKhoa = nowMs > dongLuc;
  const phutNua = Math.max(1, Math.ceil((moLuc - nowMs) / 60000));

  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card p-4 sm:p-5",
      cancelled && "opacity-60",
    )}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
          {KIND_LABEL[event.kind] || "Sự kiện"}
        </span>
        {cancelled && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">Đã huỷ</span>}
        {attended && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600">
            <Check className="mr-1 inline h-3 w-3" />Đã điểm danh
          </span>
        )}
        {!past && !cancelled && countdown(event.starts_at) && (
          <span className="text-muted-foreground">{countdown(event.starts_at)}</span>
        )}
      </div>

      <h3 className="mt-2.5 text-base font-bold">{event.title}</h3>
      {event.description && (
        <p className="mt-1.5 text-sm text-muted-foreground">{event.description}</p>
      )}

      <div className="mt-3 grid gap-1.5 text-[13px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0" />{whenText(event.starts_at)}
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />{event.location}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {Number(event.capacity) > 0
            ? `${seats}/${event.capacity} chỗ`
            : `${seats} người đã đăng ký`}
        </div>
      </div>

      {/* Diem danh: chi hien khi da giu cho va buoi chua bi huy. Hien ca luc
          chua mo de nguoi ta biet ma canh gio, thay vi den 9:16 moi phat hien
          ra la co viec phai lam. */}
      {joined && !cancelled && !attended && (sapMo || dangMo || (daKhoa && nowMs - dongLuc < 12 * 3600000)) && (
        <div className={cn(
          "mt-3.5 flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-3",
          dangMo ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/50",
        )}>
          {dangMo ? (
            <>
              <Button
                size="sm"
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                disabled={busy}
                onClick={onCheckIn}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1.5 h-4 w-4" />Điểm danh</>}
              </Button>
              <span className="text-[13px] font-semibold text-emerald-700">
                Còn {Math.max(1, Math.ceil((dongLuc - nowMs) / 60000))} phút
              </span>
            </>
          ) : daKhoa ? (
            <span className="text-[13px] text-muted-foreground">
              Điểm danh đã khoá. Vào muộn thì buổi này không tính điểm chuyên cần.
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">
              Điểm danh mở sau <b className="text-foreground">{phutNua} phút</b> nữa, và chỉ mở trong{" "}
              {Number(event.checkin_close_min ?? 15)} phút.
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {/* May chu chi gui join_url cho nguoi da dang ky. Khong co nghia la chua
            duoc mo, chu khong phai "quen dien link". */}
        {joined && event.join_url && !past && (
          <Button asChild size="sm" className="rounded-full">
            <a href={event.join_url} target="_blank" rel="noopener noreferrer">
              <Video className="mr-1.5 h-4 w-4" />Vào phòng
            </a>
          </Button>
        )}
        {event.recording_url && (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <a href={event.recording_url} target="_blank" rel="noopener noreferrer">
              Xem lại
            </a>
          </Button>
        )}
        {past && !event.recording_url && joined && (
          <span className="text-[13px] text-muted-foreground">Buổi này đã kết thúc.</span>
        )}

        {!past && !cancelled && (joined ? (
          <Button size="sm" variant="ghost" className="rounded-full" onClick={onLeave} disabled={busy || attended}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bỏ chỗ"}
          </Button>
        ) : (
          <Button size="sm" className="rounded-full" onClick={onJoin} disabled={busy || full}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" />
              : full ? <><Lock className="mr-1.5 h-4 w-4" />Hết chỗ</>
                : "Giữ chỗ"}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function Calendar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("upcoming");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => base44.auth.me() });

  const lich = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => base44.entities.CalendarEvent.filter({ is_active: true }, "starts_at", 200),
  });
  const { data: events = [], isLoading } = lich;

  // Doc HET dang ky (khong loc theo minh) de dem so cho da co. Chinh sach cua
  // EventSignup chi tra ve field cong khai cho nguoi khac, khong lo gi.
  const { data: signups = [] } = useQuery({
    queryKey: ["event-signups"],
    queryFn: () => base44.entities.EventSignup.list("-created_date", 2000),
  });

  const seatsOf = useMemo(() => {
    const map = {};
    for (const s of signups) {
      if (s.status === "cancelled") continue;
      map[s.event_id] = (map[s.event_id] || 0) + 1;
    }
    return map;
  }, [signups]);

  const mineOf = useMemo(() => {
    const map = {};
    for (const s of signups) if (s.user_id === me?.id) map[s.event_id] = s;
    return map;
  }, [signups, me?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["event-signups"] });
    qc.invalidateQueries({ queryKey: ["calendar-events"] });
  };

  const join = useMutation({
    mutationFn: (id) => base44.functions.invoke("joinEvent", { event_id: id }),
    onSuccess: (res) => {
      refresh();
      toast({ title: res?.joined ? "Đã giữ chỗ" : "Bạn đã đăng ký buổi này rồi" });
    },
    onError: (err) => toast({ variant: "destructive", title: "Không giữ được chỗ", description: err.message }),
    onSettled: () => setBusyId(null),
  });

  const diemDanh = useMutation({
    mutationFn: (id) => base44.functions.invoke("diemDanh", { event_id: id }),
    onSuccess: (res) => {
      const d = res?.data || res;
      refresh();
      toast({
        title: d?.da_diem_danh ? "Bạn đã điểm danh rồi" : "Điểm danh thành công",
        description: d?.awarded?.xp ? `+${d.awarded.xp} XP · +${d.awarded.coin} xu` : undefined,
      });
    },
    onError: (err) => toast({ variant: "destructive", title: "Chưa điểm danh được", description: err.message }),
    onSettled: () => setBusyId(null),
  });

  const leave = useMutation({
    mutationFn: (id) => base44.functions.invoke("leaveEvent", { event_id: id }),
    onSuccess: () => { refresh(); toast({ title: "Đã bỏ chỗ" }); },
    onError: (err) => toast({ variant: "destructive", title: "Không bỏ được chỗ", description: err.message }),
    onSettled: () => setBusyId(null),
  });

  // Nhip 20 giay de dong ho dem nguoc va nut diem danh tu doi trang thai -
  // khong co no thi den gio nguoi dung phai tai lai trang moi thay nut hien ra.
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  const now = nowMs;
  // "Sap dien ra" gom ca buoi DANG dien ra: do moi la luc nguoi ta can nut vao
  // phong va nut diem danh nhat.
  const upcoming = events.filter((e) => !daKetThuc(e, now));
  const past = events.filter((e) => daKetThuc(e, now))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="space-y-5">
      <PageHeader title="Lịch & sự kiện" subtitle="Buổi live, workshop và hỏi đáp của cộng đồng." />

      <div className="flex gap-2">
        {[["upcoming", `Sắp diễn ra (${upcoming.length})`], ["past", `Đã qua (${past.length})`]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold transition",
              tab === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loi tai trang phai KHAC trang thai rong - xem QueryState.jsx. */}
      {lich.isError ? (
        <ErrorBlock error={lich.error} onRetry={lich.refetch} />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !shown.length ? (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <CalendarIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {tab === "upcoming" ? "Chưa có buổi nào sắp tới. Quay lại sau nhé." : "Chưa có buổi nào đã qua."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              signup={mineOf[e.id]}
              seats={seatsOf[e.id] || 0}
              busy={busyId === e.id}
              onJoin={() => { setBusyId(e.id); join.mutate(e.id); }}
              onLeave={() => { setBusyId(e.id); leave.mutate(e.id); }}
              onCheckIn={() => { setBusyId(e.id); diemDanh.mutate(e.id); }}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
