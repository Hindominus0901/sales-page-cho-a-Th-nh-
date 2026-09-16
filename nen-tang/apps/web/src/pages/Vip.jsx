/**
 * Khu vuc VIP - cac khoa hoc chi mo cho nguoi da mua goi VIP.
 *
 * KHOA NAO LA "VIP" doc tu `products.grants_json` cua goi VIP, chu khong phai
 * mot cot `is_vip` moi. Do chinh la nguon su that: goi VIP mo khoa nao thi tab
 * nay hien khoa do. Chi Thanh sua danh sach trong trang Quan tri > San pham,
 * khong phai goi toi.
 *
 * VE PHAN KHOA NOI DUNG - doc ky truoc khi sua:
 *
 * Trang nay KHONG tu che video. Viec do do may chu lam, qua `gateByCourse`
 * (worker/src/entities/repo.js): no chi mo `video_id` cho ai co entitlement
 * `kind='course'` tro dung khoa do. Nguoi mua VIP nhan duoc quyen do tu dong
 * qua `grantsFor` (worker/src/commerce/fulfil.js) - CHINH LA nho grants_json.
 *
 * Nen neu grants_json de rong thi: tab nay khong hien khoa nao, va ke ca co
 * hien thi video cung khong phat duoc. Hai chuyen do di lien nhau, khong tach
 * roi duoc, va do la co y.
 *
 * Co `kind='package'` chi de quyet dinh HIEN NOI DUNG hay HIEN NUT MUA. No
 * khong mo khoa gi ca.
 */
import BRAND from "@/brand.generated.js";
import { ErrorBlock } from "@/components/QueryState";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Crown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe, ME_KEY } from "@/lib/useMe";
import LessonRow from "@/components/LessonRow";
import XemBaiGiang from "@/components/XemBaiGiang";
import LinkKhoaHoc from "@/components/LinkKhoaHoc";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function Vip() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  // Bai dang xem. Rong = dang o danh sach bai cua khoa.
  const [lessonId, setLessonId] = useState(null);

  // Goi VIP: de biet khoa nao thuoc VIP, va de hien gia o man hinh moi mua.
  const qGoi = useQuery({
    queryKey: ["product", BRAND.productSku],
    queryFn: () => base44.entities.Product.filter({ sku: BRAND.productSku }, "sku", 1),
  });
  const { data: sanPham = [], isLoading: dangTaiGoi } = qGoi;
  const goi = sanPham[0] || null;

  const idKhoaVip = React.useMemo(() => {
    let ds = goi?.grants_json;
    if (typeof ds === "string") { try { ds = JSON.parse(ds); } catch { ds = []; } }
    return (Array.isArray(ds) ? ds : [])
      .filter((g) => g?.kind === "course" && g?.ref)
      .map((g) => g.ref);
  }, [goi]);

  const qKhoa = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.filter({ is_active: true }, "sort_order", 100),
  });
  const { data: courses = [], isLoading: dangTaiKhoa } = qKhoa;

  const { data: entitlements = [] } = useQuery({
    queryKey: ["entitlements", me?.id],
    queryFn: () => base44.entities.Entitlement.filter({ user_id: me.id }, "-created_date", 200),
    enabled: !!me?.id,
  });

  const { data: allLessons = [] } = useQuery({
    queryKey: ["lessons", "all"],
    queryFn: () => base44.entities.Lesson.list("sort_order", 200),
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["lesson-progress", me?.id, selectedId],
    queryFn: () => base44.entities.LessonProgress.filter(
      { user_id: me.id, course_id: selectedId }, "-created_date", 200),
    enabled: !!me?.id && !!selectedId,
  });

  const completeMutation = useMutation({
    mutationFn: (lessonId) => base44.functions.invoke("completeLesson", { lesson_id: lessonId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", me?.id, selectedId] });
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast({
        title: res?.course_completed ? "🎉 Hoàn thành khoá học!" : "Đã đánh dấu đã học",
        description: res?.awarded
          ? `+${res.awarded.xp || 0} XP · +${res.awarded.coin || 0} coin`
          : undefined,
      });
    },
    onError: (err) => toast({
      title: "Không hoàn thành được bài học", description: err.message, variant: "destructive",
    }),
  });

  if (!me) return <Loading />;

  const daMuaVip = entitlements.some(
    (e) => e.kind === "package" && e.ref === BRAND.productSku && !e.revoked_at);

  const khoaVip = courses.filter((c) => idKhoaVip.includes(c.id));
  const lessonsOf = (courseId) => allLessons.filter((l) => l.course_id === courseId);

  // ------------------------------------------------------------- chua mua VIP
  if (!daMuaVip) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Khu vực VIP"
          subtitle="Bài giảng chuyên sâu và tài liệu dành riêng cho thành viên VIP."
        />
        <div className="rounded-2xl border border-amber-300 bg-gradient-to-b from-amber-50 to-card p-6 text-center dark:border-amber-800/60 dark:from-amber-950/30">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-400/20">
            <Crown className="h-7 w-7 text-amber-600" />
          </span>
          <p className="mt-3 text-[17px] font-extrabold">Phần này dành cho thành viên VIP</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            Nâng lên VIP để mở toàn bộ bài giảng chuyên sâu, tài liệu triển khai
            và bản ghi các buổi Zoom.
          </p>

          <div className="mt-4 flex flex-col items-center gap-2">
            <Button asChild className="h-11 rounded-full px-6 text-[14.5px] font-extrabold">
              <Link to="/cua-hang">
                Nâng lên VIP
                {goi?.price ? ` — ${Number(goi.price).toLocaleString("vi-VN")}đ` : ""} →
              </Link>
            </Button>
            {/* Link phu ra trang ban ve day du ben trang ban hang. Phai TUYET DOI:
                webapp o ten mien khac, link tuong doi se o lai day va roi vao 404. */}
            <a
              href={BRAND.vipUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Xem chi tiết quyền lợi vé VIP
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------- chi tiet mot khoa
  const selected = khoaVip.find((c) => c.id === selectedId) || null;
  if (selected) {
    const lessons = lessonsOf(selected.id);
    const doneIds = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));

    // Mot bai dang duoc mo -> nhuong ca man hinh cho no.
    const dangXem = lessons.find((l) => l.id === lessonId);
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
          <ArrowLeft className="h-3.5 w-3.5" /> Tất cả khoá VIP
        </button>

        <div className="rounded-2xl border border-border bg-card p-5 lg:p-6">
          <div className="text-base font-bold">{selected.name}</div>
          <div className="mb-4 mt-0.5 text-xs text-muted-foreground">{lessons.length} bài giảng</div>

          <LinkKhoaHoc course={selected} />

          {lessons.length === 0 ? (
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

  // ------------------------------------------------------------ danh sach khoa
  const dangTai = dangTaiGoi || dangTaiKhoa;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Khu vực VIP"
        subtitle="Bài giảng chuyên sâu dành riêng cho thành viên VIP."
      />

      {/* Ca hai nguon deu la loi cua trang nay: thieu goi VIP hay thieu khoa
          hoc thi trang deu vo nghia. Xem QueryState.jsx. */}
      {qGoi.isError || qKhoa.isError ? (
        <ErrorBlock
          error={qGoi.error || qKhoa.error}
          onRetry={() => { qGoi.refetch(); qKhoa.refetch(); }}
        />
      ) : dangTai ? (
        <Loading label="Đang tải khoá VIP..." />
      ) : khoaVip.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="Chưa có khoá VIP nào"
          description="Nội dung VIP sẽ xuất hiện ở đây khi được mở."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {khoaVip.map((c) => {
            const count = lessonsOf(c.id).length;
            return (
              <div key={c.id} className="relative flex flex-col rounded-2xl border border-border bg-card p-5">
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white">
                  <Crown className="h-3 w-3" /> VIP
                </div>
                <div className="mb-3.5 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-neutral-900 text-3xl text-white">
                  {c.thumbnail_url
                    ? <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    : "👑"}
                </div>
                <div className="text-[15px] font-bold">{c.name}</div>
                <div className="mb-4 mt-1 text-xs text-muted-foreground">{count} bài giảng</div>
                <Button className="mt-auto w-full rounded-full" onClick={() => { setSelectedId(c.id); setLessonId(null); }}>
                  Xem khoá học →
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
