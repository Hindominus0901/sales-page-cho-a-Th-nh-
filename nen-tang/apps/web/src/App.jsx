import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Onboarding from '@/pages/Onboarding';

// Member pages
import Dashboard from '@/pages/Dashboard';
import Journey from '@/pages/Journey';
import Courses from '@/pages/Courses';
import Vip from '@/pages/Vip';
import CuaHang from '@/pages/CuaHang';
import Leaderboard from '@/pages/Leaderboard';
import Rewards from '@/pages/Rewards';
import Badges from '@/pages/Badges';
import Challenges from '@/pages/Challenges';
import Community from '@/pages/Community';
import Calendar from '@/pages/Calendar';
import Affiliate from '@/pages/Affiliate';
import Profile from '@/pages/Profile';

// Admin pages
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import Revenue from '@/pages/admin/Revenue';
import Members from '@/pages/admin/Members';
import Approval from '@/pages/admin/Approval';
import AdminChallenges from '@/pages/admin/AdminChallenges';
import AdminAffiliate from '@/pages/admin/AdminAffiliate';
import AdminCourses from '@/pages/admin/AdminCourses';
import AdminRewards from '@/pages/admin/AdminRewards';
import AdminProducts from '@/pages/admin/AdminProducts';
import AdminVip from '@/pages/admin/AdminVip';
import Staff from '@/pages/admin/Staff';
import Mechanics from '@/pages/admin/Mechanics';
import Email from '@/pages/admin/Email';
import AdminEvents from '@/pages/admin/AdminEvents';
import AdminBadges from '@/pages/admin/AdminBadges';
import AdminActivityTypes from '@/pages/admin/AdminActivityTypes';
import AdminCongDong from '@/pages/admin/AdminCongDong';
import AdminNotify from '@/pages/admin/AdminNotify';
import AdminLogs from '@/pages/admin/AdminLogs';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected app routes */}
            <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
              {/* NGOAI AppLayout: nguoi chua co ho so day du thi thanh ben va
                  chuong chua co gi de hien - va chinh AppLayout la noi doc
                  nhung truong con thieu do. */}
              <Route path="/onboarding" element={<Onboarding />} />

              <Route element={<AppLayout />}>
                {/* Dashboard KHONG the o "/": Worker phuc vu trang ban hang o do,
                    nen moi lan tai lai trang that su (dang nhap xong, F5, dan link)
                    nguoi dung se roi vao trang ban hang thay vi vao app. */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/journey" element={<Journey />} />
                <Route path="/courses" element={<Courses />} />
          <Route path="/lop-vip" element={<Vip />} />
          <Route path="/cua-hang" element={<CuaHang />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/badges" element={<Badges />} />
                <Route path="/challenges" element={<Challenges />} />
                <Route path="/community" element={<Community />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/affiliate" element={<Affiliate />} />
                <Route path="/profile" element={<Profile />} />
                {/* Admin routes */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="revenue" element={<Revenue />} />
                  <Route path="members" element={<Members />} />
                  <Route path="approval" element={<Approval />} />
                  <Route path="challenges" element={<AdminChallenges />} />
                  <Route path="affiliate" element={<AdminAffiliate />} />
                  <Route path="courses" element={<AdminCourses />} />
                  <Route path="rewards" element={<AdminRewards />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="vip" element={<AdminVip />} />
                  <Route path="badges" element={<AdminBadges />} />
                  <Route path="activity-types" element={<AdminActivityTypes />} />
                  <Route path="cong-dong" element={<AdminCongDong />} />
                  <Route path="notify" element={<AdminNotify />} />
                  <Route path="logs" element={<AdminLogs />} />
                  <Route path="staff" element={<Staff />} />
                  <Route path="mechanics" element={<Mechanics />} />
                  {/* "Tuy chinh Portal" da bo khoi menu tu truoc, nhung route
                      van song nen mo bang URL hay bookmark cu la vao duoc - va
                      moi cau chu tren trang do deu khong dung: "thay doi ap dung
                      cho tat ca hoc vien", "Phan nay bien mat khoi app hoc vien",
                      toast "Da luu". Khong mot trang hoc vien nao doc entity
                      PortalSection, nen bam Luu o do khong doi mot pixel nao.
                      An khoi menu ma de cua sau mo la van con nguyen cai bay,
                      chi kho gap hon. Khi nao noi that vao app hoc vien thi bo
                      dong Navigate nay di. */}
                  <Route path="portal" element={<Navigate to="/admin" replace />} />
                  <Route path="email" element={<Email />} />
                  <Route path="events" element={<AdminEvents />} />
                  {/* Hai trang cu da gop vao "Co che" - giu duong dan de link cu khong gay 404. */}
                  <Route path="levels" element={<Navigate to="/admin/mechanics" replace />} />
                  <Route path="settings" element={<Navigate to="/admin/mechanics" replace />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App