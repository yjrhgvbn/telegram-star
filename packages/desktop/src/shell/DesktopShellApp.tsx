import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Settings,
  WifiOff,
} from "lucide-react";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { checkDesktopServerHealth } from "../runtime/health";
import { buildRemoteAppUrl } from "../runtime/navigation";
import {
  buildDesktopBridgeCapabilitiesMessage,
  buildDesktopCommandResultMessage,
  checkDesktopUpdate,
  listenToNativeShellEvents,
  openExternalUrl,
  parseRemoteShellMessage,
  postRemoteFrameMessage,
  sendDesktopNotification,
  setupNotificationActionForwarding,
  setupWindowStatePersistence,
} from "../runtime/nativeBridge";
import {
  clearDesktopShellStorage,
  getInitialServerUrl,
  normalizeServerUrl,
  saveLastConnectedAt,
  saveServerUrl,
} from "../runtime/serverConfig";

type ShellStatus = "connect" | "checking" | "connected" | "offline";

interface ConnectionSnapshot {
  serverUrl: string;
  health: HealthStatus | null;
  error: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "连接失败，请稍后重试。";
}

function getInitialStatus(serverUrl: string): ShellStatus {
  return serverUrl ? "checking" : "connect";
}

export function DesktopShellApp() {
  const initialServerUrl = useMemo(() => getInitialServerUrl(), []);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const remoteAppUrlRef = useRef("");
  const connectedRef = useRef(false);
  const [status, setStatus] = useState<ShellStatus>(() => getInitialStatus(initialServerUrl));
  const [inputUrl, setInputUrl] = useState(initialServerUrl);
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    serverUrl: initialServerUrl,
    health: null,
    error: "",
  });
  const [reloadKey, setReloadKey] = useState(0);

  const remoteAppUrl = buildRemoteAppUrl(snapshot.serverUrl, reloadKey);
  const connected = status === "connected";

  useEffect(() => {
    remoteAppUrlRef.current = remoteAppUrl;
    connectedRef.current = connected;
  }, [connected, remoteAppUrl]);

  function postDesktopCapabilities() {
    postRemoteFrameMessage(
      iframeRef.current?.contentWindow,
      snapshot.serverUrl,
      buildDesktopBridgeCapabilitiesMessage(),
    );
  }

  async function handleCheckUpdate({ notify = false } = {}) {
    const result = await checkDesktopUpdate();
    if (notify) {
      void sendDesktopNotification({
        title: "Telegram Star",
        body: result.message,
      });
    }
    return result;
  }

  useEffect(() => {
    if (!snapshot.serverUrl || status !== "checking") return;

    let cancelled = false;

    async function connect() {
      try {
        const health = await checkDesktopServerHealth(snapshot.serverUrl);
        if (cancelled) return;

        const connectedAt = new Date().toISOString();
        saveServerUrl(snapshot.serverUrl);
        saveLastConnectedAt(connectedAt);
        setSnapshot((current) => ({
          ...current,
          health,
          error: "",
        }));
        setStatus("connected");
      } catch (error) {
        if (cancelled) return;
        setSnapshot((current) => ({
          ...current,
          health: null,
          error: getErrorMessage(error),
        }));
        setStatus("offline");
      }
    }

    void connect();

    return () => {
      // React StrictMode 会重复触发 effect；取消标记可以避免旧请求回写新状态。
      cancelled = true;
    };
  }, [snapshot.serverUrl, status]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void setupWindowStatePersistence().then((release) => {
      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void setupNotificationActionForwarding().then((release) => {
      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void listenToNativeShellEvents({
      onSwitchServer: handleResetConnection,
      onCheckUpdate: () => {
        void handleCheckUpdate({ notify: true });
      },
      onReloadRemote: handleReloadRemoteApp,
      onOpenInBrowser: () => {
        void handleOpenInBrowser().catch((error) => {
          void sendDesktopNotification({
            title: "Telegram Star",
            body: error instanceof Error ? error.message : "外链打开失败",
          });
        });
      },
      onTestNotification: () => {
        void handleTestNotification();
      },
    }).then((release) => {
      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    function handleRemoteMessage(event: MessageEvent) {
      const message = parseRemoteShellMessage(event, snapshot.serverUrl);
      if (!message) return;

      if (message.type === "desktop-capability-query") {
        postDesktopCapabilities();
        return;
      }

      if (message.type === "desktop-command") {
        void executeDesktopCommand(message)
          .then((result) => {
            postRemoteFrameMessage(
              iframeRef.current?.contentWindow,
              snapshot.serverUrl,
              buildDesktopCommandResultMessage({
                requestId: message.requestId,
                ok: result.ok,
                message: result.message,
                status: result.status,
              }),
            );
            result.afterSend?.();
          })
          .catch((error) => {
            postRemoteFrameMessage(
              iframeRef.current?.contentWindow,
              snapshot.serverUrl,
              buildDesktopCommandResultMessage({
                requestId: message.requestId,
                ok: false,
                message: error instanceof Error ? error.message : "桌面命令执行失败。",
              }),
            );
          });
        return;
      }

      if (message.type === "open-external") {
        void openExternalUrl(message.url).catch(() => undefined);
        return;
      }

      // 远程页只通过同源 postMessage 传递最小通知数据，实际系统权限仍由本地壳统一申请。
      void sendDesktopNotification(message.payload);
    }

    window.addEventListener("message", handleRemoteMessage);
    return () => window.removeEventListener("message", handleRemoteMessage);
  }, [snapshot.serverUrl]);

  function startConnection(serverUrl: string) {
    const normalized = normalizeServerUrl(serverUrl);
    if (!normalized) {
      setStatus("connect");
      setSnapshot({
        serverUrl: "",
        health: null,
        error: "请输入后端地址。",
      });
      return;
    }

    setSnapshot({
      serverUrl: normalized,
      health: null,
      error: "",
    });
    setInputUrl(normalized);
    setStatus("checking");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startConnection(inputUrl);
  }

  function handleRetry() {
    startConnection(snapshot.serverUrl || inputUrl);
  }

  function handleResetConnection() {
    // 重置入口只清理本地壳保存的地址和提示信息，不触碰远程后端数据。
    clearDesktopShellStorage();
    setInputUrl("");
    setReloadKey((value) => value + 1);
    setSnapshot({
      serverUrl: "",
      health: null,
      error: "",
    });
    setStatus("connect");
  }

  function handleReloadRemoteApp() {
    setReloadKey(Date.now());
  }

  async function handleOpenInBrowser(url = remoteAppUrlRef.current) {
    if (!url) throw new Error("远程页面尚未连接。");
    await openExternalUrl(url);
  }

  async function handleTestNotification() {
    return sendDesktopNotification({
      title: "Telegram Star",
      body: connectedRef.current ? "桌面通知已连接当前服务器。" : "桌面通知可用。",
    });
  }

  async function executeDesktopCommand(message: {
    command: "check-update" | "test-notification" | "open-external" | "reload" | "switch-server";
    url?: string;
  }): Promise<{ ok: boolean; message: string; status?: string; afterSend?: () => void }> {
    switch (message.command) {
      case "check-update": {
        const result = await handleCheckUpdate();
        return {
          ok: result.status !== "failed",
          message: result.message,
          status: result.status,
        };
      }
      case "test-notification": {
        const result = await handleTestNotification();
        return {
          ok: result.delivered,
          message: result.delivered ? "通知已发送。" : "通知未授权或不可用。",
          status: result.reason,
        };
      }
      case "open-external":
        await handleOpenInBrowser(message.url);
        return { ok: true, message: "已在浏览器打开。" };
      case "reload":
        return {
          ok: true,
          message: "已刷新桌面页面。",
          afterSend: handleReloadRemoteApp,
        };
      case "switch-server":
        return {
          ok: true,
          message: "已返回服务器配置。",
          afterSend: handleResetConnection,
        };
    }
  }

  return (
    <main className={`desktop-shell desktop-shell--${status}`}>
      {status !== "connected" && <div className="shell-surface" />}
      <section className="shell-content" aria-live="polite">
        {status === "connect" && (
          <div className="connection-panel">
            <div className="brand-block">
              <div className="brand-mark">TS</div>
              <div>
                <p className="eyebrow">Telegram Star</p>
                <h1>桌面端</h1>
              </div>
            </div>

            <form className="connection-form" onSubmit={handleSubmit}>
              <label htmlFor="server-url">服务器根地址</label>
              <div className="input-row">
                <input
                  id="server-url"
                  type="url"
                  inputMode="url"
                  placeholder="http://localhost:3000"
                  value={inputUrl}
                  onChange={(event) => setInputUrl(event.target.value)}
                />
                <button className="primary-button" type="submit">
                  <CheckCircle2 aria-hidden="true" />
                  测试并连接
                </button>
              </div>
            </form>

            {snapshot.error && (
              <div className="inline-error" role="alert">
                <WifiOff aria-hidden="true" />
                <span>{snapshot.error}</span>
              </div>
            )}
          </div>
        )}

        {status === "checking" && (
          <div className="state-panel">
            <LoaderCircle className="spin" aria-hidden="true" />
            <h2>正在连接</h2>
            <p>{snapshot.serverUrl}</p>
          </div>
        )}

        {status === "offline" && (
          <div className="state-panel offline">
            <WifiOff aria-hidden="true" />
            <h2>服务器不可达</h2>
            <p>{snapshot.error}</p>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={handleRetry}>
                <RefreshCw aria-hidden="true" />
                重试
              </button>
              <button className="secondary-button" type="button" onClick={() => setStatus("connect")}>
                <Settings aria-hidden="true" />
                修改地址
              </button>
            </div>
          </div>
        )}

        {status === "connected" && remoteAppUrl && (
          <div className="remote-frame-shell">
            <iframe
              ref={iframeRef}
              key={remoteAppUrl}
              className="remote-frame"
              src={remoteAppUrl}
              title="Telegram Star 远程业务页"
              onLoad={postDesktopCapabilities}
            />
          </div>
        )}
      </section>
    </main>
  );
}
