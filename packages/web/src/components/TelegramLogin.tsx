import { useEffect, useId, useRef, useState } from "react";
import { Field } from "@base-ui/react/field";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/shared/query/queryKeys";
import { api } from "../api/client";
import type { AuthStatus } from "../types";
import "./TelegramLogin.css";

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
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const firstInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    // Each authorization stage replaces its controls; keep keyboard users at
    // the next input instead of leaving focus on the removed submit button.
    firstInputRef.current?.focus({ preventScroll: true });
  }, [step]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!apiId.trim() || !apiHash.trim()) {
      setError("请输入 Telegram API ID 和 API Hash");
      return;
    }
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.config.status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.status });
      setTelegramConfigured(true);
      setStep("phone");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存配置失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!phone.trim()) {
      setError("请输入手机号码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.auth.sendCode(phone.trim());
      setStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "发送验证码失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!code.trim()) {
      setError("请输入验证码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.auth.login(phone.trim(), code.trim(), password || undefined);
      if (result.status === "password_required") {
        setStep("password");
      } else if (result.status === "success") {
        onLoginSuccess();
      } else {
        setError(result.error || "登录失败，请重试");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!password.trim()) {
      setError("请输入两步验证密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.auth.login(phone.trim(), code.trim(), password.trim());
      if (result.status === "success") {
        onLoginSuccess();
      } else {
        setError(result.error || "验证失败，请重试");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "验证失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (authStatus.authorized) return null;

  const inputState = {
    required: true,
    disabled: loading,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? errorId : undefined,
  };

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_open, details) => details.cancel()}
    >
      <DialogContent
        className="telegram-login"
        showCloseButton={false}
        initialFocus={firstInputRef}
      >
        <div className="telegram-login__brand">
          <img src="/icons/icon.svg" alt="" />
          <span>Telegram Star</span>
        </div>
        <DialogHeader>
          <DialogTitle>连接 Telegram</DialogTitle>
          <DialogDescription>连接账号，开始运行你的消息规则。</DialogDescription>
        </DialogHeader>

        <ol className="telegram-login__steps" aria-label="登录步骤">
          {([
            ["config", "配置"],
            ["phone", "手机号"],
            ["code", "验证码"],
            ["password", "两步验证"],
          ] as const).map(([value, label]) => (
            <li key={value} aria-current={step === value ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>

        {error ? <p id={errorId} role="alert" className="telegram-login__error">{error}</p> : null}

        {step === "config" && (
          <form onSubmit={handleSaveConfig} className="telegram-login__form" aria-busy={loading}>
            <Field.Root className="telegram-login__field" invalid={Boolean(error)} disabled={loading}>
              <Field.Label htmlFor={`${fieldId}-api-id`}>Telegram API ID</Field.Label>
              <Input
                {...inputState}
                ref={firstInputRef}
                id={`${fieldId}-api-id`}
                inputMode="numeric"
                placeholder="123456"
                value={apiId}
                onChange={(e) => { setApiId(e.target.value); setError(""); }}
              />
              <Field.Description>可在 my.telegram.org/apps 获取</Field.Description>
            </Field.Root>
            <Field.Root className="telegram-login__field" invalid={Boolean(error)} disabled={loading}>
              <Field.Label htmlFor={`${fieldId}-api-hash`}>Telegram API Hash</Field.Label>
              <Input
                {...inputState}
                id={`${fieldId}-api-hash`}
                type="password"
                placeholder="请输入 API Hash"
                value={apiHash}
                onChange={(e) => { setApiHash(e.target.value); setError(""); }}
              />
              <Field.Description>保存到当前服务器，状态接口不返回明文。</Field.Description>
            </Field.Root>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "保存中..." : "保存配置"}
            </Button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={handleSendCode} className="telegram-login__form" aria-busy={loading}>
            <Field.Root className="telegram-login__field" invalid={Boolean(error)} disabled={loading}>
              <Field.Label htmlFor={`${fieldId}-phone`}>手机号码</Field.Label>
              <Input
                {...inputState}
                ref={firstInputRef}
                id={`${fieldId}-phone`}
                type="tel"
                autoComplete="tel"
                placeholder="+86 13800138000"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(""); }}
              />
              <Field.Description>请输入完整的国际格式手机号</Field.Description>
            </Field.Root>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "发送中..." : "发送验证码"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleLogin} className="telegram-login__form" aria-busy={loading}>
            <Field.Root className="telegram-login__field" invalid={Boolean(error)} disabled={loading}>
              <Field.Label htmlFor={`${fieldId}-code`}>验证码</Field.Label>
              <Input
                {...inputState}
                ref={firstInputRef}
                id={`${fieldId}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="12345"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
              />
              <Field.Description>请输入你在 Telegram 收到的验证码</Field.Description>
            </Field.Root>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={loading}
              onClick={() => { setStep("phone"); setError(""); }}
            >
              返回修改手机号
            </Button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="telegram-login__form" aria-busy={loading}>
            <Field.Root className="telegram-login__field" invalid={Boolean(error)} disabled={loading}>
              <Field.Label htmlFor={`${fieldId}-password`}>两步验证密码</Field.Label>
              <Input
                {...inputState}
                ref={firstInputRef}
                id={`${fieldId}-password`}
                type="password"
                autoComplete="current-password"
                placeholder="请输入你的两步验证密码"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
              />
              <Field.Description>你的账号已开启两步验证</Field.Description>
            </Field.Root>
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "验证中..." : "确认"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
