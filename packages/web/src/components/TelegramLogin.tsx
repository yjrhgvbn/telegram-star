import { useState } from "react";
import { api } from "../api/client";
import type { AuthStatus } from "../types";
import "./TelegramLogin.css";

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
    <div className="login-overlay">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">⭐</div>
          <h1 className="login-title">Telegram Star</h1>
          <p className="login-subtitle">连接你的 Telegram 账号开始追踪消息</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {step === "phone" && (
          <form onSubmit={handleSendCode} className="login-form">
            <div className="form-group">
              <label className="form-label">手机号码</label>
              <input
                type="tel"
                className="input"
                placeholder="+86 13800138000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
              <span className="form-hint">请输入完整的国际格式手机号</span>
            </div>
            <button type="submit" className="btn btn-telegram btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : "发送验证码"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label className="form-label">验证码</label>
              <input
                type="text"
                className="input"
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              <span className="form-hint">请输入你在 Telegram 收到的验证码</span>
            </div>
            <button type="submit" className="btn btn-telegram btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : "登录"}
            </button>
            <button type="button" className="btn btn-ghost btn-full" onClick={() => setStep("phone")}>
              返回
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="login-form">
            <div className="form-group">
              <label className="form-label">两步验证密码</label>
              <input
                type="password"
                className="input"
                placeholder="请输入你的两步验证密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <span className="form-hint">你的账号已开启两步验证</span>
            </div>
            <button type="submit" className="btn btn-telegram btn-full" disabled={loading}>
              {loading ? <span className="spinner" /> : "确认"}
            </button>
          </form>
        )}

        <div className="login-steps">
          <div className={`login-step ${step === "phone" ? "active" : "done"}`}>
            <span className="step-dot" />
            <span className="step-label">手机号</span>
          </div>
          <div className="step-line" />
          <div className={`login-step ${step === "code" ? "active" : step === "password" ? "done" : ""}`}>
            <span className="step-dot" />
            <span className="step-label">验证码</span>
          </div>
          <div className="step-line" />
          <div className={`login-step ${step === "password" ? "active" : ""}`}>
            <span className="step-dot" />
            <span className="step-label">2FA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
