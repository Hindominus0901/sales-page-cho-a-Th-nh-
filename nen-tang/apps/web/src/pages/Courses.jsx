import NutNhanAdmin from '@/components/NutNhanAdmin';
import { ErrorBlock } from "@/components/QueryState";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe, ME_KEY } from "@/lib/useMe";
import { daMoKhoa, khoaMoQuaGoi, lyDoKhoa } from "@/lib/moKhoa";
import { computeLevel } from "@/lib/gamification";
import CanDangKy from "@/components/CanDangKy";
import LessonRow from "@/components/LessonRow";
import XemBaiGiang from "@/components/XemBaiGiang";
import LinkKhoaHoc from "@/components/LinkKhoaHoc";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";


export default function Courses() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  // Bai dang xem. Rong = dang o danh sach bai cua khoa.
  const [lessonId, setLessonId] = useState(null);

  const khoaHoc = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.filter({ is_active: true }, "sort_order", 100),
  });
  const { data: courses = [], isLoading } = khoaHoc;

  // Can cap bac de biet khoa co min_level da mo chua - dung cung luat voi
  // gateByCourse ben may chu. Xem chu thich trong lib/moKhoa.js.
  const { data: levels = [] } = useQuery({
    queryKey: ["levels"],
    queryFn: () => base44.entities.Level.list("level_number", 50),
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["entitlements", me?.id],
    queryFn: () => base44.entities.Entitlement.filter({ user_id: me.id }, "-created_date", 200),
    enabled: !!me?.id,
  });

  // Can bang san pham de biet goi nao mo khoa nao.
  const { data: sanPham = [] } = useQuery({
    queryKey: ["san-pham"],
    queryFn: () => base44.entities.Product.list("sort_order", 100),
  });

  // Dem so bai giang cua tung khoa de hien tren the - Lesson doc duoc cho moi nguoi.
  const { data: allLessons = [] } = useQuery({
    queryKey: ["lessons", "all"],
    queryFn: () => base44.entities.Lesson.list("sort_order", 200),
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["lesson-progress", me?.id, selectedId],
    queryFn: () => base44.entities.LessonProgress.filter({ user_id: me.id, course_id: selectedId }, "-created_date", 200),
    enabled: !!me?.id && !!selectedId,
  });

  const completeMutation = useMutation({
    mutationFn: (lessonId) => base44.functions.invoke("completeLesson", { lesson_id: lessonId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", me?.id, selectedId] });
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast({
        title: res?.course_completed ? "🎉 Hoàn thành khoá học!" : "Đã đánh dấu đã học",
        description: res?.awarded ? `+${res.awarded.xp || 0} XP · +${res.awarded.coin || 0} coin` : undefined,
      });
    },
    onError: (err) => toast({ title: "Không hoàn thành được bài học", description: err.message, variant: "destructive" }),
  });

  if (!me) return <Loading />;

  // Phai tinh CA khoa mo qua goi, khong chi quyen `course` - xem lib/moKhoa.js.
  // Thieu ve nay thi may chu mo video con giao dien van ve man hinh khoa.
  const quaGoi = khoaMoQuaGoi(entitlements, sanPham);
  const capDo = computeLevel(me.total_xp || 0, levels).levelNumber;
  const unlocked = (course) => daMoKhoa(course, entitlements, quaGoi, capDo);

  const lessonsOf = (courseId) => allLessons.filter((l) => l.course_id === courseId);
  const selected = courses.find((c) => c.id === selectedId) || null;

  if (selected) {
    const lessons = lessonsOf(selected.id);
    const isUnlocked = unlocked(selected);
    const doneIds = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));

    // Mot bai dang duoc mo -> nhuong ca man hinh cho no.
    const dangXem = isUnlocked ? lessons.find((l) => l.id === lessonId) : null;
    if (dangXem) {
      return (
        <XemBaiGiang
          lesson={dangXem}
          lessons={lessons}
          courseName={selected.name}
          completed={doneIds.has(dangXem.id)}
          completing={completeMutation.isPending && completeMutation.variables === dangXem.id}
          onBack={() => setLessonId(null)}
          onChon={setLessonId}
          onComplete={() => completeMutation.mutate(dangXem.id)}
        />
      );
    }

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setSelectedId(null); setLessonId(null); }}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Tất cả khoá học
        </button>

        <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
          <div className="font-bold text-base">{selected.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 mb-4">{lessons.length} bài giảng</div>

          {isUnlocked && <LinkKhoaHoc course={selected} />}

          {!isUnlocked ? (
            <EmptyState
              icon={Lock}
              title="Khoá học này đang khoá"
              description={lyDoKhoa(selected, capDo)}
              action={
                <NutNhanAdmin />
              }
              className="border-0 p-6"
            />
          ) : lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Khoá học này chưa có bài giảng nào.</p>
          ) : (
            <div className="space-y-2.5">
              {lessons.map((l) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  completed={doneIds.has(l.id)}
                  onOpen={() => setLessonId(l.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Lớp học" subtitle="Chọn 1 khoá học để xem video bài giảng." />

      <CanDangKy me={me} phan="Lớp học" />

      {/* Loi tai trang phai KHAC trang thai rong - xem QueryState.jsx. */}
      {khoaHoc.isError ? (
        <ErrorBlock error={khoaHoc.error} onRetry={khoaHoc.refetch} />
      ) : isLoading ? (
        <Loading label="Đang tải khoá học..." />
      ) : courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Chưa có khoá học nào" description="Khoá học sẽ xuất hiện ở đây khi được mở." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => {
            const isUnlocked = unlocked(c);
            const count = lessonsOf(c.id).length;
            return (
              <div
                key={c.id}
                className={cn(
                  "bg-card rounded-2xl border border-border p-5 flex flex-col relative",
                  !isUnlocked && "opacity-80",
                )}
              >
                {!isUnlocked && (
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-foreground/80 text-background text-[10px] font-bold px-2.5 py-1 rounded-full">
                    <Lock className="w-3 h-3" /> Đang khoá
                  </div>
                )}
                <div className="aspect-[4/3] rounded-xl bg-neutral-900 flex items-center justify-center text-3xl text-white mb-3.5 overflow-hidden">
                  {c.thumbnail_url ? (
                    <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    "📚"
                  )}
                </div>
                <div className="font-bold text-[15px]">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-1 mb-4">{count} bài giảng</div>
                {isUnlocked ? (
                  <Button className="rounded-full w-full mt-auto" onClick={() => { setSelectedId(c.id); setLessonId(null); }}>
                    Xem khoá học →
                  </Button>
                ) : (
                  <NutNhanAdmin full className="mt-auto" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
