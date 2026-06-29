import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Inbox,
  Plus,
  RefreshCw,
  Webhook,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TargetEditor,
  TargetList,
  useForwardTargets,
} from "@/features/notifications";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";

export function NotificationsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters } = useFilters();
  const forwardTargets = useForwardTargets();

  return (
    <AppShell
      activeTab="notifications"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 lg:px-5">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
            <header className="rounded-lg bg-card/80 p-4 shadow-sm ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <BellRing className="size-4" />
                    通知转发
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                    转发通道
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <Webhook className="size-3.5" />
                    {forwardTargets.targets.length} 个通道
                  </Badge>
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {forwardTargets.enabledTargets} 个启用
                  </Badge>
                  <Badge variant="outline" className="h-7 rounded-lg px-2.5">
                    {forwardTargets.subscribedRules} 个规则
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={forwardTargets.refresh}
                    disabled={forwardTargets.loading}
                  >
                    <RefreshCw
                      className={cn(forwardTargets.loading && "animate-spin")}
                      data-icon="inline-start"
                    />
                    刷新
                  </Button>
                  <Button type="button" size="sm" onClick={forwardTargets.addTarget}>
                    <Plus data-icon="inline-start" />
                    新建
                  </Button>
                </div>
              </div>
            </header>

            {forwardTargets.error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
                <AlertCircle className="size-4 shrink-0" />
                <span>{forwardTargets.error}</span>
              </div>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="min-w-0">
                <TargetList
                  targets={forwardTargets.visibleTargets}
                  selectedTargetId={forwardTargets.selectedTargetId}
                  loading={forwardTargets.loading}
                  onAdd={forwardTargets.addTarget}
                  onSelect={forwardTargets.setSelectedTargetId}
                />
              </aside>

              <div className="min-w-0">
                {forwardTargets.selectedTarget ? (
                  <TargetEditor
                    key={forwardTargets.selectedTarget.id || "new"}
                    target={forwardTargets.selectedTarget}
                    allFilters={filters}
                    onDraftChange={forwardTargets.setDraftTarget}
                    onSave={forwardTargets.saveTarget}
                    onDelete={forwardTargets.deleteTarget}
                    onTest={forwardTargets.testTarget}
                  />
                ) : (
                  <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
                    <CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                      <Inbox className="size-7 text-muted-foreground/70" />
                      选择或新建一个转发通道
                      <Button type="button" size="sm" onClick={forwardTargets.addTarget}>
                        <Plus data-icon="inline-start" />
                        新建通道
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
