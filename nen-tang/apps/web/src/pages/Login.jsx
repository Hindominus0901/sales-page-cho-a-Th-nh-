import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Dang nhap Google that bai thi may chu chuyen ve /login?error=... - nhung
  // truoc day trang nay khong doc tham so do bao gio. Nguoi dung bam Google,
  // bi da nguoc ve day, va KHONG THAY MOT CHU NAO giai thich. Ho chi biet noi
  // "vao bi loi", va khong ai lan ra duoc nguyen nhan.
  const [error, setError] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("error") || "";
      return q.slice(0, 300);
    } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Email hoặc mật khẩu không đúng");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Chào mừng trở lại"
      subtitle="Đăng nhập vào tài khoản"
      footer={
        <>
          Chưa có tài khoản?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Tạo tài khoản
          </Link>
        </>
      }
    >
      {/* Google la duong CHINH, khong phai lua chon phu.
          Trong 290 hoc vien chua tung dang nhap, 283 dung Gmail - voi ho day la
          mot cu bam, khong can nho mat khau nao. De no ngang hang voi o dien
          mat khau la de gan 300 nguoi tu di tim thu moi cu, va nhieu nguoi
          khong tim thay. */}
      <Button
        className="w-full h-12 text-[15px] font-bold"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Đăng nhập bằng Google
      </Button>
      <p className="mt-2 mb-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        Nhanh nhất, không cần mật khẩu. Dùng <b>đúng email bạn đã điền lúc đăng ký</b> —
        hệ thống tự nhận ra bạn và mở lại tài khoản cũ.
      </p>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">hoặc</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mật khẩu</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Đang đăng nhập...
            </>
          ) : (
            "Đăng nhập"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}