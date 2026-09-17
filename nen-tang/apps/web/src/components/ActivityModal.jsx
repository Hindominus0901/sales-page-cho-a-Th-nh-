import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Phone, BookCheck, Sparkles, X, Loader2, Check, ImagePlus, Trash2, ListChecks } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Image } from "@/components/ui/image";
import { useKhaNang } from "@/lib/useKhaNang";
import ODanLinkAnh from "@/components/ODanLinkAnh";

// Biểu tượng và màu cho những loại quen thuộc. Danh sách loại THẬT lấy từ
// máy chủ, không viết cứng ở đây: trước đây ba mục này cố định trong mã, nên khi
// quản trị viên tắt một mục trong trang quản trị thì nút vẫn hiện, bấm vào
// chỉ nhận được "Loại hoạt động không tồn tại" — một ngõ cụt không ai hiểu.
const MAT_NA = {
  content: { icon: FileText, color: "#FF0FA3" },
  call: { icon: Phone, color: "#F4B400" },
  assignment: { icon: BookCheck, color: "#C9804D" },
};
const MAC_DINH = { icon: ListChecks, color: "#7C7C7C" };

export default function ActivityModal({ open, onOpenChange, onLogged }) {
  const [selected, setSelected] = useState(null);
  const [loaiHD, setLoaiHD] = useState([]);
  const [typeDetail, setTypeDetail] = useState(null);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], title: "", description: "", evidence_link: "", screenshot_url: "" });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const { toast } = useToast();
  const { khaNang } = useKhaNang();

  const reset = () => {
    setSelected(null); setTypeDetail(null); setSuccess(null);
    setForm({ date: new Date().toISOString().split("T")[0], title: "", description: "", evidence_link: "", screenshot_url: "" });
  };

  // Danh sách loại đang bật, lấy từ máy chủ mỗi lần mở hộp thoại.
  useEffect(() => {
    if (!open) return;
    base44.entities.ActivityType.filter({ is_active: true })
      .then((ds) => setLoaiHD((Array.isArray(ds) ? ds : [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((t) => ({
          key: t.key,
          label: t.name,
          desc: t.description || "",
          ...(MAT_NA[t.key] || MAC_DINH),
        }))))
      .catch(() => setLoaiHD([]));
  }, [open]);

  // Khi chọn loại hoạt động, lấy chi tiết (để hiển thị tiêu chí AI)
  useEffect(() => {
    if (!selected) { setTypeDetail(null); return; }
    base44.entities.ActivityType.filter({ key: selected.key }).then((types) => {
      setTypeDetail(types[0] || null);
    });
  }, [selected]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, screenshot_url: file_url }));
      toast({ title: "Ảnh đã tải lên" });
    } catch (err) {
      toast({ title: "Tải ảnh thất bại", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("logActivity", {
        activity_type_key: selected.key,
        date: form.date,
        title: form.title || selected.label,
        description: form.description,
        evidence_link: form.evidence_link,
        screenshot_url: form.screenshot_url
      });
      const data = res.data || res;
      if (data.awarded) {
        setSuccess(data.awarded);
        toast({ title: `+${data.awarded.xp} XP · +${data.awarded.coin} Xu`, description: "Hoạt động đã được ghi nhận!" });
      } else if (data.autoApprove === false) {
        setSuccess({ pending: true });
        toast({ title: "Đã ghi nhận", description: "Hoạt động đang chờ Admin duyệt." });
      } else {
        toast({ title: "Đã ghi nhận", description: "Hoạt động đã được lưu." });
      }
      if (onLogged) onLogged();
    } catch (e) {
      toast({ title: "Lỗi", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { reset(); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Ghi nhận hoạt động</DialogTitle>
          <DialogDescription>Chọn loại hoạt động bạn vừa hoàn thành</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center py-8 text-center gap-4">
            {success.pending ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                  <div className="text-lg font-bold">Đang chờ duyệt</div>
                  <div className="text-sm text-muted-foreground">Hoạt động sẽ được cộng điểm sau khi Admin phê duyệt.</div>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">+{success.xp} XP · +{success.coin} Xu</div>
                  <div className="text-sm text-muted-foreground mt-1">🔥 Chuỗi: {success.streak} ngày liên tục</div>
                </div>
              </>
            )}
            <Button onClick={handleClose} className="mt-2 rounded-full px-8">Hoàn tất</Button>
          </div>
        ) : !selected ? (
          loaiHD.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Hiện chưa có mục hoạt động nào đang mở.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 py-2">
            {loaiHD.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelected(t)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border hover:border-primary hover:bg-accent/50 transition-all"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${t.color}15`, color: t.color }}>
                  <t.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-[11px] text-muted-foreground text-center leading-tight">{t.desc}</span>
              </button>
            ))}
          </div>
          )
        ) : (
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: `${selected.color}10` }}>
              <selected.icon className="w-5 h-5" style={{ color: selected.color }} />
              <span className="font-semibold">{selected.label}</span>
              <button onClick={() => setSelected(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tiêu chí chấm điểm AI */}
            {typeDetail?.ai_criteria && (
              <div className="p-3 rounded-xl bg-accent/60 border border-border">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground mb-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Tiêu chí AI chấm điểm
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{typeDetail.ai_criteria}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Ngày thực hiện</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">Tiêu đề</Label>
                <Input placeholder="VD: Bài viết về sản phẩm X" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">Mô tả / ghi chú</Label>
                <Input placeholder="Mô tả ngắn về bài nộp" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" />
              </div>

              {/* Upload ảnh minh chứng */}
              <div>
                <Label className="text-xs">Ảnh minh chứng (bài nộp)</Label>
                {form.screenshot_url ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <Image src={form.screenshot_url} alt="minh chứng" fittingType="fill" className="w-full h-40" />
                    <button
                      onClick={() => setForm({ ...form, screenshot_url: "" })}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  /* HAI duong vao, khong phai mot.
                   *
                   * Truoc day o day CHI co o keo tha tep. Khi kho anh tat (R2
                   * chua bat) thi POST /api/files tra 503, va may chu bao nguoi
                   * dung "dan link anh vao o ben canh" - mot o KHONG TON TAI o
                   * day. Ma bang chung lai la BAT BUOC (xem logActivity trong
                   * worker/src/functions/index.js), nen hoc vien chi co anh
                   * trong may la het duong nop bai. Day la ngo cut kin nhat
                   * trong ca san pham: khong bao loi nao noi ra rang khong con
                   * cach nao khac. */
                  <div className="space-y-2">
                    {khaNang.uploads && (
                      <label className="flex flex-col items-center justify-center gap-1.5 h-28 rounded-xl border-2 border-dashed border-border cursor-pointer hover:border-primary hover:bg-accent/40 transition-color">
                        {uploading ? (
                          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                        ) : (
                          <>
                            <ImagePlus className="w-5 h-5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Tải ảnh lên từ máy</span>
                          </>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                      </label>
                    )}
                    <ODanLinkAnh
                      value={form.screenshot_url}
                      onChange={(v) => setForm((f) => ({ ...f, screenshot_url: v }))}
                      nhan="Link ảnh minh chứng"
                      khoAnhTat={!khaNang.uploads}
                    />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Link bằng chứng (tùy chọn)</Label>
                <Input placeholder="https://..." value={form.evidence_link} onChange={(e) => setForm({ ...form, evidence_link: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={loading || uploading} className="w-full rounded-full h-11">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-1" /> Ghi nhận</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}