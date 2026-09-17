/**
 * Gian hang trong khu vuc thanh vien: ban khoa hoc va goi nang cap VIP, tra
 * bang chuyen khoan ngay tai day.
 *
 * KHONG VIET LAI DUONG DI CUA TIEN. Trang nay chi lam hai viec moi:
 *   1. `chuanBiDatHang` - bao dam nguoi mua co `lead` (vi ca he hoa hong noi
 *      voi nhau qua leads chu khong qua users), va ghi ma gioi thieu neu co
 *   2. Goi `POST /api/orders` san co voi `lead_id` + `product_sku`
 *
 * Tu do tro di moi thu la duong cu, da chay that voi hang chuc don: ma QR
 * VietQR, noi dung SEVQR, webhook ngan hang, fulfilOrder mo quyen truy cap,
 * createCommission sinh hoa hong, thu bao da nhan tien. Khong co gi moi de
 * hong.
 */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShoppingBag, Copy, Check, MessageCircle, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ErrorBlock } from "@/components/QueryState";
import BRAND from "@/brand.generated.js";
import { useMe } from "@/lib/useMe";
import ChonNguoiGioiThieu from "@/components/ChonNguoiGioiThieu";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const tien = (n) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;

/** Man hinh chuyen khoan cho mot don da tao. */
function ManChuyenKhoan({ don, sanPham, onXong, nhacGuiBill = false }) {
  const { toast } = useToast();
  const [daChep, setDaChep] = React.useState("");
  const ck = don?.transfer || {};

  // HAI DUONG ZALO KHAC NHAU, dung o hai thoi diem khac nhau. Doi cho nhau la
  // hong ca hai dau:
  //
  //   truoc khi tien ve -> Zalo RIENG cua chi Thanh, de gui bill nho check tay.
  //     Day la viec mot nguoi phai lam. Day ho vao nhom thi bill roi giua hang
  //     chuc tin nhan va khong ai xu ly.
  //
  //   sau khi tien ve   -> NHOM rieng cua san pham ("Master Skill", "VIP 1-1-1").
  //     Day la cho ngoi lau dai. Nguoi mua Skill khong nen bi day vao nhom cua
  //     nguoi mua VIP.
  const zaloChiThanh = BRAND.supportUrl || "";

  // Hoi lai trang thai don moi 8 giay. Tien ve qua webhook la chuyen xay ra o
  // phia may chu, trang khong tu biet duoc neu khong hoi.
  const { data: moiNhat } = useQuery({
    queryKey: ["don", don?.code],
    queryFn: () => fetch(`/api/orders/${don.code}`).then((r) => r.json()),
    enabled: !!don?.code,
    refetchInterval: 8000,
  });
  const daTra = (moiNhat?.order || moiNhat)?.status === "paid";

  // LAY LAI SAN PHAM SAU KHI TRA TIEN, dung ban chup luc chua mua.
  //
  // `sanPham` truyen vao la ban chup tu danh sach gian hang, lay ve khi nguoi
  // nay CHUA co quyen - luc do may chu da CAT `delivery_url` va `delivery_note`
  // (xem gateByPackage). Dung lai ban do sau khi tra tien thi nut "Mo tai lieu"
  // khong bao gio hien: dung cai thu no sinh ra de lam thi lai hong.
  //
  // Hoi lai moi 3 giay cho toi khi thay link, vi webhook cap quyen o
  // `waitUntil` - don co the da 'paid' vai giay truoc khi quyen kip ghi vao.
  // Thay link roi thi dung han, khong hoi mai.
  const { data: spMoi } = useQuery({
    queryKey: ["san-pham-da-mua", sanPham?.sku],
    queryFn: () => base44.entities.Product.filter({ sku: sanPham.sku }, "sku", 1),
    enabled: daTra && !!sanPham?.sku,
    // Dung khi da thay link, HOAC sau 10 lan hoi (~30 giay). San pham khong co
    // link tai lieu thi hoi mai la hoi mot thu khong bao gio toi.
    refetchInterval: (q) => (
      q.state.data?.[0]?.delivery_url || q.state.dataUpdateCount >= 10 ? false : 3000
    ),
  });
  const spGiao = spMoi?.[0] || sanPham || null;

  const nhomSanPham = spGiao?.zalo_group_url || sanPham?.zalo_group_url || "";

  const chep = async (chu, ten) => {
    try {
      await navigator.clipboard.writeText(chu);
      setDaChep(ten);
      setTimeout(() => setDaChep(""), 1800);
    } catch {
      toast({ title: "Không chép được", description: "Bạn chọn và copy tay giúp mình nhé." });
    }
  };

  const Dong = ({ nhan, giaTri, ten }) => (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-[12px] text-muted-foreground">{nhan}</span>
      <button
        type="button"
        onClick={() => chep(giaTri, ten)}
        className="flex items-center gap-1.5 text-right text-[13.5px] font-bold hover:text-primary"
      >
        <span className="break-all">{giaTri}</span>
        {daChep === ten
          ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          : <Copy className="h-3.5 w-3.5 shrink-0 opacity-50" />}
      </button>
    </div>
  );

  if (daTra) {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
          <Check className="h-7 w-7 text-emerald-600" />
        </span>
        <p className="mt-3 text-[16px] font-extrabold">Đã nhận được thanh toán 🎉</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Quyền truy cập đã mở. Bạn vào xem được ngay.
        </p>

        {/* Giao hang that su. Mot san pham khong phai khoa hoc tren nen tang thi
            "quyen da mo" chang co nghia gi - phai dua duoc ho toi cho nhan. */}
        {spGiao?.delivery_note && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2.5 text-left text-[12.5px] leading-relaxed">
            {spGiao.delivery_note}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {spGiao?.delivery_url && (
            <Button asChild className="h-11 rounded-full font-bold">
              <a href={spGiao.delivery_url} target="_blank" rel="noopener noreferrer">
                Mở tài liệu <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </Button>
          )}
          {nhomSanPham && (
            <Button asChild variant="outline" className="h-11 rounded-full font-bold">
              <a href={nhomSanPham} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" /> Vào nhóm Zalo riêng của {spGiao?.name}
              </a>
            </Button>
          )}
          <Button variant="ghost" className="h-10 rounded-full" onClick={onXong}>Xong</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {ck.qr_url && (
        <img
          src={ck.qr_url}
          alt="Mã QR chuyển khoản"
          className="mx-auto mb-3 h-[220px] w-[220px] rounded-xl border border-border bg-white object-contain p-1"
        />
      )}
      <div className="rounded-xl border border-border bg-muted/30 px-3.5">
        <Dong nhan="Ngân hàng" giaTri={ck.bank_name} ten="bank" />
        <Dong nhan="Số tài khoản" giaTri={ck.account_number} ten="stk" />
        <Dong nhan="Chủ tài khoản" giaTri={ck.account_name} ten="ten" />
        <Dong nhan="Số tiền" giaTri={ck.amount_text || tien(ck.amount)} ten="tien" />
        <Dong nhan="Nội dung" giaTri={ck.content} ten="noidung" />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Giữ <b>đúng nội dung chuyển khoản</b> — hệ thống tự xác nhận trong 1–2 phút và mở
        quyền cho bạn. Trang này tự cập nhật, bạn không cần bấm gì thêm.
      </p>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang chờ tiền về...
      </div>

      {/* Loi thoat khi tu dong khong nhan ra: sai noi dung chuyen khoan, ngan
          hang bao cham, hoac chuyen tu tai khoan doanh nghiep. Khong co nut nay
          thi nguoi da tra tien chi biet ngoi nhin vong xoay. */}
      {zaloChiThanh && (
        <div className={cn(
          "mt-3 border-t border-border pt-3 text-center",
          nhacGuiBill && "rounded-2xl border border-primary/40 bg-primary/5 p-3",
        )}>
          <p className="text-[12.5px] font-semibold">
            {nhacGuiBill
              ? `Đã ghi nhận đơn ${don?.code || ""} cho bạn — giờ gửi bill nhé`
              : "Bạn đã thanh toán rồi?"}
          </p>
          <Button
            asChild
            variant={nhacGuiBill ? "default" : "outline"}
            className="mt-2 h-10 w-full rounded-full text-[13px] font-bold"
          >
            <a href={zaloChiThanh} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Gửi bill về Zalo để mình xác nhận nhé
            </a>
          </Button>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Nhắn riêng cho {BRAND.hostName || "ban tổ chức"} — thường xác nhận trong ít phút.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CuaHang() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dangMua, setDangMua] = React.useState(null);   // san pham dang mua
  const [sdt, setSdt] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [maGT, setMaGT] = React.useState("");
  const [don, setDon] = React.useState(null);
  // Den man hinh chuyen khoan tu nut "da chuyen khoan roi" - nhac ho gui bill.
  const [guiBill, setGuiBill] = React.useState(false);

  const gianHang = useQuery({
    queryKey: ["san-pham"],
    queryFn: () => base44.entities.Product.filter({ is_active: true }, "sort_order", 100),
  });
  const { data: sanPham = [], isLoading } = gianHang;

  const { data: entitlements = [] } = useQuery({
    queryKey: ["entitlements", me?.id],
    queryFn: () => base44.entities.Entitlement.filter({ user_id: me.id }, "-created_date", 200),
    enabled: !!me?.id,
  });

  const mua = useMutation({
    mutationFn: async (sp) => {
      // Buoc 1: bao dam co lead + ghi ma gioi thieu.
      const chuanBi = await base44.functions.invoke("chuanBiDatHang", {
        phone: sdt.trim() || undefined,
        email: email.trim() || undefined,
        ref_code: maGT.trim() || undefined,
      });
      const cb = chuanBi?.data || chuanBi;

      // Buoc 2: dung DUNG duong tao don san co - khong viet lai.
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: cb.lead_id, product_sku: sp.sku }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message || "Không tạo được đơn");
      return { order: data.order, gioi_thieu: cb.gioi_thieu };
    },
    onSuccess: (kq) => {
      setDon(kq.order);
      if (kq.gioi_thieu?.ok) {
        toast({ title: `Đã ghi nhận người giới thiệu: ${kq.gioi_thieu.ten}` });
      } else if (kq.gioi_thieu && !kq.gioi_thieu.ok) {
        toast({ title: "Mã giới thiệu chưa dùng được", description: kq.gioi_thieu.ly_do });
      }
    },
    onError: (err) => toast({
      title: "Chưa đặt được đơn", description: err?.message, variant: "destructive",
    }),
  });

  if (!me) return <Loading />;

  const daCo = (sku) => entitlements.some(
    (e) => e.kind === "package" && e.ref === sku && !e.revoked_at);

  // Cung mot bieu thuc voi validateEmail ben may chu (worker/src/lib/validate.js).
  // Lech nhau thi trang cho bam ma may chu tu choi, hoac nguoc lai - trang chan
  // mot email hop le va nguoi mua khong hieu minh sai o dau.
  const emailSai = !!email.trim() && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim());

  const dongHop = () => {
    setDangMua(null);
    setDon(null);
    setMaGT("");
    setEmail("");
    setGuiBill(false);
    qc.invalidateQueries({ queryKey: ["entitlements", me?.id] });
    // Phai lam moi CA danh sach san pham: truoc khi mua, may chu cat
    // `delivery_url` khoi tung the (gateByPackage). Khong lam moi thi dong het
    // hop thoai la the quay ve trang thai cu - "Da co" ma khong co nut nao.
    qc.invalidateQueries({ queryKey: ["san-pham"] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cửa hàng"
        subtitle="Khoá học và gói nâng cấp — chuyển khoản ngay tại đây."
      />

      {/* Loi tai trang phai KHAC trang thai rong - xem QueryState.jsx. */}
      {gianHang.isError ? (
        <ErrorBlock error={gianHang.error} onRetry={gianHang.refetch} />
      ) : isLoading ? (
        <Loading label="Đang tải sản phẩm..." />
      ) : sanPham.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Cửa hàng chưa có gì"
          description="Sản phẩm sẽ xuất hiện ở đây khi được mở bán."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sanPham.map((sp) => {
            const soHuu = daCo(sp.sku);
            return (
              <div key={sp.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
                {/* object-contain: anh san pham gan nhu luon la poster co chu,
                    cover se xen mat chu o hai mep. */}
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted text-4xl">
                  {sp.image_url
                    ? <img src={sp.image_url} alt="" className="h-full w-full object-contain" />
                    : "🛍️"}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="text-[14.5px] font-bold">{sp.name}</div>
                  {sp.description && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      {sp.description}
                    </p>
                  )}
                  {/* DA MUA ROI thi cai ho can khong phai la chu "Da co", ma la
                      duong quay lai thu ho da mua. Truoc day the nay chi ghi
                      "Da co": link tai lieu hien dung mot lan trong hop thoai
                      luc mua roi bien mat, muon xem lai phai nhan tin hoi. */}
                  {soHuu && (sp.delivery_url || sp.zalo_group_url) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sp.delivery_url && (
                        <Button asChild size="sm" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
                          <a href={sp.delivery_url} target="_blank" rel="noopener noreferrer">
                            Mở tài liệu <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {sp.zalo_group_url && (
                        <Button asChild size="sm" variant="outline" className="h-9 rounded-full px-4 text-[12.5px] font-bold">
                          <a href={sp.zalo_group_url} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-3.5 w-3.5" /> Nhóm Zalo
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                  {soHuu && sp.delivery_note && (
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/50 px-2.5 py-2 text-[11.5px] leading-relaxed">
                      {sp.delivery_note}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                    <span className="font-mono text-[15px] font-extrabold text-primary">
                      {tien(sp.price)}
                    </span>
                    {soHuu ? (
                      <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-600">
                        <Check className="h-3.5 w-3.5" /> Đã có
                      </span>
                    ) : (
                      <Button
                        className="h-9 rounded-full px-5 text-[13px] font-bold"
                        onClick={() => { setDangMua(sp); setSdt(me.phone || ""); setEmail(me.email || ""); }}
                      >
                        Mua
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!dangMua} onOpenChange={(mo) => { if (!mo) dongHop(); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-extrabold">
              {don ? "Chuyển khoản để hoàn tất" : dangMua?.name}
            </DialogTitle>
            {!don && (
              <DialogDescription className="text-[13px]">
                {tien(dangMua?.price)} — chuyển khoản ngân hàng, quyền mở tự động sau 1–2 phút.
              </DialogDescription>
            )}
          </DialogHeader>

          {don ? (
            <ManChuyenKhoan don={don} sanPham={dangMua} onXong={dongHop} nhacGuiBill={guiBill} />
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[12.5px] font-bold">Số điện thoại</span>
                <Input
                  value={sdt}
                  onChange={(e) => setSdt(e.target.value)}
                  placeholder="09xx xxx xxx"
                  className="mt-1.5 rounded-xl"
                />
                <span className="mt-1 block text-[11.5px] text-muted-foreground">
                  Để liên hệ khi cần — và để ghi nhận đơn cho đúng bạn.
                </span>
              </label>

              <label className="block">
                <span className="text-[12.5px] font-bold">Email</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@example.com"
                  className={cn("mt-1.5 rounded-xl", emailSai && "border-destructive")}
                  aria-invalid={emailSai}
                />
                <span className="mt-1 block text-[11.5px] text-muted-foreground">
                  {emailSai
                    ? "Email chưa đúng định dạng."
                    : "Thư xác nhận gửi về đây, và quyền cũng mở cho đúng tài khoản này."}
                </span>
              </label>

              <ChonNguoiGioiThieu ma={maGT} onChon={setMaGT} />

              <Button
                className="h-11 w-full rounded-full text-[14.5px] font-extrabold"
                disabled={mua.isPending || emailSai || !email.trim()}
                onClick={() => mua.mutate(dangMua)}
              >
                {mua.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : `Tạo đơn ${tien(dangMua?.price)} →`}
              </Button>

              {/* Loi thoat cho nguoi DA chuyen tien roi moi mo lai trang.
                  NHUNG no phai di qua dung buoc tao don: hoa hong bam vao DON,
                  ma don chi sinh ra o nut tren. Ban cu la mot the <a> tro thang
                  sang Zalo - ai bam vao day thay vi nut hong thi khong co don
                  nao, khong co nguoi gioi thieu nao, va chi Thanh cung khong co
                  gi de bam xac nhan. Ho van chuyen tien that, va lo hong do im
                  lang tuyet doi. Nen o day tao don truoc, roi moi sang Zalo. */}
              {BRAND.supportUrl && (
                <div className="border-t border-border pt-3 text-center">
                  <p className="text-[12.5px] font-semibold">Bạn đã chuyển khoản rồi?</p>
                  <Button
                    variant="outline"
                    className="mt-2 h-10 w-full rounded-full text-[13px] font-bold"
                    disabled={mua.isPending || emailSai || !email.trim()}
                    onClick={() => mua.mutate(dangMua, { onSuccess: () => setGuiBill(true) })}
                  >
                    {mua.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><MessageCircle className="mr-1.5 h-4 w-4" /> Ghi nhận đơn rồi gửi bill về Zalo</>}
                  </Button>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    Mình ghi nhận đơn trước để đối chiếu với tiền đã về, rồi mở Zalo cho bạn gửi bill.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

