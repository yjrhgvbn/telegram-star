import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, X } from "lucide-react";
import { useMessages, useStats } from "./hooks/useMessages";
import { useFilters } from "@/hooks/useFilters";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { AppShell } from "@/components/AppShell";
import { FilterPanel } from "./components/FilterPanel";
import { FilterContextPanel } from "./components/FilterContextPanel";
import { MessageList } from "./components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ReadFilter = "all" | "unread" | "read";

export function MessagesFeature() {
  // rawFilterId: undefined = /messages, "all" = 全部消息, other = 指定过滤器
  const { filterId: rawFilterId } = useParams<{ filterId?: string }>();
  const navigate = useNavigate();

  // 是否已选中分组（包含"全部消息"的消息列表视图）
  const isGroupSelected = rawFilterId !== undefined;
  // 传递给 API 的过滤器 ID："all" 视作空字符串（全部消息）
  const selectedFilterId = rawFilterId === "all" ? "" : (rawFilterId ?? "");

  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();

  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { filters, loading: filtersLoading } = useFilters();
  const selectedFilter = filters.find((item) => String(item.id) === selectedFilterId) ?? null;
  const currentTitle = selectedFilterId === "" ? "全部消息" : (selectedFilter?.name ?? "过滤消息");

  const selectedFilterAutoLocate = filters.find((item) => String(item.id) === selectedFilterId)?.autoLocateUnreadNearRead;
  const autoLocateUnreadNearRead = selectedFilterId === "" ? true : (selectedFilterAutoLocate ?? true);
  const apiReadFilter = readFilter === "all" ? undefined : readFilter === "read";
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
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background">
        {/*
          侧边栏（过滤器列表）：
          - 大屏：始终显示
          - 小屏：仅在未选中分组时（/messages）显示，占满全宽
        */}
        <aside
          className={cn(
            "border-r border-border bg-sidebar/66",
            isGroupSelected
              ? "hidden lg:flex lg:w-[264px] lg:flex-col"
              : "flex w-full flex-col lg:w-[264px]"
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
            "min-h-0 flex-col bg-background/74",
            isGroupSelected
              ? "flex min-w-0 flex-1"
              : "hidden lg:flex lg:min-w-0 lg:flex-1"
          )}
        >
          <div className="shrink-0 border-b border-border bg-card/72 backdrop-blur-md">
            <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
              {isGroupSelected ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  onClick={handleBack}
                  aria-label="返回消息分组"
                >
                  <ArrowLeft />
                </Button>
              ) : null}

              <div className="mr-auto min-w-0">
                <h2 className="truncate text-sm font-semibold">{currentTitle}</h2>
                <p className="truncate text-xs text-muted-foreground">{resultLabel}</p>
              </div>

              <form className="hidden w-[min(32vw,360px)] min-w-48 sm:block" onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    className="h-8 bg-background/78 pr-8 pl-8"
                    placeholder="搜索消息"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => setSearchQuery("")}
                      aria-label="清空搜索"
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              </form>

              <Tabs
                value={readFilter}
                onValueChange={(value) => setReadFilter(value as ReadFilter)}
                className="hidden sm:flex"
              >
                <TabsList>
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="unread">未读</TabsTrigger>
                  <TabsTrigger value="read">已读</TabsTrigger>
                </TabsList>
              </Tabs>

              <Button type="button" variant="outline" size="icon-sm" onClick={refresh} aria-label="刷新消息">
                <RefreshCw className={cn(messagesLoading && "animate-spin")} />
              </Button>
            </div>

            <div className="flex items-center gap-2 px-3 pb-2.5 sm:hidden">
              <form className="min-w-0 flex-1" onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    className="h-8 bg-background/78 pr-8 pl-8"
                    placeholder="搜索消息"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchQuery ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={() => setSearchQuery("")}
                      aria-label="清空搜索"
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              </form>
              <Tabs
                value={readFilter}
                onValueChange={(value) => setReadFilter(value as ReadFilter)}
              >
                <TabsList>
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="unread">未读</TabsTrigger>
                  <TabsTrigger value="read">已读</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
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

        <FilterContextPanel
          filters={filters}
          selectedFilter={selectedFilter}
          selectedFilterId={selectedFilterId}
          telegramAuthorized={authStatus.authorized}
        />
      </div>
    </AppShell>
  );
}
