/**
 * Hop thoai bat len giua man hinh cho thong bao QUAN TRONG.
 *
 * VI SAO CAN: nhung thu co han gio - link Zoom mo luc 9:00, khung diem danh chi
 * 15 phut - ma nam trong chuong thong bao thi nguoi hoc phai NHO bam vao chuong
 * moi thay. Voi 347 nguoi, phan lon vao bang dien thoai, cai chuong do la mot
 * cho khong ai ghe qua. Thong bao nao chi Thanh danh dau `type = 'popup'` thi
 * hien thang, khong bam gi cung thay.
 *
 * Chi hien MOT cai moi nhat. Ba hop thoai chong len nhau thi nguoi ta bam tat
 * theo phan xa, va cai quan trong nhat bien mat cung ba cai kia.
 *
 * Bam tat = danh dau da doc, nen no khong quay lai o lan tai trang sau. Thong
 * bao van con nguyen trong chuong de doc lai.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

export default function ThongBaoNoiBat({ notifications = [], onDaDoc }) {
  const navigate = useNavigate();
  const [daTat, setDaTat] = useState(() => new Set());

  const tin = notifications.find((n) => n.type === "popup" && !daTat.has(n.id));

  // Danh sach thong bao tai lai sau moi lan ghi hoat dong; neu mot tin da tat
  // van con trong danh sach do (chua kip ghi is_read) thi khong duoc hien lai.
  useEffect(() => {
    if (!notifications.length) setDaTat(new Set());
  }, [notifications.length]);

  if (!tin) return null;

  const dong = async () => {
    setDaTat((truoc) => new Set(truoc).add(tin.id));
    try {
      await base44.entities.Notification.update(tin.id, { is_read: true });
      onDaDoc?.();
    } catch { /* khong ghi duoc thi thoi - hop thoai van dong lai */ }
  };

  const laLinkNgoai = /^https?:\/\//i.test(tin.link || "");

  const diToi = async () => {
    // Mo tab moi TRUOC khi await: trinh duyet chan window.open goi sau mot
    // await vi luc do no khong con coi la "do nguoi dung bam".
    if (laLinkNgoai) window.open(tin.link, "_blank", "noopener,noreferrer");
    await dong();
    if (!laLinkNgoai && tin.link) navigate(tin.link);
  };

  return (
    <Dialog open onOpenChange={(mo) => { if (!mo) dong(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold leading-snug">{tin.title}</DialogTitle>
          {!!tin.body && (
            <DialogDescription className="whitespace-pre-line pt-1 text-[13.5px] leading-relaxed">
              {tin.body}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-1 flex flex-col gap-2">
          {!!tin.link && (
            <Button className="h-11 w-full rounded-full text-[14.5px] font-extrabold" onClick={diToi}>
              {laLinkNgoai ? "Mở link ngay →" : "Xem ngay →"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-9 w-full rounded-full text-[13px] text-muted-foreground"
            onClick={dong}
          >
            Để sau
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
