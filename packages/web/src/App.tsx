import { useState, useEffect, useCallback } from "react";
import { Database, LogOut, MessagesSquare, RefreshCw, Search, Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api/client";
import { useMessages, useStats } from "./hooks/useMessages";
import { useFilters } from "./hooks/useFilters";
import { TelegramLogin } from "./components/TelegramLogin";
import { FilterPanel } from "./components/FilterPanel";
import { MessageList } from "./components/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuthStatus, LiveChatMessage } from "./types";

function MessagesPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    connected: false,
    authorized: false,
    waitingForCode: false,
    waitingForPassword: false,
  });
  const [authLoading, setAuthLoading] = useState(true);

  // Filters
  const [selectedFilterId, setSelectedFilterId] = useState("");
  const [readFilter, setReadFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"filtered" | "groups">("filtered");
  const [selectedLiveChatId, setSelectedLiveChatId] = useState<string>("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMessagesLoading, setLiveMessagesLoading] = useState(false);
  const [selectedLiveMessages, setSelectedLiveMessages] = useState<LiveChatMessage[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveMessagesError, setLiveMessagesError] = useState<string | null>(null);

  const { filters, chats, loading: filtersLoading, chatsLoading, createFilter, deleteFilter, toggleFilter, refreshChats } = useFilters();
  const { messages, pagination, loading: messagesLoading, toggleRead, refresh } = useMessages({
    page,
    limit: 20,
    isRead: readFilter,
    filterId: selectedFilterId,
    search: searchQuery,
  });
  const { stats } = useStats();

  // Check auth status on mount
  useEffect(() => {
    api.auth
      .status()
      .then(setAuthStatus)
      .catch(() => {
        // If API is not available, still show login
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setAuthStatus((prev) => ({ ...prev, connected: true, authorized: true }));
  }, []);

  const handleLogout = useCallback(async () => {
    await api.auth.logout();
    setAuthStatus({ connected: false, authorized: false, waitingForCode: false, waitingForPassword: false });
  }, []);

  const handleCreateFilter = useCallback(
    async (data: { name: string; conditions: Array<{ type: "keyword" | "group" | "channel"; values: string[] }> }) => {
      await createFilter(data);
    },
    [createFilter]
  );

  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    refresh();
  }, [refresh]);

  const loadLiveChats = useCallback(async () => {
    try {
      setLiveLoading(true);
      setLiveError(null);
      await refreshChats();
      if (selectedLiveChatId && !chats.some((chat) => chat.id === selectedLiveChatId)) {
        setSelectedLiveChatId("");
        setSelectedLiveMessages([]);
      }
    } catch (err: any) {
      setLiveError(err.message || "加载群组消息失败");
    } finally {
      setLiveLoading(false);
    }
  }, [refreshChats, selectedLiveChatId, chats]);

  const loadSelectedChatMessages = useCallback(async (chatId: string) => {
    try {
      setLiveMessagesLoading(true);
      setLiveMessagesError(null);
      const data = await api.chats.messagesByChat({ chatId, limit: 100 });
      setSelectedLiveMessages(data.messages);
    } catch (err: any) {
      setLiveMessagesError(err.message || "读取群组消息失败");
      setSelectedLiveMessages([]);
    } finally {
      setLiveMessagesLoading(false);
    }
  }, []);

  // Auto-refresh messages every 10 seconds
  useEffect(() => {
    if (activeTab !== "filtered") return;
    const interval = setInterval(() => {
      refresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab, refresh]);

  useEffect(() => {
    if (activeTab === "groups" && chats.length === 0 && !chatsLoading && !liveLoading) {
      loadLiveChats();
    }
  }, [activeTab, chats.length, chatsLoading, liveLoading, loadLiveChats]);

  useEffect(() => {
    if (!selectedLiveChatId) {
      setSelectedLiveMessages([]);
      setLiveMessagesError(null);
      return;
    }
    if (activeTab !== "groups") return;
    loadSelectedChatMessages(selectedLiveChatId);
  }, [activeTab, selectedLiveChatId, loadSelectedChatMessages]);

  useEffect(() => {
    if (!selectedLiveChatId) return;
    if (!chats.some((chat) => chat.id === selectedLiveChatId)) {
      setSelectedLiveChatId("");
      setSelectedLiveMessages([]);
      setLiveMessagesError(null);
    }
  }, [chats, selectedLiveChatId]);

  const liveMessageTotal = selectedLiveMessages.length;
  const liveNotStoredTotal = selectedLiveMessages.reduce(
    (sum, message) => sum + (message.inDatabase ? 0 : 1),
    0
  );
  const selectedLiveChat = chats.find((chat) => chat.id === selectedLiveChatId) || null;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm">连接中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.12),transparent_45%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.15),transparent_42%),radial-gradient(circle_at_60%_85%,rgba(251,146,60,0.12),transparent_46%)]" />

      {/* Login overlay */}
      {!authStatus.authorized && (
        <TelegramLogin authStatus={authStatus} onLoginSuccess={handleLoginSuccess} />
      )}

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Telegram 消息中心</h1>
              <p className="text-xs text-muted-foreground">
                {activeTab === "filtered" ? "过滤消息视图" : "群组全量消息视图（点击群组后展示消息）"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === "filtered" ? (
                <>
                  <Badge variant="secondary" className="h-7 rounded-full px-3 text-xs">总消息 {stats.total}</Badge>
                  <Badge className="h-7 rounded-full px-3 text-xs">未读 {stats.unread}</Badge>
                  <Badge variant="outline" className="hidden h-7 rounded-full px-3 text-xs sm:inline-flex">今日 {stats.today}</Badge>
                </>
              ) : (
                <>
                    <Badge variant="secondary" className="h-7 rounded-full px-3 text-xs">群组 {chats.length}</Badge>
                  <Badge className="h-7 rounded-full px-3 text-xs">消息 {liveMessageTotal}</Badge>
                  <Badge variant="outline" className="hidden h-7 rounded-full px-3 text-xs sm:inline-flex">未入库 {liveNotStoredTotal}</Badge>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border/60 px-4 py-2 sm:px-6">
            <div className="inline-flex items-center gap-1 rounded-full bg-card/70 p-1 ring-1 ring-border/60">
              <Button
                type="button"
                size="sm"
                variant={activeTab === "filtered" ? "default" : "ghost"}
                className="rounded-full"
                onClick={() => setActiveTab("filtered")}
              >
                过滤的消息
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === "groups" ? "default" : "ghost"}
                className="rounded-full"
                onClick={() => setActiveTab("groups")}
              >
                群组列表
              </Button>
            </div>
          </div>
        </header>

        {activeTab === "filtered" ? (
          <div className="flex min-h-0 flex-1">
            <aside
              className={cn(
                "hidden border-r border-border/60 bg-card/85 backdrop-blur-xl md:flex md:flex-col",
                sidebarOpen ? "md:w-[320px]" : "md:w-[72px]"
              )}
            >
              <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-lg">⭐</div>
                {sidebarOpen && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">Telegram Star</p>
                    <p className="text-xs text-muted-foreground">更友好的消息追踪台</p>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  aria-label="折叠侧栏"
                >
                  {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
              </div>

              {sidebarOpen && (
                <>
                  <FilterPanel
                    filters={filters}
                    chats={chats}
                    loading={filtersLoading}
                    chatsLoading={chatsLoading}
                    onCreateFilter={handleCreateFilter}
                    onDeleteFilter={deleteFilter}
                    onToggleFilter={toggleFilter}
                    selectedFilterId={selectedFilterId}
                    onSelectFilter={(id) => { setSelectedFilterId(id); setPage(1); }}
                  />

                  {authStatus.authorized && (
                    <div className="border-t border-border/70 p-3">
                      <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
                        <LogOut data-icon="inline-start" />
                        退出登录
                      </Button>
                    </div>
                  )}
                </>
              )}
            </aside>

            <main className="flex min-w-0 flex-1 flex-col">
              <div className="border-b border-border/60 bg-background/55 px-4 py-3 sm:px-6">
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
                          onClick={() => { setSearchQuery(""); setPage(1); }}
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
                      onClick={() => { setReadFilter(""); setPage(1); }}
                    >
                      全部
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={readFilter === "false" ? "default" : "ghost"}
                      className="rounded-full"
                      onClick={() => { setReadFilter("false"); setPage(1); }}
                    >
                      未读
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={readFilter === "true" ? "default" : "ghost"}
                      className="rounded-full"
                      onClick={() => { setReadFilter("true"); setPage(1); }}
                    >
                      已读
                    </Button>
                  </div>

                  <Button type="button" variant="outline" size="icon" onClick={refresh} title="刷新">
                    <RefreshCw className={cn(messagesLoading && "animate-spin")} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="size-4" />
                  <span>智能排序已开启，最新匹配消息优先展示</span>
                </div>
                <MessageList
                  messages={messages}
                  pagination={pagination}
                  loading={messagesLoading}
                  onToggleRead={toggleRead}
                  onPageChange={setPage}
                  searchQuery={searchQuery}
                />
              </div>
            </main>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="w-full border-r border-border/60 bg-card/80 md:w-[320px]">
              <div className="border-b border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">群组列表</p>
                  <Button type="button" variant="outline" size="sm" onClick={loadLiveChats}>
                    <RefreshCw className={cn(liveLoading && "animate-spin")} data-icon="inline-start" />
                    刷新
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">点击群组后右侧显示该群组消息</p>
              </div>

              <div className="max-h-[calc(100vh-180px)] overflow-auto p-2">
                  {liveLoading && chats.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">读取群组中...</p>
                ) : liveError ? (
                  <p className="p-3 text-sm text-destructive">{liveError}</p>
                  ) : chats.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">暂无群组数据</p>
                ) : (
                    chats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className={cn(
                        "mb-1 w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        selectedLiveChatId === chat.id
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/50 bg-background/70 hover:bg-muted/60"
                      )}
                      onClick={() => setSelectedLiveChatId(chat.id)}
                    >
                      <p className="truncate text-sm font-medium">{chat.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{chat.type === "group" ? "群组" : "频道"}</p>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <main className="min-w-0 flex-1 flex-col">
              <div className="border-b border-border/60 bg-background/55 px-4 py-3 sm:px-6">
                <Badge variant="outline" className="h-8 rounded-full px-3">
                  群组消息为实时读取，不自动刷新
                </Badge>
              </div>

              <div className="flex-1 overflow-auto p-4 sm:p-6">
                {!selectedLiveChat ? (
                  <Card className="mx-auto max-w-xl border border-dashed border-border/70 bg-card/60">
                    <CardHeader>
                      <CardTitle>请选择左侧群组</CardTitle>
                      <CardDescription>点击左侧任一群组或频道后，在这里展示对应消息。</CardDescription>
                    </CardHeader>
                  </Card>
                  ) : liveMessagesLoading ? (
                    <Card className="mx-auto max-w-xl border border-dashed border-border/70 bg-card/60">
                      <CardHeader>
                        <CardTitle>读取群组消息中...</CardTitle>
                        <CardDescription>{selectedLiveChat.title}</CardDescription>
                      </CardHeader>
                    </Card>
                  ) : liveMessagesError ? (
                    <Card className="mx-auto max-w-xl border border-destructive/30 bg-destructive/5">
                      <CardHeader>
                        <CardTitle>读取失败</CardTitle>
                        <CardDescription>{liveMessagesError}</CardDescription>
                      </CardHeader>
                    </Card>
                  ) : selectedLiveMessages.length === 0 ? (
                  <Card className="mx-auto max-w-xl border border-dashed border-border/70 bg-card/60">
                    <CardHeader>
                      <CardTitle>{selectedLiveChat.title}</CardTitle>
                      <CardDescription>该会话暂无可显示文本消息。</CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  <div className="space-y-3">
                      {selectedLiveMessages.map((message) => (
                      <div key={`${selectedLiveChat.id}-${message.id}`} className="rounded-lg border border-border/60 bg-background/70 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MessagesSquare className="size-3.5" />
                            {message.senderName || "Unknown"}
                          </span>
                          <span>·</span>
                          <span>{new Date(message.messageDate).toLocaleString("zh-CN")}</span>
                          <Badge variant={message.inDatabase ? "secondary" : "outline"} className="ml-auto">
                            <Database className="mr-1 size-3" />
                            {message.inDatabase ? "已入库" : "未入库"}
                          </Badge>
                        </div>

                        <p className="text-sm leading-6 text-foreground/95">{message.content}</p>

                        {message.telegramLink && (
                          <a
                            href={message.telegramLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex text-xs text-primary underline-offset-4 hover:underline"
                          >
                            打开原消息
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-5xl font-semibold tracking-tight">404</p>
        <p className="text-sm text-muted-foreground">页面不存在，返回消息页继续查看追踪内容。</p>
        <Link
          to="/messages"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          返回消息页
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/messages" replace />} />
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
