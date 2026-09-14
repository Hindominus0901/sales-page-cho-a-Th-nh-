/**
 * Trang xem mot bai giang: video chiem het be ngang, huong dan va tai lieu o
 * duoi, danh sach cac bai con lai o duoi cung de nhay qua lai.
 *
 * VI SAO LA MOT "TRANG" CHU KHONG PHAI O VIDEO TRONG DANH SACH: mot buoi hoc o
 * day dai hai tieng ruoi. Xem no trong o 110px canh mot hang chu la khong xem
 * duoc - va do dung la cai nguoi dung keu. O day khong co gi tranh cho voi
 * video ngoai nhung thu thuc su can khi dang hoc.
 *
 * Dung chung cho ca Lop hoc lan khu vuc VIP. Hai ben deu tu quan ly "dang xem
 * bai nao" bang state cua rieng minh roi truyen xuong day, nen o day khong biet
 * gi ve dinh tuyen - va cung khong can biet.
 */
import React from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, NotebookPen } from "lucide-react";
import { videoEmbedUrl } from "@/lib/video";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Them tham so tu phat. Nguoi hoc vua bam vao bai roi, bat ho bam them lan nua
 * trong trinh phat la thua mot nhip. Moi nha cung cap goi tham so mot kieu.
 */
function tuPhat(lesson, embed) {
  const noi = embed.includes("?") ? "&" : "?";
  switch (lesson.video_provider) {
    case "youtube":
    case "vimeo":
      return `${embed}${noi}autoplay=1`;
    case "stream":
      return `${embed}${noi}autoplay=true`;
    // Wistia (mac dinh khi bo trong) viet hoa giua chung: autoPlay.
    default:
      return `${embed}${noi}autoPlay=true`;
  }
}

export default function XemBaiGiang({
  lesson, lessons = [], courseName, completed, completing, onBack, onChon, onComplete,
}) {
  const embed = videoEmbedUrl(lesson);
  const viTri = lessons.findIndex((l) => l.id === lesson.id);
  const truoc = viTri > 0 ? lessons[viTri - 1] : null;
  const sau = viTri >= 0 && viTri < lessons.length - 1 ? lessons[viTri + 1] : null;

  // Len dau trang khi doi bai: khong lam thi bam "Bai tiep theo" tu cuoi danh
  // sach se mo bai moi nhung man hinh van dung o duoi, nhin nhu khong co gi xay ra.
  React.useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [lesson.id]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {courseName || "Quay lại khoá học"}
      </button>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-video w-full bg-neutral-900">
          {embed ? (
            <iframe
              key={lesson.id}
              src={tuPhat(lesson, embed)}
              title={lesson.title}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
              Bài này chưa có video. Nhắn admin để được bổ sung nhé.
            </div>
          )}
        </div>

        <div className="p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-snug sm:text-xl">{lesson.title}</h1>
              <div className="mt-1 text-xs text-muted-foreground">
                {viTri >= 0 && `Bài ${viTri + 1}/${lessons.length}`}
                {lesson.duration ? ` · ${lesson.duration}` : ""}
              </div>
            </div>
            {completed ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-2 text-[12.5px] font-bold text-emerald-600">
                <Check className="h-4 w-4" /> Đã học
              </span>
            ) : (
              <Button className="h-10 rounded-full px-5 font-bold" onClick={onComplete} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Đánh dấu đã học"}
              </Button>
            )}
          </div>

          {lesson.guide && (
            <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
              {lesson.guide}
            </p>
          )}

          {(lesson.assignment_url || lesson.doc_url) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {lesson.assignment_url && (
                <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
                  <a href={lesson.assignment_url} target="_blank" rel="noopener noreferrer">
                    <NotebookPen className="mr-1.5 h-3.5 w-3.5" /> Bài tập
                    <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
                  </a>
                </Button>
              )}
              {lesson.doc_url && (
                <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
                  <a href={lesson.doc_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Tài liệu của bài
                    <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
                  </a>
                </Button>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              variant="outline"
              className="h-10 rounded-full px-4 text-[12.5px] font-bold"
              disabled={!truoc}
              onClick={() => truoc && onChon(truoc.id)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Bài trước
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-full px-4 text-[12.5px] font-bold"
              disabled={!sau}
              onClick={() => sau && onChon(sau.id)}
            >
              Bài tiếp theo <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {lessons.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
          <div className="mb-3 text-[13px] font-bold">Các bài trong khoá</div>
          <div className="space-y-1.5">
            {lessons.map((l, i) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onChon(l.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  l.id === lesson.id ? "bg-primary/10 font-bold" : "hover:bg-muted/60",
                )}
              >
                <span className="w-5 shrink-0 text-center font-mono text-[11.5px] text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{l.title}</span>
                {l.duration && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{l.duration}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
