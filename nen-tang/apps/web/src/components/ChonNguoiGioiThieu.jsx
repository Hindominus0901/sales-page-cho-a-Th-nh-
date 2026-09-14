/**
 * O tim va chon nguoi gioi thieu: go ten, chon tu danh sach tha xuong.
 *
 * VI SAO KHONG DE NGUOI TA GO MA: ma gioi thieu la thu do he thong sinh ra
 * (kieu THANHK7D), khong ai nho, va go sai mot ky tu la nguoi gioi thieu mat
 * hoa hong ma khong ai biet. Nguoi mua nho TEN cua nguoi ru minh vao, nen cho
 * ho tim bang ten.
 *
 * Email hien ra bi CHE mot phan - du de phan biet hai nguoi trung ten, khong
 * du de ai do gom danh sach 439 dia chi hoc vien. Xem timNguoiGioiThieu o
 * worker/src/functions/index.js.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function ChonNguoiGioiThieu({
  ma,
  onChon,
  nhan = "Ai giới thiệu bạn?",
  ghiChuDaChon = "Người này sẽ được ghi nhận hoa hồng cho đơn của bạn.",
}) {
  const [tu, setTu] = React.useState("");
  const [moDs, setMoDs] = React.useState(false);
  const [daChon, setDaChon] = React.useState(null);

  // Cho go xong roi moi hoi - go 8 chu la 8 lan goi mang neu khong cho.
  const [tuHoi, setTuHoi] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setTuHoi(tu.trim()), 300);
    return () => clearTimeout(t);
  }, [tu]);

  const { data, isFetching } = useQuery({
    queryKey: ["tim-gioi-thieu", tuHoi],
    queryFn: () => base44.functions.invoke("timNguoiGioiThieu", { q: tuHoi }),
    enabled: tuHoi.length >= 2 && !daChon,
  });
  const ds = (data?.data || data)?.ds || [];

  const chon = (x) => {
    setDaChon(x);
    setMoDs(false);
    setTu("");
    onChon(x.code);
  };

  const boChon = () => {
    setDaChon(null);
    onChon("");
  };

  return (
    <div className="block">
      <span className="text-[12.5px] font-bold">{nhan}</span>

      {daChon ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{daChon.ten}</span>
            </span>
            <span className="mt-0.5 block pl-5 text-[11.5px] text-muted-foreground">
              {daChon.email_che} · mã {daChon.code}
            </span>
          </span>
          <button
            type="button"
            onClick={boChon}
            aria-label="Bỏ chọn người giới thiệu"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={tu}
            onChange={(e) => { setTu(e.target.value); setMoDs(true); }}
            onFocus={() => setMoDs(true)}
            placeholder="Gõ tên người giới thiệu — không có thì bỏ trống"
            className="rounded-xl pl-9"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}

          {moDs && tu.trim().length >= 2 && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
              {ds.length === 0 ? (
                <p className="px-3 py-3 text-[12.5px] text-muted-foreground">
                  {isFetching ? "Đang tìm..." : "Không tìm thấy ai khớp. Thử gõ ít chữ hơn."}
                </p>
              ) : ds.map((x) => (
                <button
                  key={x.code}
                  type="button"
                  onClick={() => chon(x)}
                  className={cn(
                    "block w-full border-b border-border px-3 py-2 text-left last:border-0",
                    "hover:bg-secondary",
                  )}
                >
                  <span className="block truncate text-[13.5px] font-semibold">{x.ten}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {x.email_che} · mã {x.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <span className="mt-1 block text-[11.5px] text-muted-foreground">
        {daChon
          ? ghiChuDaChon
          : "Gõ ít nhất 2 chữ. Bỏ trống nếu không ai giới thiệu bạn."}
      </span>
      {/* Giu ma trong mot o an: nguoi dung khong go ma, nhung form van gui ma. */}
      <input type="hidden" value={ma || ""} readOnly />
    </div>
  );
}
