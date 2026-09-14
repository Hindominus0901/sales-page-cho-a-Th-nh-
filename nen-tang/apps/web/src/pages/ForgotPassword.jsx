import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {
      // Always show success regardless
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Đặt lại mật khẩu"
      subtitle="Chúng tôi sẽ gửi link đặt lại mật khẩu"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Về trang đăng nhập
        </Link>
      }
    >
      {sent ? (
        // Cau tra loi CO Y mo ho: noi thang "email nay chua dang ky" la cho
        // nguoi la do tung email de biet ai co tai khoan. Nhung mo ho ma khong
        // chi duong tiep theo thi nguoi that ngoi cho mot buc thu khong bao gio
        // toi - va ho khong biet minh vua go nham dia chi.
        <div className="space-y-3 text-center">
          <p className="text-sm text-foreground">
            Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu trong giây lát.
            Nhớ kiểm cả hộp thư <b>Spam</b>.
          </p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Quá 5 phút chưa thấy? Nhiều khả năng bạn gõ khác địa chỉ đã dùng lúc đăng ký.
            Nếu email đó là Gmail, hãy quay lại và bấm <b>Đăng nhập bằng Google</b> —
            không cần mật khẩu, và hệ thống tự nhận ra tài khoản cũ của bạn.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Địa chỉ email</Label>
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
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang gửi...
              </>
            ) : (
              "Gửi link đặt lại"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}