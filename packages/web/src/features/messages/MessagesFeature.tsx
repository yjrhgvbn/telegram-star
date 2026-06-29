import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { useMessages, useStats } from "./hooks/useMessages";
import { useFilters } from "@/hooks/useFilters";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { AppShell } from "@/components/AppShell";
import { FilterPanel } from "./components/FilterPanel";
import { MessageList } from "./components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MessagesFeature() {
  // rawFilterId: undefined = /messages, "all" = 全部消息, other = 指定过滤器
  const { filterId: rawFilterId } = useParams<{ filterId?: string }>();
  const navigate = useNavigate();

  // 是否已选中分组（包含"全部消息"的消息列表视图）
  const isGroupSelected = rawFilterId !== undefined;
  // 传递给 API 的过滤器 ID："all" 视作空字符串（全部消息）
  const selectedFilterId = rawFilterId === "all" ? "" : (rawFilterId ?? "");

  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();

  const [readFilter, setReadFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const { filters, loading: filtersLoading } = useFilters();
  const selectedFilter = filters.find((item) => String(item.id) === selectedFilterId) ?? null;
  const currentTitle = selectedFilterId === "" ? "全部消息" : (selectedFilter?.name ?? "过滤消息");

  const selectedFilterAutoLocate = filters.find((item) => String(item.id) === selectedFilterId)?.autoLocateUnreadNearRead;
  const autoLocateUnreadNearRead = selectedFilterId === "" ? true : (selectedFilterAutoLocate ?? true);
  const apiReadFilter = readFilter === "" ? undefined : readFilter === "true";
  const apiFilterId = selectedFilterId ? Number(selectedFilterId) : undefined;

  const {
    messages,
    hasOlder,
    hasNewer,
    loading: messagesLoading,
    loadingOlder,
    loadingNewer,
    anchorId,
    hasPendingNew,
    loadOlder,
    loadNewer,
    flushPending,
    setAtBottom,
    toggleRead,
    markAsReadLocal,
    refresh,
  } = useMessages({
    limit: 20,
    isRead: apiReadFilter,
    filterId: apiFilterId,
    search: searchQuery || undefined,
    autoLocateEnabled: autoLocateUnreadNearRead,
  });
  const resultLabel = messagesLoading ? "同步中" : `${messages.length} 条当前结果`;
  useStats();

  // 选择过滤器：更新路由，由路由驱动状态
  const handleSelectFilter = useCallback(
    (id: string) => {
      navigate(id === "" ? "/messages/all" : `/messages/${id}`);
    },
    [navigate]
  );

  // 小屏返回分组列表
  const handleBack = useCallback(() => {
    navigate("/messages");
  }, [navigate]);

  const handleSearch = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      refresh();
    },
    [refresh]
  );

  return (
    <AppShell
      activeTab="messages"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="relative mt-0 flex h-full min-h-0 flex-1 overflow-hidden bg-[linear-gradient(135deg,color-mix(in_oklab,var(--background)_96%,white),color-mix(in_oklab,var(--accent)_16%,var(--background)))]">
        {/*
          侧边栏（过滤器列表）：
          - 大屏：始终显示
          - 小屏：仅在未选中分组时（/messages）显示，占满全宽
        */}
        <aside
          className={cn(
            "bg-background/58 backdrop-blur-xl lg:bg-background/46 lg:shadow-[10px_0_28px_-28px_color-mix(in_oklab,var(--foreground)_48%,transparent)]",
            isGroupSelected
              ? "hidden lg:flex lg:w-[300px] lg:flex-col xl:w-[320px]"
              : "flex w-full flex-col lg:w-[300px] xl:w-[320px]"
          )}
        >
          <FilterPanel
            filters={filters}
            loading={filtersLoading}
            selectedFilterId={selectedFilterId}
            onSelectFilter={handleSelectFilter}
          />
        </aside>

        {/*
          主内容区（消息列表）：
          - 大屏：始终显示
          - 小屏：仅在已选中分组时（/messages/:filterId）显示
        */}
        <main
          className={cn(
            "flex-col min-h-0",
            isGroupSelected
              ? "flex min-w-0 flex-1"
              : "hidden lg:flex lg:min-w-0 lg:flex-1"
          )}
        >
          {/* 小屏返回按钮 */}
          {isGroupSelected && (
            <div className="flex items-center justify-between gap-3 bg-background/86 px-3 py-2 shadow-sm lg:hidden">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="mr-1 size-4" />
                {currentTitle}
              </Button>
              <span className="shrink-0 text-xs text-muted-foreground">{resultLabel}</span>
            </div>
          )}

          {isGroupSelected && (
            <div className="space-y-2 px-4 pt-3 pb-2 lg:hidden">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    className="h-10 rounded-lg border-transparent bg-card/82 pr-10 pl-9 shadow-inner shadow-background/50 focus-visible:border-transparent"
                    placeholder="搜索消息内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => setSearchQuery("")}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </form>

              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-card/68 p-1 shadow-inner shadow-background/50 ring-1 ring-border/20">
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("")}
                  >
                    全部
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "false" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("false")}
                  >
                    未读
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "true" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("true")}
                  >
                    已读
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 bg-card/68 shadow-sm ring-1 ring-border/20"
                  onClick={refresh}
                  title="刷新"
                >
                  <RefreshCw className={cn(messagesLoading && "animate-spin")} />
                </Button>
              </div>
            </div>
          )}

          <div className="hidden pt-3 pb-2 sm:pb-3 lg:block">
            <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
              <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-none bg-transparent px-0 py-1 shadow-none ring-0 backdrop-blur-md sm:rounded-lg sm:bg-background/68 sm:px-3 sm:py-2 sm:shadow-[0_10px_30px_-28px_color-mix(in_oklab,var(--foreground)_48%,transparent)] sm:ring-1 sm:ring-border/22">
                <div className="mr-auto min-w-36">
                  <h2 className="truncate text-base font-semibold leading-tight">{currentTitle}</h2>
                  <p className="text-xs text-muted-foreground">{resultLabel}</p>
                </div>

                <form className="min-w-52 flex-1 sm:max-w-md" onSubmit={handleSearch}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      className="h-9 rounded-lg border-transparent bg-card/82 pr-10 pl-9 shadow-inner shadow-background/50 focus-visible:border-transparent"
                      placeholder="搜索消息内容..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={() => setSearchQuery("")}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </form>

                <div className="flex items-center gap-1 rounded-lg bg-card/68 p-1 shadow-inner shadow-background/50 ring-1 ring-border/20">
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("")}
                  >
                    全部
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "false" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("false")}
                  >
                    未读
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={readFilter === "true" ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setReadFilter("true")}
                  >
                    已读
                  </Button>
                </div>

                <Button type="button" variant="ghost" size="icon" className="bg-card/68 shadow-sm ring-1 ring-border/20" onClick={refresh} title="刷新">
                  <RefreshCw className={cn(messagesLoading && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-linear-to-b from-background/40 to-transparent" />
            <MessageList
              messages={messages}
              hasOlder={hasOlder}
              hasNewer={hasNewer}
              loading={messagesLoading}
              loadingOlder={loadingOlder}
              loadingNewer={loadingNewer}
              anchorId={anchorId}
              hasPendingNew={hasPendingNew}
              onLoadOlder={loadOlder}
              onLoadNewer={loadNewer}
              onFlushPending={flushPending}
              onSetAtBottom={setAtBottom}
              onToggleRead={toggleRead}
              markAsReadLocal={markAsReadLocal}
              searchQuery={searchQuery}
            />
          </div>
        </main>
      </div>
    </AppShell>
  );
}
