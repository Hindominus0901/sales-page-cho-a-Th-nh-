/**
 * O chon nhom cua hoc vien - dung o Dashboard, Challenge va trang Ho so.
 *
 * VI SAO CO: chia nhom dien ra tren Zoom, roi phai ghi lai len nen tang. Chia
 * tay 451 nguoi trong trang quan tri la khong lam noi, con tai file gan san
 * phong cua Zoom thi khop theo email nguoi do dang nhap Zoom - rat nhieu nguoi
 * vao khong dang nhap nen truot. Nguoi biet ro nhat minh o nhom nao chinh la
 * ho: de ho tu chon, khong ai phai go gi.
 *
 * KHOI NAY LUON HIEN, ke ca khi da co nhom - de nguoi ta nhin thay minh dang o
 * dau va sua duoc khi bam nham. Truoc day no tu bien mat sau lan chon dau tien,
 * va nguoi bam nham khong con duong nao ngoai nhan Zalo.
 *
 * Nhom da day van nam trong danh sach nhung khong chon duoc: bo han ra thi
 * nguoi ta tuong nhom do khong ton tai va di hoi.
 */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe, ME_KEY } from "@/lib/useMe";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function ChonNhom({ className }) {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();

  const nhom = useQuery({
    queryKey: ["nhom-de-chon"],
    queryFn: () => base44.functions.invoke("danhSachNhom", {}),
  });

  const chon = useMutation({
    mutationFn: (teamId) => base44.functions.invoke("chonNhom", { team_id: teamId }),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ["nhom-de-chon"] });
      if (!d?.khong_doi) toast({ title: `Đã vào ${d?.team?.name || "nhóm"} 🎉` });
    },
    onError: (err) => {
      // Tai lai danh sach: loi hay gap nhat la "nhom da day", va so cho tren man
      // hinh luc do da cu.
      qc.invalidateQueries({ queryKey: ["nhom-de-chon"] });
      toast({
        title: "Chưa đổi được nhóm",
        description: err?.message || "Thử lại giúp mình nhé.",
        variant: "destructive",
      });
    },
  });

  const ds = (nhom.data?.data || nhom.data)?.teams || [];
  if (!nhom.isLoading && ds.length === 0) return null;

  const nhomCuaToi = me?.team_id || "";
  const tenNhom = ds.find((t) => t.id === nhomCuaToi)?.name;

  return (
    <div className={cn(
      "rounded-2xl border p-4 sm:p-5",
      nhomCuaToi ? "border-border bg-card" : "border-primary/30 bg-primary/5",
      className,
    )}>
      <div className="flex items-start gap-3">
        <span className={cn(
          "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
          nhomCuaToi ? "bg-emerald-500/15" : "bg-primary/15",
        )}>
          {nhomCuaToi
            ? <Check className="h-[18px] w-[18px] text-emerald-600" />
            : <Users2 className="h-[18px] w-[18px] text-primary" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-extrabold">
            {nhomCuaToi ? `Bạn đang ở ${tenNhom || "một nhóm"}` : "Chọn nhóm của bạn"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {nhomCuaToi
              ? "Chọn nhóm khác nếu bạn bấm nhầm."
              : "Chọn đúng nhóm bạn đã được chia trên Zoom."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={nhomCuaToi}
              disabled={chon.isPending || nhom.isLoading}
              onChange={(e) => e.target.value && chon.mutate(e.target.value)}
              className={cn(
                "h-10 min-w-[190px] rounded-xl border border-border bg-background px-3",
                "text-[13.5px] font-semibold outline-none focus:ring-2 focus:ring-primary/40",
                "disabled:opacity-60",
              )}
            >
              <option value="">— Chọn nhóm —</option>
              {ds.map((t) => {
                const day = !t.con_cho && t.id !== nhomCuaToi;
                const conLai = t.capacity > 0
                  ? Math.max(0, Number(t.capacity) - Number(t.so_nguoi))
                  : null;
                return (
                  <option key={t.id} value={t.id} disabled={day}>
                    {t.name}
                    {day ? " — đã đủ người" : conLai != null ? ` — còn ${conLai} chỗ` : ""}
                  </option>
                );
              })}
            </select>

            {chon.isPending && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...
              </span>
            )}
          </div>

          {!nhomCuaToi && (
            <p className="mt-2.5 text-[11.5px] text-muted-foreground">
              Chưa chọn cũng không sao — cuối chương trình quản trị viên sẽ xếp giúp bạn.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
