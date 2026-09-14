import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  // ?moi=1 la link MOI gui cho nguoi vua dang ky o trang ban hang: ho chua tung
  // co mat khau, nen chu "dat lai" vua sai vua lam ho tuong bam nham thu cua
  // nguoi khac. Tham so nay thuan tuy doi chu, may chu khong doc den no.
  const laLoiMoi = searchParams.get("moi") === "1";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Đặt lại mật khẩu thất bại");
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link đặt lại không hợp lệ"
        subtitle="Link đặt lại mật khẩu bị thiếu hoặc không hợp lệ"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Yêu cầu link mới
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Link bạn sử dụng có vẻ không đầy đủ. Vui lòng yêu cầu email đặt lại mật khẩu mới.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={laLoiMoi ? "Tạo mật khẩu" : "Mật khẩu mới"}
      subtitle={laLoiMoi
        ? "Đặt mật khẩu để vào lớp — chỉ mất vài giây"
        : "Nhập mật khẩu mới bên dưới"}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{laLoiMoi ? "Mật khẩu" : "Mật khẩu mới"}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
              {laLoiMoi ? "Đang tạo..." : "Đang đặt lại..."}
            </>
          ) : (
            laLoiMoi ? "Tạo mật khẩu và vào lớp" : "Đặt lại mật khẩu"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}