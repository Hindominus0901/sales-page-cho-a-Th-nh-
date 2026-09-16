import BRAND from '@/brand.generated.js';
import MatPhien from '@/components/MatPhien';
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Users, TrendingUp, GraduationCap, Trophy, Gift, Award,
  Target, Share2, Bell, LogOut, Menu, X, Flame, Coins, Sparkles, Shield, CalendarDays, UserRound,
  Crown, ShoppingBag, MessagesSquare,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useMe } from "@/lib/useMe";
import Avatar from "./Avatar";
import ActivityModal from "./ActivityModal";
import ThongBaoNoiBat from "./ThongBaoNoiBat";
import { cn } from "@/lib/utils";
import { streakDangSong } from "@/lib/streak";

/**
 * Khung chung cua app hoc vien.
 *
 * Thu tu va ten muc lay dung theo navConfig trong ban thiet ke - doi thu tu o
 * day la doi ca thanh ben va thanh duoi tren dien thoai.
 */
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/journey", label: "Hành trình", icon: TrendingUp },
  { to: "/courses", label: "Lớp học", icon: GraduationCap },
  { to: "/lop-vip", label: "Khu vực VIP", icon: Crown },
  { to: "/leaderboard", label: "Bảng xếp hạng", icon: Trophy },
  { to: "/rewards", label: "Đổi quà", icon: Gift },
  { to: "/cua-hang", label: "Cửa hàng", icon: ShoppingBag },
  { to: "/badges", label: "Huy hiệu & Rank", icon: Award },
  { to: "/challenges", label: "Challenge", icon: Target },
  { to: "/community", label: "Cộng đồng", icon: MessagesSquare },
  { to: "/calendar", label: "Lịch & sự kiện", icon: CalendarDays },
  { to: "/affiliate", label: "Affiliate", icon: Share2 },
  { to: "/profile", label: "Hồ sơ của tôi", icon: UserRound },
];

/** Nam muc hay dung nhat, hien o thanh duoi man hinh dien thoai. */
const MOBILE_NAV = ["/dashboard", "/challenges", "/leaderboard", "/rewards"];

const QUOTES = [
  "Đừng cố làm mọi thứ. Hãy hoàn thành những việc tạo ra kết quả.",
  "Một người, một laptop, một hệ thống — phần còn lại là kỷ luật.",
  "Làm ít việc hơn, nhưng làm đúng việc.",
  "Thứ bạn làm mỗi ngày quan trọng hơn thứ bạn làm thỉnh thoảng.",
  "Bắt đầu trước khi thấy sẵn sàng.",
  "Hệ thống tốt bền hơn động lực tốt.",
  "Việc khó hôm nay là lợi thế của bạn ngày mai.",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Doi cau moi ngay chu khong doi moi lan tai trang - de no la "cau cua hom nay". */
function quoteOfTheDay() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start) / 86400000);
  return QUOTES[day % QUOTES.length];
}

const nf = new Intl.NumberFormat("vi-VN");

export default function AppLayout() {
  // Doc nguoi dung qua useMe (react-query) chu KHONG qua AuthContext.
  //
  // Hai cho nay tung la hai ban sao khac nhau: trang Doi qua invalidate ['me']
  // nen so xu tren trang doi ngay, con so xu o thanh tren van la so cu cho den
  // luc tai lai trang. Nguoi vua tra 20 xu nhin len goc thay so chua tru - va
  // ho nghi minh mat xu ma khong duoc gi.
  const { checkUserAuth } = useAuth();
  const user = useMe();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [levels, setLevels] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  // Hop "Ghi nhan hoat dong" song o day chu khong o tung trang: nut mo no nam
  // tren Dashboard, nhung sau nay con muon mo tu thanh duoi hay tu trang khac.
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    base44.entities.Level.list("level_number", 20).then(setLevels).catch(() => {});
  }, []);

  // Tach ra khoi useEffect de con goi lai sau khi ghi hoat dong - luc do backend
  // vua sinh thong bao "da nhan +20 XP", chuong phai sang len ngay.
  const loadNotifications = useCallback(() => {
    if (!user) return;
    base44.entities.Notification
      .filter({ user_id: user.id, is_read: false })
      .then(setNotifications)
      .catch(() => {});
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Cap bac doc tu database, KHONG viet cung moc XP vao giao dien - admin doi
  // moc trong trang "Co che" luc nao cung duoc.
  const level = useMemo(() => {
    if (!levels.length || !user) return null;
    return [...levels].reverse().find((l) => (user.total_xp || 0) >= l.threshold_xp) || levels[0];
  }, [levels, user]);

  const nextLevel = useMemo(() => {
    if (!levels.length || !user) return null;
    return levels.find((l) => l.threshold_xp > (user.total_xp || 0)) || null;
  }, [levels, user]);

  const markNotificationsRead = async () => {
    setShowNotif(false);
    if (!notifications.length) return;
    try {
      await base44.entities.Notification.updateMany(
        { user_id: user.id, is_read: false },
        { $set: { is_read: true } },
      );
      setNotifications([]);
    } catch { /* khong doc duoc thi thoi, khong chan nguoi dung */ }
  };

  const handleLogout = async () => {
    await base44.auth.logout();
    navigate("/login");
  };

  // Het phien giua chung thi noi that, dung tra ve man hinh trang. Xem MatPhien.
  if (!user) return <MatPhien />;

  const isAdmin = user.role === "admin";

  const navLinks = (onClick) => NAV.map(({ to, label, icon: Icon, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  ));

  const rankCard = (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Rank hiện tại
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-2xl leading-none">{level?.icon || "🌱"}</span>
        <div className="min-w-0">
          <div className="truncate font-extrabold">{level?.name || "Đồng"}</div>
          <div className="text-xs text-muted-foreground">
            {nf.format(user.total_xp || 0)} XP
          </div>
        </div>
      </div>
      {nextLevel && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Còn {nf.format(nextLevel.threshold_xp - (user.total_xp || 0))} XP lên {nextLevel.name}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Thanh ben - man hinh lon */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="p-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">
              {BRAND.name.slice(0, 5)}
            </span>
            <span className="font-extrabold tracking-tight">{BRAND.productLine}</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {navLinks()}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => cn(
                "mt-2 flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-semibold",
                isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <Shield className="h-[18px] w-[18px] shrink-0" />
              Chế độ Admin
            </NavLink>
          )}
        </nav>

        <div className="p-3">{rankCard}</div>
      </aside>

      {/* Ngan keo - man hinh nho */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-extrabold">{BRAND.productLine}</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {navLinks(() => setMobileOpen(false))}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground"
                >
                  <Shield className="h-[18px] w-[18px]" /> Chế độ Admin
                </NavLink>
              )}
            </nav>
            <div className="pt-3">{rankCard}</div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Thanh tren */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
            <button
              type="button"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate font-extrabold">
                {greeting()}, {user.full_name || "bạn"}
              </div>
              <div className="hidden truncate text-xs italic text-muted-foreground sm:block">
                “{quoteOfTheDay()}”
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground"
                title="Chuỗi ngày hoạt động liên tục"
              >
                <Flame className="h-3.5 w-3.5" /> {streakDangSong(user)}
              </span>
              <span
                className="hidden items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground sm:flex"
                title="Xu dùng để đổi quà"
              >
                <Coins className="h-3.5 w-3.5" /> {nf.format(user.total_coin || 0)}
              </span>
              <span
                className="hidden items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground sm:flex"
                title="Điểm kinh nghiệm"
              >
                <Sparkles className="h-3.5 w-3.5" /> {nf.format(user.total_xp || 0)} XP
              </span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => (showNotif ? markNotificationsRead() : setShowNotif(true))}
                  className="relative rounded-full p-2 hover:bg-secondary"
                  aria-label="Thông báo"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {notifications.length > 0 && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
                {showNotif && (
                  <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                    <div className="border-b border-border px-4 py-2.5 text-sm font-bold">
                      Thông báo
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                          Chưa có thông báo nào.
                        </p>
                      ) : notifications.map((n) => (
                        <div key={n.id} className="border-b border-border px-4 py-3 last:border-0">
                          <div className="text-sm font-semibold">{n.title}</div>
                          {n.body && (
                            <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={markNotificationsRead}
                      className="w-full border-t border-border px-4 py-2.5 text-sm font-semibold text-primary hover:bg-secondary"
                    >
                      Đánh dấu đã đọc
                    </button>
                  </div>
                )}
              </div>

              <Link to="/profile" aria-label="Hồ sơ của tôi">
                <Avatar user={user} size={34} />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pb-24 pt-5 lg:px-6 lg:pb-10">
          <Outlet context={{
            user, level, nextLevel, levels,
            onActivityClick: () => setActivityOpen(true),
            onUserUpdate: checkUserAuth,
          }} />
        </main>
      </div>

      {/* Thanh duoi - man hinh nho */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-card lg:hidden">
        {NAV.filter((n) => MOBILE_NAV.includes(n.to)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* SupportChat (tro ly AI) CO Y khong gan o day. No goi /api/agents/* -
          duong dan do khong co handler nao trong worker, tra 404, va
          ANTHROPIC_API_KEY cung chua duoc dat. De nut noi tren moi trang thi
          nguoi hoc dau tien bam vao se nghi ca nen tang hong. Viet handler va
          dat khoa xong thi gan lai mot dong: <SupportChat />. */}
      <ActivityModal
        open={activityOpen}
        onOpenChange={setActivityOpen}
        onLogged={() => { checkUserAuth(); loadNotifications(); }}
      />
      <ThongBaoNoiBat notifications={notifications} onDaDoc={loadNotifications} />
    </div>
  );
}
