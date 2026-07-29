import { useEffect } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Plus, RefreshCw, Webhook } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="flex min-h-0 flex-1 flex-col bg-background/72">
        <WorkspaceHeader
          title={
            isTargetSelected
              ? (forwardTargets.selectedTarget?.name.trim() || "新建转发通道")
              : "转发通道"
          }
          description={`${forwardTargets.targets.length} 个通道 · ${forwardTargets.subscribedRules} 个订阅规则`}
          leading={
            isTargetSelected ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                onClick={() => navigate("/notifications")}
                aria-label="返回通道列表"
              >
                <ArrowLeft />
              </Button>
            ) : null
          }
          actions={
            <>
              <Badge variant="outline" className="hidden sm:inline-flex">
                <Webhook data-icon="inline-start" />
                {forwardTargets.targets.length}
              </Badge>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                <CheckCircle2 data-icon="inline-start" />
                {forwardTargets.enabledTargets} 启用
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={forwardTargets.refresh}
                disabled={forwardTargets.loading}
                aria-label="刷新通道"
              >
                <RefreshCw className={cn(forwardTargets.loading && "animate-spin")} />
              </Button>
              <Button type="button" size="sm" onClick={handleAddTarget}>
                <Plus data-icon="inline-start" />
                新建
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

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <aside
            className={cn(
              "min-h-0 shrink-0 flex-col border-r border-border bg-sidebar/54 p-2",
              isTargetSelected ? "hidden lg:flex lg:w-[252px]" : "flex w-full lg:w-[252px]",
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
              "min-h-0 min-w-0 flex-1 overflow-y-auto p-3",
              isTargetSelected ? "block" : "hidden lg:block",
            )}
          >
            <div className="mx-auto w-full max-w-[1080px]">
              {forwardTargets.selectedTarget ? (
                <TargetEditor
                  key={forwardTargets.selectedTarget.id || "new"}
                  target={forwardTargets.selectedTarget}
                  allFilters={filters}
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
                <Card className="mx-auto max-w-md bg-card/86" size="sm">
                  <CardContent className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                    选择一个通道，或创建新的转发目的地。
                    <Button type="button" size="sm" onClick={handleAddTarget}>
                      <Plus data-icon="inline-start" />
                      新建通道
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
