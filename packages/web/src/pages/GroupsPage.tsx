import { useCallback, useEffect, useState } from "react";
import { Database, MessagesSquare, RefreshCw } from "lucide-react";
import { useFilters } from "@/hooks/useFilters";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LiveChatMessage } from "@/types";

export function GroupsPage() {
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { chats, refreshChats, chatsLoading } = useFilters();

  const [selectedLiveChatId, setSelectedLiveChatId] = useState<string>("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMessagesLoading, setLiveMessagesLoading] = useState(false);
  const [selectedLiveMessages, setSelectedLiveMessages] = useState<LiveChatMessage[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveMessagesError, setLiveMessagesError] = useState<string | null>(null);

  const loadLiveChats = useCallback(async () => {
    try {
      setLiveLoading(true);
      setLiveError(null);
      await refreshChats();
    } catch (err: any) {
      setLiveError(err.message || "加载群组消息失败");
    } finally {
      setLiveLoading(false);
    }
  }, [refreshChats]);

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

  useEffect(() => {
    if (chats.length === 0 && !chatsLoading && !liveLoading) {
      loadLiveChats();
    }
  }, [chats.length, chatsLoading, liveLoading, loadLiveChats]);

  useEffect(() => {
    if (!selectedLiveChatId) {
      setSelectedLiveMessages([]);
      setLiveMessagesError(null);
      return;
    }

    loadSelectedChatMessages(selectedLiveChatId);
  }, [selectedLiveChatId, loadSelectedChatMessages]);

  useEffect(() => {
    if (!selectedLiveChatId) {
      return;
    }

    if (!chats.some((chat) => chat.id === selectedLiveChatId)) {
      setSelectedLiveChatId("");
      setSelectedLiveMessages([]);
      setLiveMessagesError(null);
    }
  }, [chats, selectedLiveChatId]);

  const selectedLiveChat = chats.find((chat) => chat.id === selectedLiveChatId) || null;

  return (
    <AppShell
      activeTab="groups"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="mt-0 flex min-h-0 flex-1 flex-col md:flex-row">
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
    </AppShell>
  );
}
