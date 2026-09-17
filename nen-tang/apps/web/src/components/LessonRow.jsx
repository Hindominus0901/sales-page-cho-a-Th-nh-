/**
 * Mot hang bai giang trong danh sach cua khoa hoc. Bam vao la mo TRANG XEM
 * (components/XemBaiGiang.jsx), khong phat ngay tai cho.
 *
 * TRUOC DAY o duoi cung: o video 110px voi mot iframe nhung thang trong hang.
 * Xem mot buoi hoc hai tieng trong cai o bang bao diem la khong xem noi - chi
 * Thanh bao "nhin bi nho qua". Nen hang chi con lam mot viec: gioi thieu bai va
 * dan sang trang xem, noi video chiem het be ngang.
 *
 * TACH RA DUNG CHUNG cho ca trang Lop hoc lan trang VIP - hai ben phai giong
 * het nhau, chep doi la som muon lech.
 */
import { Check, ChevronRight, Play } from "lucide-react";
import { videoThumb } from "@/lib/video";
import { cn } from "@/lib/utils";

export default function LessonRow({ lesson, completed, onOpen }) {
  const thumb = videoThumb(lesson);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group grid w-full grid-cols-[132px_1fr] items-center gap-4 rounded-2xl border border-border",
        "bg-background p-3 text-left transition hover:border-primary/50 hover:bg-muted/40",
        "sm:grid-cols-[220px_1fr] sm:gap-5 sm:p-4",
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-900">
        {/* Anh thu nho doan tu ma video nen KHONG chac co that: Wistia co the
            chua sinh xong swatch, video YouTube co the da bi xoa. Hong thi go
            han the <img> di, de lo lop nen den voi nut Play ben duoi - dep hon
            han mot bieu tuong anh vo dat giua khung. */}
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition group-hover:scale-110 group-hover:bg-white/30 sm:h-12 sm:w-12">
            <Play className="h-4 w-4 fill-current sm:h-5 sm:w-5" />
          </span>
        </span>
        {lesson.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white sm:text-[11px]">
            {lesson.duration}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="text-[14px] font-bold leading-snug sm:text-[15.5px]">{lesson.title}</div>
            {completed && (
              <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[10.5px] font-bold text-emerald-600">
                <Check className="h-3 w-3" /> Đã học
              </span>
            )}
          </div>
          {lesson.guide && (
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {lesson.guide}
            </p>
          )}
        </div>
        <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary sm:block" />
      </div>
    </button>
  );
}
