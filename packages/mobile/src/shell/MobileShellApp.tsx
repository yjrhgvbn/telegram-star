import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  LoaderCircle,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
  WifiOff,
} from "lucide-react";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import {
  heartbeatMobileClient,
  MOBILE_HEARTBEAT_INTERVAL_MS,
  registerMobileClient,
} from "../runtime/clientDevice";
import {
  isCameraQrScannerSupported,
  startCameraQrScanner,
  type CameraQrScanner,
} from "../runtime/cameraQrScanner";
import { checkMobileServerHealth } from "../runtime/health";
import { buildRemoteAppUrl } from "../runtime/navigation";
import {
  buildMobileBridgeCapabilitiesMessage,
  buildMobileCommandResultMessage,
  openExternalUrl,
  parseRemoteMobileShellMessage,
  postRemoteFrameMessage,
} from "../runtime/mobileBridge";
import { parseMobileQrConfig } from "../runtime/qrConfig";
import {
  clearMobileShellStorage,
  getInitialServerUrl,
  normalizeServerUrl,
  saveLastConnectedAt,
  saveServerUrl,
} from "../runtime/serverConfig";

type ShellStatus = "connect" | "checking" | "connected" | "offline";
type ScanStatus = "idle" | "scanning" | "unsupported" | "error";

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

export function MobileShellApp() {
  const initialServerUrl = useMemo(() => getInitialServerUrl(), []);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<CameraQrScanner | null>(null);
  const [status, setStatus] = useState<ShellStatus>(() => getInitialStatus(initialServerUrl));
  const [inputUrl, setInputUrl] = useState(initialServerUrl);
  const [qrText, setQrText] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    serverUrl: initialServerUrl,
    health: null,
    error: "",
  });
  const [reloadKey, setReloadKey] = useState(0);

  const remoteAppUrl = buildRemoteAppUrl(snapshot.serverUrl, reloadKey);
  const connected = status === "connected";
  const scanning = scanStatus === "scanning";
  const shellClassName = connected
    ? "mobile-shell mobile-shell--connected"
    : "mobile-shell mobile-shell--setup";

  function stopScanner() {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScanStatus("idle");
  }

  function startConnection(serverUrl: string) {
    stopScanner();
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

  function applyQrValue(value: string) {
    const config = parseMobileQrConfig(value);
    if (!config) {
      setScanStatus("error");
      setSnapshot((current) => ({
        ...current,
        error: "二维码内容不是可识别的 Telegram Star 服务器配置。",
      }));
      return;
    }

    setQrText(value);
    startConnection(config.serverUrl);
  }

  async function startCameraScan() {
    if (!videoRef.current) return;

    if (!isCameraQrScannerSupported()) {
      setScanStatus("unsupported");
      return;
    }

    try {
      setScanStatus("scanning");
      scannerRef.current = await startCameraQrScanner(videoRef.current, applyQrValue);
    } catch (error) {
      setScanStatus("error");
      setSnapshot((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    }
  }

  function handleQrImport() {
    applyQrValue(qrText);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startConnection(inputUrl);
  }

  function handleRetry() {
    startConnection(snapshot.serverUrl || inputUrl);
  }

  function handleResetConnection() {
    clearMobileShellStorage();
    stopScanner();
    setInputUrl("");
    setQrText("");
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

  function postMobileCapabilities() {
    postRemoteFrameMessage(
      iframeRef.current?.contentWindow,
      snapshot.serverUrl,
      buildMobileBridgeCapabilitiesMessage(),
    );
  }

  async function handleOpenInBrowser(url: string) {
    await openExternalUrl(url);
  }

  async function executeMobileCommand(message: {
    command: "open-external" | "reload" | "switch-server";
    url?: string;
  }): Promise<{ ok: boolean; message: string; status?: string; afterSend?: () => void }> {
    switch (message.command) {
      case "open-external":
        await handleOpenInBrowser(message.url || remoteAppUrl);
        return { ok: true, message: "已在系统浏览器打开。" };
      case "reload":
        return {
          ok: true,
          message: "已刷新移动端页面。",
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

  useEffect(() => {
    if (!snapshot.serverUrl || status !== "checking") return;

    let cancelled = false;

    async function connect() {
      try {
        const health = await checkMobileServerHealth(snapshot.serverUrl);
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

        // 手机端本地壳主动注册为 mobile / tauri 设备，远程业务页是否注册不影响设备列表。
        registerMobileClient(snapshot.serverUrl).catch(() => undefined);
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
      cancelled = true;
    };
  }, [snapshot.serverUrl, status]);

  useEffect(() => {
    if (!connected || !snapshot.serverUrl) return;

    const heartbeat = () => {
      heartbeatMobileClient(snapshot.serverUrl).catch(() => {
        registerMobileClient(snapshot.serverUrl).catch(() => undefined);
      });
    };
    const timer = window.setInterval(heartbeat, MOBILE_HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [connected, snapshot.serverUrl]);

  useEffect(() => {
    function handleRemoteMessage(event: MessageEvent) {
      const message = parseRemoteMobileShellMessage(event, snapshot.serverUrl);
      if (!message) return;

      if (message.type === "mobile-capability-query") {
        postMobileCapabilities();
        return;
      }

      void executeMobileCommand(message)
        .then((result) => {
          postRemoteFrameMessage(
            iframeRef.current?.contentWindow,
            snapshot.serverUrl,
            buildMobileCommandResultMessage({
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
            buildMobileCommandResultMessage({
              requestId: message.requestId,
              ok: false,
              message: error instanceof Error ? error.message : "移动端命令执行失败。",
            }),
          );
        });
    }

    window.addEventListener("message", handleRemoteMessage);
    return () => window.removeEventListener("message", handleRemoteMessage);
  }, [snapshot.serverUrl]);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
    };
  }, []);

  return (
    <main className={shellClassName}>
      <section className="mobile-content" aria-live="polite">
        {status === "connect" && (
          <div className="connection-panel">
            <div className="panel-heading">
              <Smartphone aria-hidden="true" />
              <div>
                <p className="eyebrow">连接后端</p>
                <h2>输入或扫码配置</h2>
              </div>
            </div>

            <form className="connection-form" onSubmit={handleSubmit}>
              <label htmlFor="server-url">服务器根地址</label>
              <div className="input-row">
                <input
                  id="server-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://star.example.com"
                  value={inputUrl}
                  onChange={(event) => setInputUrl(event.target.value)}
                />
                <button className="primary-button" type="submit">
                  <CheckCircle2 aria-hidden="true" />
                  测试
                </button>
              </div>
            </form>

            <div className="scan-panel">
              <div className="scan-heading">
                <QrCode aria-hidden="true" />
                <span>扫码配置</span>
              </div>

              <video
                ref={videoRef}
                className="qr-video"
                muted
                playsInline
                aria-label="二维码扫描预览"
              />

              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    void startCameraScan();
                  }}
                  disabled={scanning}
                >
                  {scanning ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Camera aria-hidden="true" />
                  )}
                  {scanning ? "扫描中" : "打开相机"}
                </button>
                {scanning && (
                  <button className="secondary-button" type="button" onClick={stopScanner}>
                    <RotateCcw aria-hidden="true" />
                    停止
                  </button>
                )}
              </div>

              <label htmlFor="qr-text">二维码内容导入</label>
              <textarea
                id="qr-text"
                value={qrText}
                placeholder='支持 https://star.example.com、telegram-star://configure?serverUrl=... 或 {"serverUrl":"..."}'
                onChange={(event) => setQrText(event.target.value)}
              />
              <button className="secondary-button full-width" type="button" onClick={handleQrImport}>
                <ClipboardPaste aria-hidden="true" />
                导入并测试
              </button>

              {scanStatus === "unsupported" && (
                <div className="inline-warning">
                  当前 WebView 不支持系统扫码能力，请粘贴二维码内容导入。
                </div>
              )}
            </div>

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
              title="Telegram Star 手机远程业务页"
              onLoad={postMobileCapabilities}
            />
          </div>
        )}
      </section>
    </main>
  );
}
