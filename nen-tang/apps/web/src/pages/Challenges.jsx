import NutNhanAdmin from '@/components/NutNhanAdmin';
import { ErrorBlock } from "@/components/QueryState";
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, Loader2, Lock, Play, Target, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe, ME_KEY } from "@/lib/useMe";
import CanDangKy from "@/components/CanDangKy";
import ChonNhom from "@/components/ChonNhom";
import { formatNumber, getInitials } from "@/lib/gamification";
import { daysLeft, formatDate, gioThuongHieu, ngayGonVN, ngayThuThach, ngayThuongHieu } from "@/lib/format";
import { embedFromUrl, youtubeThumbFromUrl } from "@/lib/video";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";


const STATUS = {
  approved: { label: "✓ Đã chấm xong", className: "text-emerald-700 bg-emerald-500/10" },
  pending: { label: "Đang chờ chấm bài...", className: "text-amber-700 bg-amber-500/12", pulse: true },
  rejected: { label: "Cần sửa lại", className: "text-destructive bg-destructive/10" },
};

/* ------------------------------------------------------------------ danh sach */

function ChallengeCard({ challenge, participants, locked, joining, onOpen }) {
  const left = daysLeft(challenge.end_date);
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-5 relative", locked && "opacity-80")}>
      {locked && <Lock className="w-4 h-4 absolute top-4 right-4 text-muted-foreground" />}
      <div className="font-bold text-base mb-1.5">{challenge.name}</div>
      {challenge.description && (
        <div className="text-[12.5px] text-muted-foreground mb-3.5 leading-relaxed">{challenge.description}</div>
      )}
      <div className="flex gap-4 text-[11.5px] text-muted-foreground mb-4">
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {participants} người</span>
        {left != null && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {left} ngày còn lại</span>}
      </div>
      {locked ? (
        <NutNhanAdmin full className="block" />
      ) : (
        <Button className="rounded-full w-full" onClick={onOpen} disabled={joining}>
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : "Vào Challenge →"}
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- chi tiet */

// Gio buoi hoc theo mui gio THUONG HIEU, khong theo may dang mo trang - xem
// ghi chu trong lib/format.js. Khung diem danh van tinh tren moc thoi gian
// that, ham nay chi de hien chu.
const gio = (iso) => gioThuongHieu(iso);

/**
 * Khoi diem danh cua mot ngay.
 *
 * Khung gio tinh bang phut so voi gio bat dau cua buoi (mac dinh 0..15 =
 * "9:00-9:15, sau 9:15 khoa"), giong het trang Lich - vi day dung CHUNG mot
 * buoi va chung mot ban ghi co mat. Diem danh o day hay o trang Lich deu duoc,
 * khong bao gio thanh hai lan cong diem.
 *
 * O day hien GIO chu khong dem nguoc tung phut nhu trang Lich: danh sach nay co
 * ca 5 ngay, dem nguoc 5 cai mot luc thi khong con la thong tin nua.
 */
function DiemDanhNgay({ buoi, ngay, nowMs, busy, onCheckIn }) {
  if (!buoi || buoi.da_huy) return null;

  const batDau = new Date(buoi.starts_at).getTime();
  if (!Number.isFinite(batDau)) return null;

  const moLuc = batDau + Number(buoi.checkin_open_min ?? 0) * 60000;
  const dongLuc = batDau + Number(buoi.checkin_close_min ?? 15) * 60000;
  const dangMo = nowMs >= moLuc && nowMs <= dongLuc;

  // Buoi cua HOM NAY hay cua mot ngay da qua?
  //
  // VI SAO PHAI PHAN BIET: buoi Kick-Off duoc mo khung diem danh 5 ngay (chi
  // Thanh dan the hom khai giang, de nguoi vao muon van duoc tinh). Hau qua la
  // nut "Diem danh" mau xanh cua Ngay 0 nam ngay phia tren nut cua ngay hom
  // nay, SUOT CA TUAN. Sang 10/09 co 39 nguoi bam nut do va tuong minh da diem
  // danh Buoi 1 - trong do 5 nguoi bam dung trong khung 9:00-9:15.
  //
  // Hai nut trong giong het nhau thi khong the trach nguoi bam. Nut cua ngay da
  // qua gio la nut phu: vien mo, chu noi ro "bu Ngay N".
  const ngayBuoi = ngayThuongHieu(buoi.starts_at);
  const homNay = ngayThuongHieu(nowMs);
  const laBuoiHomNay = ngayBuoi === homNay;

  if (buoi.da_diem_danh) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-600">
        <Check className="w-3 h-3" /> Đã điểm danh buổi {gio(buoi.starts_at)}
      </div>
    );
  }

  return (
    <div className={cn(
      "mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
      dangMo && laBuoiHomNay
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-border bg-muted/40",
    )}>
      {dangMo ? (
        <>
          <Button
            size="sm"
            variant={laBuoiHomNay ? "default" : "outline"}
            className={cn(
              "h-8 rounded-full px-3.5 text-[12.5px]",
              laBuoiHomNay && "bg-emerald-600 hover:bg-emerald-700",
            )}
            disabled={busy}
            onClick={(e) => { e.preventDefault(); onCheckIn(); }}
          >
            {busy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : laBuoiHomNay ? "Điểm danh" : `Điểm danh bù Ngày ${ngay}`}
          </Button>
          <span className={cn(
            "text-[11.5px] font-semibold",
            laBuoiHomNay ? "text-emerald-700" : "text-muted-foreground",
          )}>
            {laBuoiHomNay
              ? `Còn ${Math.max(1, Math.ceil((dongLuc - nowMs) / 60000))} phút`
              : `Buổi ${ngayGonVN(buoi.starts_at)} — không phải buổi hôm nay`}
          </span>
        </>
      ) : (
        <span className="text-[11.5px] text-muted-foreground">
          {nowMs > dongLuc
            ? `Điểm danh đã khoá lúc ${gio(dongLuc)} — buổi này không tính chuyên cần.`
            : `Điểm danh mở ${gio(moLuc)}–${gio(dongLuc)}`}
        </span>
      )}
    </div>
  );
}

/**
 * O tich "Co mat" trong phan nop bai.
 *
 * KHONG phai mot co che diem danh thu hai: no goi dung ham diemDanh cua buoi
 * live gan voi ngay do, nen tich o day hay bam nut o the ngay ben trai deu la
 * MOT ban ghi co mat, mot lan cong diem.
 *
 * Ngay chua gan buoi live thi noi thang ra, thay vi hien mot o tich bam khong
 * duoc ma khong giai thich gi.
 */
function TichDiemDanh({ buoi, nowMs, busy, onCheckIn }) {
  const khung = (() => {
    if (!buoi || buoi.da_huy) return null;
    const batDau = new Date(buoi.starts_at).getTime();
    if (!Number.isFinite(batDau)) return null;
    const mo = batDau + Number(buoi.checkin_open_min ?? 0) * 60000;
    const dong = batDau + Number(buoi.checkin_close_min ?? 15) * 60000;
    return { mo, dong, dangMo: nowMs >= mo && nowMs <= dong, daKhoa: nowMs > dong };
  })();

  const daDiemDanh = !!buoi?.da_diem_danh;
  const bamDuoc = !!khung?.dangMo && !daDiemDanh && !busy;

  let ghiChu = 'Ngày này chưa gắn buổi live nào.';
  if (daDiemDanh) ghiChu = 'Đã ghi nhận có mặt.';
  else if (khung?.dangMo) ghiChu = `Còn ${Math.max(1, Math.ceil((khung.dong - nowMs) / 60000))} phút để điểm danh.`;
  else if (khung?.daKhoa) ghiChu = 'Điểm danh đã khoá — buổi này không tính chuyên cần.';
  else if (khung) ghiChu = `Mở lúc ${gio(khung.mo)}, đóng lúc ${gio(khung.dong)}.`;

  return (
    <div className={cn(
      'rounded-xl border px-3.5 py-3',
      daDiemDanh ? 'border-emerald-500/40 bg-emerald-500/10'
        : khung?.dangMo ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/40',
    )}>
      <label className={cn('flex items-center gap-2.5', bamDuoc ? 'cursor-pointer' : 'cursor-default')}>
        <input
          type="checkbox"
          checked={daDiemDanh}
          disabled={!bamDuoc}
          onChange={() => bamDuoc && onCheckIn()}
          className="h-[18px] w-[18px] accent-emerald-600"
        />
        <span className="text-[12.5px] font-bold">1. Điểm danh — có mặt</span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </label>
      <p className="mt-1 pl-[28px] text-[11.5px] text-muted-foreground">{ghiChu}</p>
    </div>
  );
}

function DayTaskRow({
  task, status, selectable, selected, onSelect, buoi, nowMs, busy, onCheckIn, ngayHienTai,
}) {
  const done = status === "approved";
  const locked = !selectable && !done;
  // Khoa vi CHUA TOI hay vi DA QUA la hai chuyen khac han. Ghi "Mo vao Ngay 1"
  // cho mot ngay da troi qua thi nguoi ta ngoi cho mot thu khong bao gio den.
  const daQua = locked && task.day < ngayHienTai;

  return (
    <label
      className={cn(
        "flex gap-3 px-4 py-3.5 rounded-xl border bg-background",
        selectable ? "cursor-pointer" : "cursor-default",
        selected ? "border-primary" : "border-border",
        locked && "opacity-55",
      )}
    >
      <span className="shrink-0 pt-0.5">
        {done ? (
          <span className="w-[17px] h-[17px] rounded-full bg-emerald-600 text-white flex items-center justify-center">
            <Check className="w-2.5 h-2.5" />
          </span>
        ) : selectable ? (
          <input
            type="radio"
            checked={selected}
            onChange={onSelect}
            className="w-[17px] h-[17px] accent-primary"
          />
        ) : (
          <Lock className="w-[15px] h-[15px] text-muted-foreground" />
        )}
      </span>

      <div className="flex-1 min-w-0">
        <div className={cn("font-semibold text-[13.5px]", done && "line-through text-muted-foreground")}>
          Ngày {task.day} · {task.title}
        </div>
        <div className={cn(
          "text-[11.5px] mt-0.5",
          done ? "text-emerald-600" : locked ? "text-muted-foreground" : "text-muted-foreground",
        )}>
          {/* Khong con ghi "+15 XP · +15 coin": nop bai khong cong diem nua, diem
              cua mot ngay den tu diem danh. Hua mot con so roi khong tra la
              cach nhanh nhat de mat long tin. */}
          {done
            ? "Đã hoàn thành"
            : daQua
              ? `Đã đóng lúc 24:00 Ngày ${task.day}`
              : locked
                ? `Mở vào Ngày ${task.day}`
                : "Chốt lúc 24:00 hôm nay"}
        </div>

        <DiemDanhNgay buoi={buoi} ngay={task.day} nowMs={nowMs} busy={busy} onCheckIn={onCheckIn} />

        {selected && (
          <div className="mt-2">
            {task.guide && <div className="text-xs text-foreground/70 leading-relaxed">{task.guide}</div>}
            <div className="grid gap-1 mt-1.5">
              {task.assignment_url && (
                <div className="text-xs">
                  Bài tập:{" "}
                  <a href={task.assignment_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                    Mở bài tập
                  </a>
                </div>
              )}
              {task.doc_url && (
                <div className="text-xs">
                  Tài liệu tham khảo:{" "}
                  <a href={task.doc_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                    Mở tài liệu
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

function SubmissionItem({ submission, task }) {
  const meta = STATUS[submission.status] || STATUS.pending;
  const rubric = Array.isArray(submission.ai_rubric_json) ? submission.ai_rubric_json : [];

  return (
    <div className="px-3.5 py-3 rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className={cn(
            "text-[12.5px] font-medium truncate",
            submission.status === "approved" && "line-through text-muted-foreground",
          )}>
            Ngày {submission.day}{task ? ` · ${task.title}` : ""}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{formatDate(submission.created_date)}</div>
        </div>
        <span className={cn(
          "flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap",
          meta.className,
        )}>
          {meta.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {meta.label}
        </span>
      </div>

      {/* Hai duong dan da nop. Truoc day khong hien o dau ca, nen nguoi dan
          nham link khong co cach nao tu phat hien - chi biet khi bi tra lai. */}
      {(submission.link || submission.file_url) && (
        <div className="mt-2 space-y-1">
          {submission.link && (
            <a href={submission.link} target="_blank" rel="noopener noreferrer"
              className="block text-[11.5px] text-primary hover:underline truncate">
              Bài tập: {submission.link}
            </a>
          )}
          {submission.file_url && (
            <a href={submission.file_url} target="_blank" rel="noopener noreferrer"
              className="block text-[11.5px] text-primary hover:underline truncate">
              Cảm nhận: {submission.file_url}
            </a>
          )}
        </div>
      )}

      {submission.feedback && (
        <p className="text-[11.5px] text-muted-foreground mt-2 leading-relaxed">{submission.feedback}</p>
      )}

      {rubric.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rubric.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px]">
              {r.pass
                ? <Check className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
                : <X className="w-3 h-3 mt-0.5 text-destructive shrink-0" />}
              <span className={r.pass ? "text-foreground/70" : "text-muted-foreground"}>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChallengeDetail({ challenge, me, participants, onBack }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Ba muc chi Thanh chot cho phan nop bai, dung ba tieu chi cham thi dua:
  // co mat (diem danh) · link bai tap (thuc hanh) · cam nhan ngay (dang bai).
  // Truoc day chi co MOT o gop tat ca, va he thong phai doan dau la link bang
  // regex - dan hai link thi mat mot, viet cam nhan co chua link thi cat nham.
  const [linkBai, setLinkBai] = useState("");
  const [linkCamNhan, setLinkCamNhan] = useState("");
  const [pickedDay, setPickedDay] = useState(null);

  const { data: membership } = useQuery({
    queryKey: ["challenge-member", challenge.id, me.id],
    queryFn: async () =>
      (await base44.entities.ChallengeMember.filter({ challenge_id: challenge.id, user_id: me.id }))[0] || null,
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["day-tasks", challenge.id],
    queryFn: () => base44.entities.ChallengeDayTask.filter({ challenge_id: challenge.id }, "day", 100),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", challenge.id, me.id],
    queryFn: () => base44.entities.ChallengeSubmission.filter(
      { challenge_id: challenge.id, user_id: me.id }, "-created_date", 100),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["challenge-members-board", challenge.id],
    queryFn: () => base44.entities.ChallengeMember.filter({ challenge_id: challenge.id }, "-progress", 200),
  });

  // Buoi live gan voi tung ngay, kem chuyen minh da diem danh chua. Chi hoi khi
  // da tham gia: nguoi chua vao thu thach thi khong co gi de diem danh.
  const { data: lich } = useQuery({
    queryKey: ["lich-thu-thach", challenge.id, me.id],
    queryFn: () => base44.functions.invoke("lichThuThach", { challenge_id: challenge.id }),
    enabled: !!membership,
  });
  const buoiTheoNgay = Object.fromEntries(
    (((lich?.data || lich)?.days) || []).map((d) => [d.day, d]),
  );

  // Nhung ngay CHI CAN DIEM DANH, khong co bai tap - vd buoi Kick-Off la buoi
  // dinh huong, khong co gi de nop. Doc tu app_settings chu khong viet cung so
  // ngay: chi Thanh doi lich hay them mot buoi khong bai tap thi sua mot dong
  // trong trang Co che, khong phai goi toi.
  const { data: caiDat = [] } = useQuery({
    queryKey: ["cai-dat", "ngay-chi-diem-danh"],
    queryFn: () => base44.entities.AppSetting.filter({ key: "st-ngay-chi-diem-danh" }, "key", 1),
  });
  const docNgay = (raw) => {
    try {
      const v = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.map(Number) : [];
    } catch { return []; }
  };
  const ngayMienNop = React.useMemo(() => docNgay(caiDat?.[0]?.value), [caiDat]);

  // Ngay CHI CO BAI CAM NHAN: an o "link bai tap", van doi bai cam nhan. Khac
  // voi ngayMienNop o tren - ngay do an ca hai o va chi con diem danh.
  const { data: caiKhongBaiTap = [] } = useQuery({
    queryKey: ["cai-dat", "ngay-khong-bai-tap"],
    queryFn: () => base44.entities.AppSetting.filter({ key: "st-ngay-khong-bai-tap" }, "key", 1),
  });
  const ngayKhongBaiTap = React.useMemo(
    () => docNgay(caiKhongBaiTap?.[0]?.value), [caiKhongBaiTap],
  );

  // Nhip 20 giay: den gio thi nut diem danh tu hien ra, khong bat nguoi ta tai
  // lai trang moi thay.
  const [nowMs, setNowMs] = useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  const [dangDiemDanh, setDangDiemDanh] = useState(null);
  const diemDanh = useMutation({
    mutationFn: (eventId) => base44.functions.invoke("diemDanh", { event_id: eventId }),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries({ queryKey: ["lich-thu-thach", challenge.id, me.id] });
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast({
        title: d?.da_diem_danh ? "Bạn đã điểm danh rồi" : "Điểm danh thành công",
        description: d?.awarded?.xp ? `+${d.awarded.xp} XP · +${d.awarded.coin} xu` : undefined,
      });
    },
    onError: (err) => toast({ title: "Chưa điểm danh được", description: err.message, variant: "destructive" }),
    onSettled: () => setDangDiemDanh(null),
  });

  const submit = useMutation({
    mutationFn: () => base44.functions.invoke("submitChallengeDay", {
      challenge_id: challenge.id,
      day: currentPick,
      link: linkBai.trim() || undefined,
      file_url: linkCamNhan.trim() || undefined,
    }),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries({ queryKey: ["submissions", challenge.id, me.id] });
      qc.invalidateQueries({ queryKey: ME_KEY });

      // Bai khong du luat VAN duoc luu, nen khong xoa trang o nhap: nguoi ta
      // con phai bo sung ngay tren cai vua go, khong phai go lai tu dau.
      if (d?.tu_duyet) {
        setLinkBai("");
        setLinkCamNhan("");
        toast({
          title: "Đã nộp bài 🎉",
          description: "Hệ thống đã ghi nhận bài của bạn.",
        });
        return;
      }
      toast({
        title: "Đã lưu bài nộp",
        description: d?.con_thieu?.length
          ? `Bổ sung ${d.con_thieu.join(' và ')} là được tính điểm ngay.`
          : "Bài của bạn đang chờ được duyệt.",
      });
    },
    onError: (err) => toast({ title: "Không nộp được bài", description: err.message, variant: "destructive" }),
  });

  // Ngay tinh theo LICH CHUONG TRINH, khong theo ngay tung nguoi bam tham gia:
  // ca lop hoc chung mot buoi Zoom moi sang nen ai cung phai o cung mot ngay.
  // Cong thuc nay phai giong het `ngayThuThach` ben may chu.
  const currentDay = ngayThuThach(challenge);

  const statusByDay = {};
  for (const s of submissions) {
    // submissions sap xep moi truoc, nen ban dau tien gap la ban moi nhat cua ngay do
    if (statusByDay[s.day] === undefined) statusByDay[s.day] = s.status;
  }

  // Chi ngay HOM NAY moi nop duoc - het 24:00 la dong. Phai giong het chot chan
  // ben may chu (submitChallengeDay), khong thi trang mo o nhap cho mot ngay ma
  // may chu tu choi, va nguoi ta go xong bam Nop roi an mot loi kho hieu.
  const selectableDays = tasks
    .filter((t) => t.day === currentDay && statusByDay[t.day] !== "approved")
    .map((t) => t.day);
  const currentPick = pickedDay && selectableDays.includes(pickedDay)
    ? pickedDay
    : selectableDays[selectableDays.length - 1] || null;

  const taskByDay = Object.fromEntries(tasks.map((t) => [t.day, t]));
  const todayTask = taskByDay[currentPick];
  // Ngay dang chon co phai ngay chi can diem danh khong (xem ngayMienNop).
  const chiDiemDanh = !!currentPick && ngayMienNop.includes(Number(currentPick));
  const khongBaiTap = !!currentPick && ngayKhongBaiTap.includes(Number(currentPick));
  const left = daysLeft(challenge.end_date);
  const leader = members[0];
  const heroThumb = youtubeThumbFromUrl(challenge.hero_video_url) || challenge.banner_url;
  // Video phat NGAY TAI TRANG. Truoc day ca hai chỗ video deu la the <a
  // target="_blank">: bam vao la bat sang tab khac, roi khoi lop. Voi Wistia con
  // te hon - khong co anh dai dien (youtubeThumbFromUrl chi hieu YouTube) nen no
  // hien mot o den kin, khong ai doan duoc do la video.
  const heroEmbed = embedFromUrl(challenge.hero_video_url);
  const dayEmbed = embedFromUrl(todayTask?.video_url);
  const [heroPlaying, setHeroPlaying] = useState(false);
  const [dayPlaying, setDayPlaying] = useState(false);
  // Doi ngay thi phai dung video ngay cu lai, khong thi nguoi ta bam sang Ngay 3
  // ma van dang nghe tieng video Ngay 2 chay ben duoi.
  React.useEffect(() => setDayPlaying(false), [currentPick]);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
        <ArrowLeft className="w-3.5 h-3.5" /> Tất cả Challenge
      </button>

      {/* Hero */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {challenge.hero_video_url && (
          heroPlaying && heroEmbed ? (
            <div className="relative bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                src={heroEmbed}
                title={`Video giới thiệu · ${challenge.name}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (heroEmbed ? setHeroPlaying(true) : window.open(challenge.hero_video_url, "_blank", "noopener"))}
              className="relative block w-full bg-black text-left"
              style={{ aspectRatio: "16 / 6.5" }}
            >
              {heroThumb && <img src={heroThumb} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />}
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/20 border border-white/70 backdrop-blur grid place-items-center text-white">
                <Play className="w-5 h-5 fill-current" />
              </span>
              <span className="absolute left-4 bottom-3 text-[12.5px] font-bold text-white">
                Video giới thiệu · {challenge.name}
              </span>
            </button>
          )
        )}

        <div className="p-5 lg:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            <div>
              <div className="font-mono font-extrabold text-xl">{formatNumber(participants)}</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">người đang tham gia</div>
            </div>
            <div>
              <div className="font-mono font-extrabold text-xl">{left != null ? left : "—"}</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">ngày còn lại</div>
            </div>
            <div>
              <div className="font-mono font-extrabold text-xl text-amber-700">
                {formatNumber(challenge.reward_xp)} XP
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">phần thưởng hoàn thành</div>
            </div>
            <div>
              <div className="font-mono font-extrabold text-xl text-primary">
                {leader ? getInitials(leader.user_name) : "—"}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {leader ? `đang dẫn đầu · ${leader.progress || 0} ngày` : "chưa có người dẫn đầu"}
              </div>
            </div>
          </div>

          {challenge.rules && (
            <div className="text-[12.5px] text-foreground/75 whitespace-pre-wrap leading-relaxed">{challenge.rules}</div>
          )}
        </div>
      </div>

      {!membership && (
        <EmptyState
          icon={Target}
          title="Bạn chưa tham gia Challenge này"
          description="Quay lại danh sách và bấm 'Vào Challenge' để tham gia trước khi nộp bài."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Nhiem vu theo ngay */}
        <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-[15px]">Nhiệm vụ theo ngày</h3>
            <span className="text-[11.5px] font-bold text-primary whitespace-nowrap">Chương trình đang ở Ngày {currentDay}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3.5">
            Mỗi ngày mở đúng 1 nhiệm vụ, và chốt lúc 24:00 hôm đó. Qua ngày là không nộp bù được nữa.
          </p>

          {todayTask?.video_url && (
            dayPlaying && dayEmbed ? (
              <div className="relative mb-3.5 overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
                <iframe
                  src={dayEmbed}
                  title={todayTask.video_title || todayTask.title}
                  className="absolute inset-0 h-full w-full border-0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (dayEmbed ? setDayPlaying(true) : window.open(todayTask.video_url, "_blank", "noopener"))}
                className="flex w-full gap-3 items-center px-4 py-3.5 rounded-xl bg-background border border-primary/25 mb-3.5 text-left"
              >
                <span className="w-16 h-11 rounded-lg bg-neutral-900 shrink-0 flex items-center justify-center text-white">
                  <Play className="w-4 h-4 fill-current" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">
                    Video hướng dẫn hôm nay
                  </span>
                  <span className="block font-semibold text-[13.5px] mt-0.5 truncate">
                    {todayTask.video_title || todayTask.title}
                  </span>
                </span>
              </button>
            )
          )}

          {loadingTasks ? (
            <p className="text-sm text-muted-foreground">Đang tải nhiệm vụ...</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Challenge này chưa có nhiệm vụ theo ngày.</p>
          ) : (
            <div className="space-y-2.5">
              {tasks.map((t) => (
                <DayTaskRow
                  key={t.id}
                  task={t}
                  status={statusByDay[t.day]}
                  selectable={selectableDays.includes(t.day)}
                  selected={t.day === currentPick}
                  onSelect={() => setPickedDay(t.day)}
                  buoi={buoiTheoNgay[t.day]}
                  nowMs={nowMs}
                  ngayHienTai={currentDay}
                  busy={diemDanh.isPending && dangDiemDanh === t.day}
                  onCheckIn={() => {
                    setDangDiemDanh(t.day);
                    diemDanh.mutate(buoiTheoNgay[t.day].event_id);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Nop bai.

            THU THACH CHUA CO NGAY NAO thi khong hien khoi nay.

            Truoc day no render vo dieu kien. Voi 0 ChallengeDayTask thi
            `currentPick` la null, nen cot phai hien hai o "Link nop bai tap" va
            "Link bai cam nhan" - hai viec nguoi ta tuong minh phai lam - con nut
            thi bi tat kem nhan "Da nop het nhiem vu dang mo", mot cau SAI SU
            THAT: ho chua nop gi, va cung khong co gi de nop. Trong khi cot trai
            noi dung: "Challenge nay chua co nhiem vu theo ngay". Hai nua man
            hinh noi hai chuyen trai nguoc nhau. */}
        {currentPick == null ? (
          <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
            <h3 className="font-bold text-[15px]">Chưa có nhiệm vụ nào</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Thử thách này chưa được xếp nhiệm vụ theo ngày. Khi ban tổ chức thêm vào,
              phần nộp bài sẽ hiện ở đây.
            </p>
          </div>
        ) : (
        <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
          <h3 className="font-bold text-[15px]">
            {chiDiemDanh ? "Điểm danh" : "Nộp bài"}{currentPick ? ` Ngày ${currentPick}` : ""}
          </h3>
          <p className="mt-0.5 mb-3.5 text-xs text-muted-foreground">
            {chiDiemDanh
              ? "Ngày này chỉ cần điểm danh — không có bài tập phải nộp."
              : "Ba việc của mỗi ngày — làm đủ cả ba thì được tính điểm thi đua đầy đủ."}
          </p>

          {/* 1. Diem danh. O tich nay goi dung ham diem danh cua buoi live gan
              voi ngay do, nen no va nut o the ngay ben trai la MOT ban ghi. */}
          <TichDiemDanh
            buoi={buoiTheoNgay[currentPick]}
            nowMs={nowMs}
            busy={diemDanh.isPending}
            onCheckIn={() => diemDanh.mutate(buoiTheoNgay[currentPick].event_id)}
          />

          {/* Ngay chi diem danh thi AN HAN hai o link va nut nop, khong phai
              chi lam mo di: mot o nhap hien ra la mot viec nguoi ta tuong minh
              con phai lam. Buoi Kick-Off khong co gi de nop. */}
          {!chiDiemDanh && (
          <>
          {/* 2. Link bai tap - an han khi ngay do khong ra bai tap. An chu
              khong lam mo: mot o nhap hien ra la mot viec nguoi ta tuong minh
              con phai lam. */}
          {!khongBaiTap && (
          <label className="mt-3.5 block">
            <span className="text-[12.5px] font-bold">2. Link nộp bài tập</span>
            <Input
              value={linkBai}
              onChange={(e) => setLinkBai(e.target.value)}
              placeholder="Dán link Google Drive hoặc Notion"
              className="mt-1.5 rounded-xl text-sm"
            />
          </label>
          )}

          {/* 3. Cam nhan ngay */}
          <label className="mt-3 block">
            <span className="text-[12.5px] font-bold">{khongBaiTap ? '2' : '3'}. Link bài cảm nhận trên nhóm Facebook</span>
            <Input
              value={linkCamNhan}
              onChange={(e) => setLinkCamNhan(e.target.value)}
              placeholder="Dán link bài đăng cảm nhận của bạn trong nhóm Facebook"
              className="mt-1.5 rounded-xl text-sm"
            />
          </label>

          <Button
            className="w-full rounded-full mt-3.5 h-12 text-[14.5px] font-extrabold"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !membership || !currentPick
              || (!khongBaiTap && !linkBai.trim()) || !linkCamNhan.trim()}
          >
            {submit.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : currentPick
                ? `Nộp ${khongBaiTap ? 'cảm nhận' : 'bài'} Ngày ${currentPick} →`
                : "Đã nộp hết nhiệm vụ đang mở"}
          </Button>
          {!!currentPick && ((!khongBaiTap && !linkBai.trim()) || !linkCamNhan.trim()) && (
            <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
              {khongBaiTap
                ? 'Hôm nay chỉ cần link bài cảm nhận thì hệ thống mới ghi nhận.'
                : 'Cần đủ cả hai link — bài tập và bài cảm nhận — thì hệ thống mới ghi nhận.'}
            </p>
          )}
          </>
          )}

          <h4 className="mt-6 mb-2.5 text-[13px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Lịch sử nộp bài
          </h4>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bạn chưa nộp bài nào trong Challenge này.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((s) => (
                <SubmissionItem key={s.id} submission={s} task={taskByDay[s.day]} />
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- trang */

export default function Challenges() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id");

  const dsThuThach = useQuery({
    queryKey: ["challenges", "active"],
    queryFn: () => base44.entities.Challenge.filter({ is_active: true }, "-created_date", 50),
  });
  const { data: challenges = [], isLoading } = dsThuThach;

  // So nguoi tham gia phai dem tung thu thach: filter chi so sanh bang, khong
  // gop nhom duoc, va mot lan `list` co the bi cat theo tran 200 dong.
  const { data: counts = {} } = useQuery({
    queryKey: ["challenge-participants", challenges.map((c) => c.id).join(",")],
    queryFn: async () => {
      const pairs = await Promise.all(challenges.map(async (c) => {
        const rows = await base44.entities.ChallengeMember.filter({ challenge_id: c.id }, "-created_date", 200);
        return [c.id, rows.length];
      }));
      return Object.fromEntries(pairs);
    },
    enabled: challenges.length > 0,
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["entitlements", me?.id],
    queryFn: () => base44.entities.Entitlement.filter({ user_id: me.id }, "-created_date", 200),
    enabled: !!me?.id,
  });

  const join = useMutation({
    mutationFn: (challengeId) => base44.functions.invoke("joinChallenge", { challenge_id: challengeId }),
    onSuccess: (_res, challengeId) => {
      qc.invalidateQueries({ queryKey: ["challenge-member", challengeId, me?.id] });
      qc.invalidateQueries({ queryKey: ["challenge-members", me?.id] });
      setParams({ id: challengeId });
    },
    onError: (err) => toast({ title: "Không vào được Challenge", description: err.message, variant: "destructive" }),
  });

  if (!me) return <Loading />;

  const isLocked = (c) =>
    c.requires_unlock
    && !entitlements.some((e) => e.kind === "challenge" && e.ref === c.id && !e.revoked_at);

  const selected = challenges.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <ChallengeDetail
        challenge={selected}
        me={me}
        participants={counts[selected.id] || 0}
        onBack={() => setParams({})}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Challenge & Nộp bài"
        subtitle="Chọn 1 Challenge để tham gia. Challenge đang khoá cần admin mở cho bạn."
      />

      <CanDangKy me={me} phan="Challenge và nộp bài" />

      <ChonNhom />

      {/* Loi tai trang phai KHAC trang thai rong - xem QueryState.jsx. */}
      {dsThuThach.isError ? (
        <ErrorBlock error={dsThuThach.error} onRetry={dsThuThach.refetch} />
      ) : isLoading ? (
        <Loading label="Đang tải Challenge..." />
      ) : challenges.length === 0 ? (
        <EmptyState icon={Target} title="Chưa có Challenge nào đang mở" description="Hãy quay lại sau nhé." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              participants={counts[c.id] || 0}
              locked={isLocked(c)}
              joining={join.isPending && join.variables === c.id}
              onOpen={() => join.mutate(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
