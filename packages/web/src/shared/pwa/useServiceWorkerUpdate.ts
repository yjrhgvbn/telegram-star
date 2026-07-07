import { useCallback, useEffect, useState } from "react";
import {
  activateServiceWorkerUpdate,
  registerAppServiceWorker,
} from "./serviceWorker";

export function useServiceWorkerUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    registerAppServiceWorker(setRegistration);
  }, []);

  const refresh = useCallback(() => {
    if (!registration) return;
    activateServiceWorkerUpdate(registration);
  }, [registration]);

  const dismiss = useCallback(() => {
    setRegistration(null);
  }, []);

  return {
    updateReady: Boolean(registration),
    refresh,
    dismiss,
  };
}
