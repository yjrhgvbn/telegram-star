export type ServiceWorkerUpdateHandler = (registration: ServiceWorkerRegistration) => void;

let registrationStarted = false;
let pageRefreshStarted = false;

export function canUseServiceWorker(
  navigatorLike: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator,
  isProduction = import.meta.env.PROD,
): boolean {
  return Boolean(isProduction && navigatorLike && "serviceWorker" in navigatorLike);
}

export function isInstalledUpdateReady(
  worker: ServiceWorker | null,
  hasController: boolean,
): boolean {
  return worker?.state === "installed" && hasController;
}

export function activateServiceWorkerUpdate(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export function registerAppServiceWorker(onUpdate: ServiceWorkerUpdateHandler): void {
  if (!canUseServiceWorker() || registrationStarted) return;

  // 只注册一次，避免 React StrictMode 或多处入口重复触发更新监听。
  registrationStarted = true;

  const startRegistration = () => {
    void navigator.serviceWorker
      .register("/sw.js", { type: "module" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          onUpdate(registration);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            // 只有页面已被旧 SW 控制时，新的 installed 状态才代表“可更新”。
            if (isInstalledUpdateReady(installingWorker, Boolean(navigator.serviceWorker.controller))) {
              onUpdate(registration);
            }
          });
        });
      })
      .catch(() => {
        // PWA 是增强能力，注册失败不能影响主应用启动。
      });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (pageRefreshStarted) return;
      pageRefreshStarted = true;
      window.location.reload();
    });
  };

  if (document.readyState === "complete") {
    startRegistration();
    return;
  }

  window.addEventListener("load", startRegistration, { once: true });
}
