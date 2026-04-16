import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../api/client";
import type { AuthStatus } from "../types";

interface Props {
  authStatus: AuthStatus;
  onLoginSuccess: () => void;
}

export function TelegramLogin({ authStatus, onLoginSuccess }: Props) {
  const [step, setStep] = useState<"phone" | "code" | "password">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.auth.sendCode(phone.trim());
      setStep("code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.auth.login(phone.trim(), code.trim(), password || undefined);
      if (result.status === "password_required") {
        setStep("password");
      } else if (result.status === "success") {
        onLoginSuccess();
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.auth.login(phone.trim(), code.trim(), password.trim());
      if (result.status === "success") {
        onLoginSuccess();
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authStatus.authorized) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-md">
      <Card className="w-full max-w-md animate-in fade-in-0 zoom-in-95 border-border/70 bg-card/95 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-3xl">⭐</div>
          <CardTitle className="text-xl">Telegram Star</CardTitle>
          <CardDescription>连接你的 Telegram 账号开始追踪消息</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          {step === "phone" && (
            <form onSubmit={handleSendCode} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">手机号码</label>
                <Input
                  type="tel"
                  placeholder="+86 13800138000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">请输入完整的国际格式手机号</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "发送中..." : "发送验证码"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">验证码</label>
                <Input
                  type="text"
                  placeholder="12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">请输入你在 Telegram 收到的验证码</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "登录中..." : "登录"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("phone")}>
                返回修改手机号
              </Button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">两步验证密码</label>
                <Input
                  type="password"
                  placeholder="请输入你的两步验证密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">你的账号已开启两步验证</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "验证中..." : "确认"}
              </Button>
            </form>
          )}

          <div className="flex items-center justify-center gap-2 pt-1">
            <Badge variant={step === "phone" ? "default" : "secondary"} className="rounded-full px-2.5">手机号</Badge>
            <Badge variant={step === "code" ? "default" : "secondary"} className="rounded-full px-2.5">验证码</Badge>
            <Badge variant={step === "password" ? "default" : "secondary"} className="rounded-full px-2.5">2FA</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
