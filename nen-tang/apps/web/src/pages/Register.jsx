import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { useKhaNang } from "@/lib/useKhaNang";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";
import BRAND from "@/brand.generated.js";

export default function Register() {
  const { khaNang } = useKhaNang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.message || "Mã xác nhận không hợp lệ");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast({
        title: "Đã gửi mã",
        description: "Kiểm tra email để nhận mã mới.",
      });
    } catch (err) {
      setError(err.message || "Gửi lại mã thất bại");
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", safeReturnTo());
  };

  // Khong gui duoc thu thi KHONG duoc mo form dang ky.
  //
  // Dang ky o day bat buoc qua ma OTP gui bang email (auth.mjs kiem: "dung mat
  // khau nhung chua xac thuc email -> 403"). Thieu RESEND_API_KEY thi
  // mail/resend.js:49 danh dau thu 'failed' va tra ve
  // {ok:false, error:'chua_cau_hinh_email'} - khong mot buc thu nao di.
  //
  // Nhung `register` van tra 200, nen man hinh cu nhay sang o nhap ma va bao
  // "Chung toi da gui ma toi <email>". Nguoi that ngoi doi mot buc thu khong
  // bao gio toi, khong mot dong nao noi vi sao. Day dung la kieu hong ma co che
  // co kha nang (capabilities) duoc dung ra de chan - ba trang dang nhap deu da
  // doc `khaNang.google` de an nut Google, rieng `khaNang.email` thi chua ai doc.
  //
  // Nguoi DA MUA van vao lop duoc ma khong can email: /api/order/:ma/vao-lop
  // (tuong-thich.js:177) tra thang link dat mat khau ra man hinh sau khi kiem
  // ma don + so dien thoai. Nen chi ra duong do thay vi de ho mac ket.
  if (khaNang.email === false) {
    return (
      <AuthLayout
        icon={Mail}
        title="Chưa tự đăng ký được"
        subtitle="Hệ thống gửi email chưa được cấu hình, nên chúng tôi chưa gửi được mã xác nhận."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm leading-relaxed">
            <p className="font-semibold">Anh chị đã mua khoá học rồi?</p>
            <p className="mt-1 text-muted-foreground">
              Vào lớp được ngay, không cần email — chỉ cần mã đơn và số điện thoại
              đã dùng lúc đăng ký.
            </p>
            <a
              href={`${BRAND.salesOrigin}/tra-cuu`}
              className="mt-3 inline-block font-medium text-primary underline underline-offset-4"
            >
              Tìm lại đơn và lấy link vào lớp
            </a>
          </div>

          {BRAND.supportUrl && (
            <p className="text-center text-sm text-muted-foreground">
              Cần giúp thêm?{' '}
              <a
                href={BRAND.supportUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                Nhắn {BRAND.channelLabel} cho {BRAND.hostName}
              </a>
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Đã có mật khẩu?{' '}
            <Link to="/login" className="font-medium text-primary underline underline-offset-4">
              Đăng nhập
            </Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (showOtp) {
    return (
      <AuthLayout
        icon={Mail}
        title="Xác nhận email"
        subtitle={`Chúng tôi đã gửi mã tới ${email}`}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Đang xác nhận...
            </>
          ) : (
            "Xác nhận"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Không nhận được mã?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Gửi lại
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Tạo tài khoản"
      subtitle="Đăng ký để bắt đầu"
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Đăng nhập
          </Link>
        </>
      }
    >
      {/* Chi hien khi may chu that su bat Google - xem chu thich o Login.jsx. */}
      {khaNang.google && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-6"
            onClick={handleGoogle}
          >
            <GoogleIcon className="w-5 h-5 mr-2" />
            Tiếp tục với Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">hoặc</span>
            </div>
          </div>
        </>
      )}

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
          <Label htmlFor="password">Mật khẩu</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Nhập lại mật khẩu</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Đang tạo tài khoản...
            </>
          ) : (
            "Tạo tài khoản"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}