import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { useMessages, useStats } from "@/hooks/useMessages";
import { useFilters } from "@/hooks/useFilters";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { AppShell } from "@/components/AppShell";
import { FilterPanel } from "@/components/FilterPanel";
import { MessageList } from "@/components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MessagesPage() {
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
  const { messages, hasMore, isLoadingMore, loading: messagesLoading, toggleRead, refresh, loadMore } = useMessages({
    limit: 20,
    isRead: readFilter,
    filterId: selectedFilterId,
    search: searchQuery,
  });
  useStats();

  const selectedFilterAutoLocate = filters.find((item) => String(item.id) === selectedFilterId)?.autoLocateUnreadNearRead;
  const autoLocateUnreadNearRead = selectedFilterId === "" ? true : (selectedFilterAutoLocate ?? true);

  const autoLocateContextKey = `${selectedFilterId}|${readFilter}|${searchQuery}|${autoLocateUnreadNearRead ? "1" : "0"}`;

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
      activeTab="filtered"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex h-full min-h-0 flex-1">
        {/*
          侧边栏（过滤器列表）：
          - 大屏：始终显示
          - 小屏：仅在未选中分组时（/messages）显示，占满全宽
        */}
        <aside
          className={cn(
            "border-r border-border/60 bg-card/85 backdrop-blur-xl",
            isGroupSelected
              ? "hidden md:flex md:flex-col md:w-[320px]"
              : "flex w-full flex-col sm:w-[320px]"
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
              : "hidden sm:flex sm:min-w-0 sm:flex-1"
          )}
        >
          {/* 小屏返回按钮 */}
          {isGroupSelected && (
            <div className="flex items-center border-b border-border/60 bg-background/55 px-3 py-2 md:hidden">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="mr-1 size-4" />
                返回分组
              </Button>
            </div>
          )}

          <div className="border-b border-border/60 bg-background/55 px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <form className="min-w-55 flex-1" onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    className="h-9 rounded-full bg-card/70 pr-10 pl-9"
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

              <div className="flex items-center gap-2 rounded-full bg-card/70 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => setReadFilter("")}
                >
                  全部
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "false" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => setReadFilter("false")}
                >
                  未读
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={readFilter === "true" ? "default" : "ghost"}
                  className="rounded-full"
                  onClick={() => setReadFilter("true")}
                >
                  已读
                </Button>
              </div>

              <Button type="button" variant="outline" size="icon" onClick={refresh} title="刷新">
                <RefreshCw className={cn(messagesLoading && "animate-spin")} />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
            <MessageList
              messages={messages}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loading={messagesLoading}
              onToggleRead={toggleRead}
              onLoadMore={loadMore}
              searchQuery={searchQuery}
              autoLocateEnabled={autoLocateUnreadNearRead}
              autoLocateContextKey={autoLocateContextKey}
            />
          </div>
        </main>
      </div>
    </AppShell>
  );
}
