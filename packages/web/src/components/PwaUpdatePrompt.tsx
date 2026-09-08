import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceWorkerUpdate } from "@/shared/pwa/useServiceWorkerUpdate";
import "./PwaUpdatePrompt.css";

export function PwaUpdatePrompt() {
  const { updateReady, refresh, dismiss } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="pwa-update-prompt"
    >
      <div className="pwa-update-prompt__copy">
        <p>新版本可用</p>
        <p>刷新后即可使用最新界面</p>
      </div>
      <Button type="button" size="sm" onClick={refresh}>
        <RefreshCw data-icon="inline-start" />
        刷新
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="暂不刷新"
        onClick={dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
