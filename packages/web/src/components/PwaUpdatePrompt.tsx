import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceWorkerUpdate } from "@/shared/pwa/useServiceWorkerUpdate";

export function PwaUpdatePrompt() {
  const { updateReady, refresh, dismiss } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-18 left-4 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm text-card-foreground shadow-lg sm:right-4 sm:left-auto md:bottom-4"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium">新版本可用</div>
        <div className="mt-0.5 text-xs text-muted-foreground">刷新后即可使用最新界面</div>
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
