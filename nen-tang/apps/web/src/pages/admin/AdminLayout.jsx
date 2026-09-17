/**
 * Khung chung cua khu vuc quan tri: chan nguoi khong phai admin, va dung thanh
 * dieu huong. So muc doc thang tu ADMIN_NAV ben duoi - KHONG go con so vao day,
 * vi chu thich cu ghi "11 muc" trong khi mang da len 17 tu lau, va mot con so
 * sai trong chu thich la thu nguoi sua sau tin ngay ma khong kiem lai.
 *
 * Thanh ben cua ban thiet ke nam o cot trai man hinh, nhung o day AppLayout da
 * chiem cot do roi. Nen tren man hinh rong thi day la cot phu ben trong noi
 * dung, con hep hon thi cuon ngang thanh mot hang the.
 */
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, TrendingUp, Users, CheckCircle2, Trophy, Share2,
  GraduationCap, Gift, Briefcase, Settings2, LayoutGrid, ShieldAlert, Mail, CalendarDays,
  Award, Bell, ScrollText, ShoppingBag, Crown,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

export const ADMIN_NAV = [
  { key: 'overview', to: '/admin', end: true, label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'revenue', to: '/admin/revenue', label: 'Doanh thu', icon: TrendingUp },
  { key: 'members', to: '/admin/members', label: 'Học viên', icon: Users },
  { key: 'approval', to: '/admin/approval', label: 'Duyệt bài', icon: CheckCircle2, badge: 'pending' },
  { key: 'challenges', to: '/admin/challenges', label: 'Challenge', icon: Trophy },
  { key: 'affiliateAdmin', to: '/admin/affiliate', label: 'Affiliate', icon: Share2 },
  { key: 'courses', to: '/admin/courses', label: 'Khoá học', icon: GraduationCap },
  { key: 'rewardsAdmin', to: '/admin/rewards', label: 'Quà tặng', icon: Gift },
  { key: 'productsAdmin', to: '/admin/products', label: 'Sản phẩm', icon: ShoppingBag },
  { key: 'vipAdmin', to: '/admin/vip', label: 'Khu vực VIP', icon: Crown },
  { key: 'badgesAdmin', to: '/admin/badges', label: 'Huy hiệu', icon: Award },
  { key: 'notify', to: '/admin/notify', label: 'Thông báo', icon: Bell },
  { key: 'staff', to: '/admin/staff', label: 'Nhân sự', icon: Briefcase },
  { key: 'events', to: '/admin/events', label: 'Lịch & sự kiện', icon: CalendarDays },
  { key: 'email', to: '/admin/email', label: 'Email', icon: Mail },
  { key: 'mechanics', to: '/admin/mechanics', label: 'Cơ chế', icon: Settings2 },
  // "Tuy chinh Portal" DA BO KHOI MENU - khong xoa trang, chi khong dan toi nua.
  //
  // PortalBuilder.jsx ghi vao entity `PortalSection`, nhung KHONG MOT TRANG HOC
  // VIEN NAO doc bang do (grep `PortalSection` trong apps/web chi ra dung trang
  // quan tri va danh sach ten entity). Nghia la admin bat/tat con mat, doi ten,
  // sap xep thu tu, bam Luu, thay toast "Da luu" - va app hoc vien khong doi mot
  // pixel nao.
  //
  // De no trong menu la moi nguoi van hanh lam mot viec vo ich va tin rang minh
  // vua thay doi duoc gi do. Route /admin/portal van con, ai co link cu van mo
  // duoc; khi nao noi that vao cac trang hoc vien thi tra muc nay lai.
  { key: 'logs', to: '/admin/logs', label: 'Nhật ký', icon: ScrollText },
];

function NoAccess() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-extrabold">Bạn không có quyền vào khu vực này</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Trang quản trị chỉ dành cho tài khoản admin. Nếu bạn cho rằng đây là nhầm lẫn,
        nhắn cho quản trị viên để được cấp quyền nhé.
      </p>
    </div>
  );
}

export default function AdminLayout() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';

  // So bai cho duyet hien ngay tren muc "Duyet bai" - de admin khong phai mo
  // trang do moi biet co viec ton dong.
  //
  // PHAI DEM CA HAI HANG CHO. Trang Duyet bai (Approval.jsx) co hai tab:
  // hoat dong (Activity) va bai nop challenge (ChallengeSubmission). Truoc day
  // huy hieu nay chi dem tab dau, nen mot hang doi bai nop challenge dang ton
  // dong van hien so 0 - chi Thanh nhin vao tin la da duyet het roi va khong mo
  // trang do ra nua. Mot con so SAI con te hon khong co con so nao.
  const CHAN = 200;
  const pending = useQuery({
    queryKey: ['admin', 'pendingCount'],
    queryFn: async () => {
      const [hoatDong, baiNop] = await Promise.all([
        base44.entities.Activity.filter({ status: 'pending' }, '-created_date', CHAN),
        base44.entities.ChallengeSubmission.filter({ status: 'pending' }, '-created_date', CHAN),
      ]);
      return { so: (hoatDong?.length || 0) + (baiNop?.length || 0),
        chamTran: (hoatDong?.length || 0) >= CHAN || (baiNop?.length || 0) >= CHAN };
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });
  // Cham tran thi noi ro la "200+" chu khong in mot con so tron nhu the do la
  // tong that - mau lay tu AdminVip.jsx.
  const pendingCount = pending.data?.so || 0;
  const pendingLabel = pending.data?.chamTran ? `${pendingCount}+` : String(pendingCount);

  if (isLoadingAuth) return null;
  if (!isAdmin) return <NoAccess />;

  const navLink = ({ key, to, end, label, icon: Icon, badge }) => (
    <NavLink
      key={key}
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {badge === 'pending' && pendingCount > 0 && (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {pendingLabel}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
      <nav className="flex gap-1 overflow-x-auto pb-1 xl:sticky xl:top-20 xl:w-56 xl:shrink-0 xl:flex-col xl:overflow-visible xl:pb-0">
        <div className="hidden px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground xl:block">
          Admin
        </div>
        {ADMIN_NAV.map(navLink)}
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
