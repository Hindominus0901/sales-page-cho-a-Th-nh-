import React, { useState, useEffect } from "react";
import { streakDangSong } from "@/lib/streak";
import MatPhien from '@/components/MatPhien';
import { useOutletContext } from "react-router-dom";
import ChonNhom from "@/components/ChonNhom";
import { base44 } from "@/api/base44Client";
import { useKhaNang } from "@/lib/useKhaNang";
import ODanLinkAnh from "@/components/ODanLinkAnh";
import Avatar from "@/components/Avatar";
import StatCard from "@/components/StatCard";
import { computeLevel, getInitials } from "@/lib/gamification";
import { Zap, Coins, Trophy, Flame, Pencil, Check, X, Award, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function Profile() {
  const { khaNang } = useKhaNang();
  const { user, onUserUpdate } = useOutletContext();
  const [levels, setLevels] = useState([]);
  const [myBadges, setMyBadges] = useState([]);
  const [activities, setActivities] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", avatar_url: "", phone: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    setForm({ full_name: user.full_name || "", avatar_url: user.avatar_url || "", phone: user.phone || "", bio: user.bio || "" });
    Promise.all([
      base44.entities.Level.list("level_number", 20),
      base44.entities.UserBadge.filter({ user_id: user.id }),
      base44.entities.Activity.filter({ user_id: user.id })
    ]).then(([lvls, bgs, acts]) => {
      setLevels(lvls || []);
      setMyBadges(bgs || []);
      setActivities((acts || []).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    });
  }, [user]);

  // Het phien giua chung thi noi that, dung tra ve man hinh trang. Xem MatPhien.
  if (!user) return <MatPhien />;
  const level = computeLevel(user.total_xp || 0, levels);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: form.full_name, avatar_url: form.avatar_url, phone: form.phone, bio: form.bio });
      toast({ title: "Đã lưu", description: "Profile đã được cập nhật." });
      setEditing(false);
      if (onUserUpdate) onUserUpdate();
    } catch (e) {
      toast({ title: "Lỗi", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s) => ({
    pending: { label: "Chờ duyệt", cls: "bg-amber-50 text-amber-600" },
    approved: { label: "Đã duyệt", cls: "bg-green-50 text-green-600" },
    rejected: { label: "Từ chối", cls: "bg-red-50 text-red-600" }
  })[s] || { label: s, cls: "bg-muted" };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-card rounded-3xl border border-border p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar user={{ ...user, avatar_url: form.avatar_url || user.avatar_url, full_name: form.full_name || user.full_name }} size={96} ring ringColor="hsl(var(--primary))" showLevel levelNumber={level.levelNumber} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h1 className="text-2xl font-bold">{user.full_name}</h1>
              <button onClick={() => setEditing(!editing)} className="text-muted-foreground hover:text-primary">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-primary font-medium mt-1">{level.icon} Level {level.levelNumber} · {level.name}</div>
            <div className="text-sm text-muted-foreground mt-1">{user.email}</div>
            {user.bio && <p className="text-sm text-muted-foreground mt-2 max-w-md">{user.bio}</p>}
          </div>
        </div>

        {editing && (
          <div className="mt-6 pt-6 border-t border-border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Họ tên</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">Số điện thoại</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Ảnh đại diện</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden border border-border bg-accent flex items-center justify-center shrink-0">
                  {form.avatar_url ? (
                    <img src={form.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold text-muted-foreground">{getInitials(form.full_name || "?")}</span>
                  )}
                </div>
                {khaNang.uploads ? (
                  <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: "Ảnh quá lớn", description: "Kích thước tối đa 5MB.", variant: "destructive" });
                        return;
                      }
                      setUploading(true);
                      try {
                        const { file_url } = await base44.integrations.Core.UploadFile({ file });
                        setForm((f) => ({ ...f, avatar_url: file_url }));
                      } catch (err) {
                        toast({ title: "Tải lên thất bại", description: err.message, variant: "destructive" });
                      } finally {
                        setUploading(false);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? "Đang tải..." : form.avatar_url ? "Đổi ảnh" : "Tải ảnh lên"}
                  </Button>
                  {form.avatar_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted-foreground"
                      onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))}
                    >
                      Xóa
                    </Button>
                  )}
                  </>
                ) : (
                  <ODanLinkAnh
                    value={form.avatar_url}
                    onChange={(v) => setForm((f) => ({ ...f, avatar_url: v }))}
                    nhan="Link ảnh đại diện"
                  />
                )}
              </div>
              {khaNang.uploads && (
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG — tối đa 5MB</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Bio</Label>
              <Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="rounded-xl" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="rounded-full"><Check className="w-4 h-4 mr-1" /> Lưu</Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="rounded-full"><X className="w-4 h-4 mr-1" /> Hủy</Button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard icon={Zap} label="XP" value={(user.total_xp || 0).toLocaleString('vi-VN')} accent="327 100% 53%" />
        <StatCard icon={Coins} label="Xu" value={(user.total_coin || 0).toLocaleString('vi-VN')} accent="23 53% 55%" />
        <StatCard icon={Flame} label="Streak" value={`${streakDangSong(user)}`} sublabel={`Tối đa: ${user.longest_streak || 0}`} accent="0 84% 60%" />
        <StatCard icon={Trophy} label="Huy hiệu" value={`${myBadges.length}`} accent="44 100% 48%" />
      </div>

      {/* Chi giu "Bai tap" - mot trong ba tieu chi thi dua. Hai o "Content" va
          "Cuoc goi" da bo theo yeu cau cua chi Thanh; cot du lieu van con trong
          database, chi khong hien ra nua. */}
      <div className="bg-card rounded-2xl border border-border p-4 text-center">
        <div className="text-2xl font-bold">{user.assignment_count || 0}</div>
        <div className="text-xs text-muted-foreground">Bài tập đã nộp</div>
      </div>

      {/* Badges */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-bold flex items-center gap-2 mb-4"><Award className="w-4 h-4 text-primary" /> Huy hiệu của tôi</h2>
        {myBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có huy hiệu. Hãy hành động để nhận!</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {myBadges.map((b) => (
              <div key={b.id} className="flex flex-col items-center gap-1 w-20 text-center">
                <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-2xl">{b.badge_icon}</div>
                <span className="text-xs font-medium leading-tight">{b.badge_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity History */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="font-bold flex items-center gap-2 mb-4"><History className="w-4 h-4 text-primary" /> Lịch sử hoạt động</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Chưa có hoạt động nào.</p>
          ) : activities.slice(0, 30).map((a) => {
            const sb = statusBadge(a.status);
            return (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent/30">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.activity_type_name} · {new Date(a.date).toLocaleDateString('vi-VN')}</div>
                </div>
                {a.xp_awarded > 0 && <span className="text-xs font-bold text-primary">+{a.xp_awarded} XP</span>}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}