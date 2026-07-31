import { useEffect } from "react";
import { AlertCircle, Inbox, Plus, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import {
  TargetEditor,
  TargetList,
  useForwardTargets,
} from "@/features/notifications";
import { NEW_FORWARD_TARGET_ID } from "@/features/notifications/types";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";

export function NotificationsPage() {
  const { targetId: routeTargetId } = useParams<{ targetId?: string }>();
  const navigate = useNavigate();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters } = useFilters();
  const forwardTargets = useForwardTargets();
  const isTargetSelected = routeTargetId !== undefined;

  useEffect(() => {
    if (!routeTargetId) return;
    if (routeTargetId === NEW_FORWARD_TARGET_ID) {
      forwardTargets.addTarget();
      return;
    }
    forwardTargets.setSelectedTargetId(routeTargetId);
  }, [forwardTargets.addTarget, forwardTargets.setSelectedTargetId, routeTargetId]);

  const handleAddTarget = () => {
    forwardTargets.addTarget();
    navigate(`/notifications/${NEW_FORWARD_TARGET_ID}`);
  };

  const handleSelectTarget = (id: string) => {
    forwardTargets.setSelectedTargetId(id);
    navigate(`/notifications/${id}`);
  };

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <WorkspaceHeader
          title="转发通道"
          description={`${forwardTargets.targets.length} 个通道 · ${filters.length} 个可用规则 · ${forwardTargets.subscribedRules} 个已订阅规则`}
          className="hidden md:flex"
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={forwardTargets.refresh}
                disabled={forwardTargets.loading}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={cn(forwardTargets.loading && "animate-spin")}
                />
                刷新
              </Button>
              <Button type="button" size="sm" onClick={handleAddTarget}>
                <Plus data-icon="inline-start" />
                新建通道
              </Button>
            </>
          }
        />

        {forwardTargets.error ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{forwardTargets.error}</span>
          </div>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden lg:gap-3 lg:p-3">
          <aside
            className={cn(
              "min-h-0 shrink-0 flex-col border-r border-border bg-sidebar/48 lg:overflow-hidden lg:rounded-xl lg:border lg:bg-card lg:shadow-[var(--workspace-panel-shadow)]",
              isTargetSelected ? "hidden lg:flex lg:w-[244px]" : "flex w-full lg:w-[244px]",
            )}
          >
            <TargetList
              targets={forwardTargets.visibleTargets}
              selectedTargetId={forwardTargets.selectedTargetId}
              loading={forwardTargets.loading}
              onAdd={handleAddTarget}
              onSelect={handleSelectTarget}
            />
          </aside>

          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-hidden bg-card lg:rounded-xl lg:border lg:shadow-[var(--workspace-panel-shadow)]",
              isTargetSelected ? "flex" : "hidden lg:flex",
            )}
          >
            {forwardTargets.selectedTarget ? (
              <TargetEditor
                key={forwardTargets.selectedTarget.id || "new"}
                target={forwardTargets.selectedTarget}
                allFilters={filters}
                onBack={() => navigate("/notifications")}
                onDraftChange={forwardTargets.setDraftTarget}
                onSave={async (target, data) => {
                  const saved = await forwardTargets.saveTarget(target, data);
                  navigate(`/notifications/${saved.id}`, { replace: target.id === 0 });
                  return saved;
                }}
                onDelete={async (target) => {
                  await forwardTargets.deleteTarget(target);
                  navigate("/notifications", { replace: true });
                }}
                onTest={forwardTargets.testTarget}
              />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                  <span className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Inbox className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">选择一个转发通道</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      从左侧打开现有通道，或创建一个新的消息目的地。
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={handleAddTarget}>
                    <Plus data-icon="inline-start" />
                    新建通道
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
