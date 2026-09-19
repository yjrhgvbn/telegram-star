import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { useQueryClient } from "@tanstack/react-query";
import { appAccessAssetsSchema, appAccessSessionSchema, appAccessStatusSchema } from "@telegram-star/shared/contracts/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { request } from "@/shared/api/request";
import { getRuntimeServerUrl, normalizeServerUrl, saveServerUrl, SERVER_CONFIG_CHANGED_EVENT, SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { ACCESS_REQUIRED_EVENT, clearAccessSession, getAccessSession, saveAccessSession } from "@/shared/runtime/accessSession";
import { isDemo } from "@/demo/mode";
import "./AppAccessGate.css";

export function AppAccessGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [allowed, setAllowed] = useState(isDemo);
  const [checking, setChecking] = useState(!isDemo);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(getRuntimeServerUrl);
  const [busy, setBusy] = useState(false);

  const requestEpoch = useRef(0);

  const check = useCallback(async (serverUrl = getRuntimeServerUrl()) => {
    const epoch = ++requestEpoch.current;
    const isCurrent = () => requestEpoch.current === epoch && getRuntimeServerUrl() === serverUrl;
    try {
      const status = await request("/access/status", { signal: AbortSignal.timeout(10_000) }, appAccessStatusSchema, serverUrl);
      if (!isCurrent()) return null;
      if (status.authorized && status.required) {
        const current = getAccessSession(serverUrl);
        if (current) {
          const assets = await request("/access/assets", { method: "POST", signal: AbortSignal.timeout(10_000) }, appAccessAssetsSchema, serverUrl);
          if (!isCurrent()) return null;
          saveAccessSession({ ...current, ...assets }, serverUrl);
        }
      }
      if (!status.required || !status.authorized) {
        clearAccessSession(serverUrl);
      }
      if (!status.authorized) {
        queryClient.clear();
      }
      setAllowed(status.authorized);
      return status.authorized;
    } catch (reason) {
      if (!isCurrent()) return null;
      throw reason;
    }
  }, [queryClient]);

  useEffect(() => {
    if (isDemo) return;
    const runCheck = () => {
      const pending = check();
      const epoch = requestEpoch.current;
      void pending.catch((reason: unknown) => {
        if (epoch === requestEpoch.current) setError(reason instanceof Error ? reason.message : "无法连接服务器");
      }).finally(() => { if (epoch === requestEpoch.current) setChecking(false); });
    };
    runCheck();
    const required = (event: Event) => {
      const source = (event as CustomEvent<{ serverUrl?: string }>).detail?.serverUrl;
      if (source !== undefined && source !== getRuntimeServerUrl()) return;
      requestEpoch.current += 1;
      setAllowed(false);
      clearAccessSession(getRuntimeServerUrl());
      queryClient.clear();
      setChecking(false);
    };
    const changed = () => {
      requestEpoch.current += 1;
      setAllowed(false);
      setChecking(true);
      setServer(getRuntimeServerUrl());
      setPassword("");
      setError("");
      queryClient.clear();
      runCheck();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === SERVER_CONFIG_STORAGE_KEY || event.key === null) changed();
    };
    window.addEventListener(ACCESS_REQUIRED_EVENT, required);
    window.addEventListener(SERVER_CONFIG_CHANGED_EVENT, changed);
    window.addEventListener("storage", storageChanged);
    const timer = window.setInterval(() => { void check().catch(() => undefined); }, 120_000);
    return () => {
      requestEpoch.current += 1;
      window.clearInterval(timer);
      window.removeEventListener(ACCESS_REQUIRED_EVENT, required);
      window.removeEventListener(SERVER_CONFIG_CHANGED_EVENT, changed);
      window.removeEventListener("storage", storageChanged);
    };
  }, [check, queryClient]);

  if (allowed) return children;
  return (
    <main className="app-access">
      <section className="app-access__panel" aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`}>连接 Telegram Star</h1>
        <p>输入服务器的后台访问密码，继续查看消息和管理规则。</p>
        <form className="app-access__form" onSubmit={async event => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setError("");
          const targetServer = normalizeServerUrl(server);
          let epoch = ++requestEpoch.current;
          let operationServer = getRuntimeServerUrl();
          const isCurrent = () => epoch === requestEpoch.current && operationServer === getRuntimeServerUrl();
          try {
            if (targetServer) {
              const url = new URL(targetServer);
              if (!/^https?:$/.test(url.protocol) || url.search || url.hash || url.username || url.password) {
                throw new Error("请输入 http:// 或 https:// 服务器根地址，不包含登录信息或查询参数");
              }
            }
            if (targetServer !== getRuntimeServerUrl()) queryClient.clear();
            saveServerUrl(targetServer);
            operationServer = targetServer;
            // Saving a different server synchronously invalidates outstanding checks.
            epoch = ++requestEpoch.current;
            if (password) {
              const session = await request("/access/login", { method: "POST", body: JSON.stringify({ password }), signal: AbortSignal.timeout(10_000) }, appAccessSessionSchema, targetServer);
              if (!isCurrent()) return;
              saveAccessSession(session, targetServer);
              setPassword("");
            }
            const pending = check(targetServer);
            epoch = requestEpoch.current;
            if (await pending === false && isCurrent()) setError("请输入后台访问密码");
          } catch (reason) {
            if (isCurrent()) setError(reason instanceof Error ? reason.message : "连接失败，请重试");
          } finally {
            setBusy(false);
            if (isCurrent()) setChecking(false);
          }
        }}>
          <Field.Root className="app-access__field">
            <Field.Label htmlFor={`${id}-server`}>服务器地址</Field.Label>
            <Input id={`${id}-server`} value={server} onChange={event => setServer(event.target.value)} placeholder="留空使用当前网站" autoComplete="url" />
          </Field.Root>
          <Field.Root className="app-access__field">
            <Field.Label htmlFor={`${id}-password`}>后台访问密码</Field.Label>
            <Input id={`${id}-password`} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" aria-describedby={error ? `${id}-error` : undefined} />
          </Field.Root>
          {error ? <p id={`${id}-error`} className="app-access__error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={busy || checking}>{busy || checking ? "正在连接…" : "连接"}</Button>
        </form>
      </section>
    </main>
  );
}
