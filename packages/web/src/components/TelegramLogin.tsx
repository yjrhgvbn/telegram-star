import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/shared/query/queryKeys";
import { api } from "../api/client";
import type { AuthStatus } from "../types";

interface Props {
  authStatus: AuthStatus;
  onLoginSuccess: () => void;
}

export function TelegramLogin({ authStatus, onLoginSuccess }: Props) {
  const queryClient = useQueryClient();
  const [telegramConfigured, setTelegramConfigured] = useState(authStatus.telegramConfigured);
  const [step, setStep] = useState<"config" | "phone" | "code" | "password">(
    authStatus.telegramConfigured ? "phone" : "config",
  );
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTelegramConfigured(authStatus.telegramConfigured);
  }, [authStatus.telegramConfigured]);

  useEffect(() => {
    if (!telegramConfigured) {
      setStep("config");
    } else if (step === "config") {
      setStep("phone");
    }
  }, [telegramConfigured, step]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiId.trim() || !apiHash.trim()) return;
    setLoading(true);
    setError("");
    try {
      const nextConfig = await api.config.update({
        telegram: {
          apiId: apiId.trim(),
          apiHash: apiHash.trim(),
        },
      });
      queryClient.setQueryData(queryKeys.config.status, nextConfig);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.status });
      setTelegramConfigured(true);
      setStep("phone");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/22 px-4 backdrop-blur-md">
      <Card className="w-full max-w-md animate-in border-border bg-card shadow-xl fade-in-0 zoom-in-95">
        <CardHeader className="text-center">
          <img src="/icons/icon.svg" alt="" className="mx-auto mb-2 size-11 rounded-xl shadow-sm" />
          <CardTitle className="text-xl">Telegram Star</CardTitle>
          <CardDescription>连接 Telegram，开始运行你的消息规则</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          {step === "config" && (
            <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground">Telegram API ID</label>
                <Input
                  inputMode="numeric"
                  placeholder="123456"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">可在 my.telegram.org/apps 获取</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground">Telegram API Hash</label>
                <Input
                  type="password"
                  placeholder="请输入 API Hash"
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">保存到本地 SQLite 数据库，不会在状态接口返回明文</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "保存中..." : "保存配置"}
              </Button>
            </form>
          )}

          {step === "phone" && (
            <form onSubmit={handleSendCode} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
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
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
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
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
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
            <Badge variant={step === "config" ? "default" : "secondary"} className="rounded-full px-2.5">配置</Badge>
            <Badge variant={step === "phone" ? "default" : "secondary"} className="rounded-full px-2.5">手机号</Badge>
            <Badge variant={step === "code" ? "default" : "secondary"} className="rounded-full px-2.5">验证码</Badge>
            <Badge variant={step === "password" ? "default" : "secondary"} className="rounded-full px-2.5">2FA</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
