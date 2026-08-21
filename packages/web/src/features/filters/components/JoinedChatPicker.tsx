import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import { selectableItemVariants } from "@/components/ui/selectable-item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ChatDiscoveryResult, JoinedChat } from "@/types";

interface JoinedChatPickerProps {
  /** 可选择的会话。由页面统一请求，避免每个条件编辑器重复订阅查询。 */
  items: JoinedChat[];
  /** 会话是否仍在加载。 */
  loading: boolean;
  /** 未选择会话时显示在触发按钮上的范围文本。 */
  label?: string;
  /** 已选项的 ID 列表。 */
  selected: string[];
  /** 搜索输入框的占位符。 */
  searchPlaceholder?: string;
  /** 没有可选项时的提示文本。 */
  emptyText?: string;
  /** 当选择项变化时的回调。 */
  onSelectionChange: (selected: string[]) => void;
  /** 是否已打开。 */
  open?: boolean;
  /** 打开/关闭回调。 */
  onOpenChange?: (open: boolean) => void;
}

type DiscoveryStatus = "idle" | "loading" | "success" | "error";

interface DiscoveryState {
  status: DiscoveryStatus;
  query: string;
  data: ChatDiscoveryResult[];
  error: string;
}

const discoveryDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function createIdleDiscoveryState(): DiscoveryState {
  return { status: "idle", query: "", data: [], error: "" };
}

function formatDiscoveryDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "时间未知"
    : discoveryDateFormatter.format(parsed);
}

function highlightSnippet(text: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;

  const matchIndex = text.toLocaleLowerCase().indexOf(
    normalizedQuery.toLocaleLowerCase(),
  );
  if (matchIndex < 0) return text;

  const matchEnd = matchIndex + normalizedQuery.length;
  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="rounded-sm bg-primary/12 px-0.5 text-foreground">
        {text.slice(matchIndex, matchEnd)}
      </mark>
      {text.slice(matchEnd)}
    </>
  );
}

function ChatListSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1" aria-label="正在加载会话">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="size-6" />
        </div>
      ))}
    </div>
  );
}

export function JoinedChatPicker({
  items,
  loading,
  label,
  selected,
  searchPlaceholder = "搜索...",
  emptyText = "没有可选项",
  onSelectionChange,
  open,
  onOpenChange,
}: JoinedChatPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [innerOpen, setInnerOpen] = useState(false);
  const [pinnedSelectedIds, setPinnedSelectedIds] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryState>(
    createIdleDiscoveryState,
  );
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const resolvedOpen = open ?? innerOpen;
  const normalizedQuery = searchInput.trim();

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const pinnedSelectedSet = useMemo(
    () => new Set(pinnedSelectedIds),
    [pinnedSelectedIds],
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const sortedItems = useMemo(() => {
    const query = normalizedQuery.toLocaleLowerCase();
    const filteredItems = query
      ? items.filter(
          (item) =>
            item.title.toLocaleLowerCase().includes(query) ||
            item.id.toLocaleLowerCase().includes(query),
        )
      : items;

    return [...filteredItems].sort((a, b) => {
      const aSelected = pinnedSelectedSet.has(a.id);
      const bSelected = pinnedSelectedSet.has(b.id);
      if (aSelected === bSelected) return 0;
      return aSelected ? -1 : 1;
    });
  }, [items, normalizedQuery, pinnedSelectedSet]);

  const selectedItems = useMemo(
    () =>
      selected.map((id) => ({
        id,
        title: itemById.get(id)?.title || id,
      })),
    [itemById, selected],
  );
  const selectedTitles = selectedItems.map((item) => item.title).join("、");

  const handleToggleItem = (id: string) => {
    if (selectedSet.has(id)) {
      onSelectionChange(selected.filter((item) => item !== id));
    } else {
      onSelectionChange([...selected, id]);
    }
  };

  const resetDiscovery = useCallback(() => {
    discoveryAbortRef.current?.abort();
    discoveryAbortRef.current = null;
    setDiscovery(createIdleDiscoveryState());
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      resetDiscovery();
      setSearchInput("");
      if (newOpen) {
        // 只在打开时固定一次置顶基准，避免用户勾选时列表项瞬间跳位。
        setPinnedSelectedIds(selected);
      }
      setInnerOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange, resetDiscovery, selected],
  );

  const handleSearchChange = (value: string) => {
    if (discovery.status !== "idle") resetDiscovery();
    setSearchInput(value);
  };

  const handleDiscover = async () => {
    const query = searchInput.trim();
    if (query.length < 2) return;

    discoveryAbortRef.current?.abort();
    const controller = new AbortController();
    discoveryAbortRef.current = controller;
    setDiscovery({ status: "loading", query, data: [], error: "" });

    try {
      const response = await api.chats.discover(
        { query, limit: 20 },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      setDiscovery({
        status: "success",
        query: response.query,
        data: response.data,
        error: "",
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setDiscovery({
        status: "error",
        query,
        data: [],
        error: error instanceof Error ? error.message : "搜索相关会话失败",
      });
    } finally {
      if (discoveryAbortRef.current === controller) {
        discoveryAbortRef.current = null;
      }
    }
  };

  // 支持 Esc 关闭弹框，并在组件卸载时取消仍在进行的远程搜索。
  useEffect(() => {
    if (!resolvedOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenChange, resolvedOpen]);

  useEffect(
    () => () => {
      discoveryAbortRef.current?.abort();
    },
    [],
  );

  const compactQuery = normalizedQuery.length > 24
    ? `${normalizedQuery.slice(0, 24)}…`
    : normalizedQuery;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={resolvedOpen}
        aria-label={
          selected.length > 0
            ? `已选 ${selected.length} 个会话：${selectedTitles}`
            : label || "选择会话"
        }
        className={cn(
          "flex h-9 w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden rounded-lg border border-input bg-card px-1.5 py-1 text-left shadow-xs transition",
          resolvedOpen
            ? "border-ring ring-3 ring-ring/18"
            : "hover:border-primary/38",
        )}
        onClick={() => handleOpenChange(!resolvedOpen)}
      >
        {selectedItems.length === 0 ? (
          <span className="px-1.5 text-xs text-muted-foreground">
            {label || "选择会话"}
          </span>
        ) : (
          selectedItems.slice(0, 2).map((item) => (
            <span
              key={item.id}
              className="inline-flex min-w-0 max-w-52 items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-foreground"
            >
              <span className="truncate">{item.title}</span>
            </span>
          ))
        )}
        {selectedItems.length > 2 ? (
          <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            +{selectedItems.length - 2}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1 px-1 text-[11px] font-medium text-muted-foreground">
          选择
          <ChevronDown
            className={cn("size-3.5 transition", resolvedOpen && "rotate-180")}
          />
        </span>
      </button>

      {resolvedOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-4 backdrop-blur-[2px]"
          onClick={() => handleOpenChange(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="joined-chat-picker-title"
            className="flex h-[min(80vh,680px)] w-[min(92vw,580px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_70px_color-mix(in_oklab,var(--foreground)_16%,transparent)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <div id="joined-chat-picker-title" className="text-base font-semibold">
                  选择会话
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.length > 0
                    ? `已选 ${selected.length} 个`
                    : "当前匹配全部会话"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selected.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onSelectionChange([])}
                  >
                    改为全部会话
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="关闭会话选择"
                  onClick={() => handleOpenChange(false)}
                >
                  <X />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-3">
              <SearchInput
                name="chat-search"
                aria-label="搜索会话"
                placeholder={searchPlaceholder}
                value={searchInput}
                onChange={(event) => handleSearchChange(event.target.value)}
                onClear={() => handleSearchChange("")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && normalizedQuery.length >= 2) {
                    event.preventDefault();
                    void handleDiscover();
                  }
                }}
                clearLabel="清空会话搜索"
                autoFocus
              />

              {normalizedQuery.length >= 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-dashed text-xs"
                  disabled={discovery.status === "loading"}
                  onClick={() => void handleDiscover()}
                >
                  {discovery.status === "loading" ? (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Search data-icon="inline-start" />
                  )}
                  {discovery.status === "loading"
                    ? `正在消息中查找“${compactQuery}”`
                    : discovery.status === "idle"
                      ? `在已加入会话的消息中查找“${compactQuery}”`
                      : `重新按消息内容查找“${compactQuery}”`}
                </Button>
              ) : normalizedQuery.length > 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">
                  再输入 1 个字符，即可按消息内容发现会话
                </p>
              ) : null}
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 px-3 pb-3">
                <section aria-label={normalizedQuery ? "名称匹配" : "全部已加入会话"}>
                  {normalizedQuery ? (
                    <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
                      <span>名称匹配</span>
                      {!loading ? <span>{sortedItems.length} 个会话</span> : null}
                    </div>
                  ) : null}

                  {loading ? (
                    <ChatListSkeleton />
                  ) : sortedItems.length === 0 ? (
                    <p className="py-5 text-center text-xs text-muted-foreground">
                      {normalizedQuery ? "没有名称匹配的会话" : emptyText}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {sortedItems.map((item) => {
                        const isSelected = selectedSet.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                              selectableItemVariants({
                                kind: "choice",
                                selected: isSelected,
                                surface: "flat",
                              }),
                            )}
                            onClick={() => handleToggleItem(item.id)}
                          >
                            <span className="truncate">{item.title}</span>
                            {isSelected ? (
                              <span
                                className="ml-3 grid size-6 shrink-0 place-items-center rounded-md border border-primary bg-primary text-primary-foreground"
                                aria-hidden="true"
                              >
                                <Check className="size-3.5" strokeWidth={2.5} />
                              </span>
                            ) : (
                              <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                                {item.id}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {discovery.status !== "idle" ? (
                  <>
                    <Separator />
                    <section aria-label="根据消息内容发现">
                      <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
                        <span>根据消息内容发现</span>
                        {discovery.status === "success" ? (
                          <span>本次 {discovery.data.length} 个会话</span>
                        ) : null}
                      </div>

                      {discovery.status === "loading" ? (
                        <ChatListSkeleton />
                      ) : discovery.status === "error" ? (
                        <p role="alert" className="px-3 py-5 text-center text-xs text-destructive">
                          {discovery.error}
                        </p>
                      ) : discovery.data.length === 0 ? (
                        <div className="px-3 py-5 text-center">
                          <p className="text-xs text-muted-foreground">
                            没有从已加入会话的消息中发现相关会话
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/80">
                            可以换一个更具体或更常见的词再试
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {discovery.data.map((result) => {
                            const isSelected = selectedSet.has(result.chat.id);
                            return (
                              <button
                                key={result.chat.id}
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={`${isSelected ? "取消选择" : "选择"}会话：${result.chat.title}`}
                                className={cn(
                                  "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left",
                                  selectableItemVariants({
                                    kind: "choice",
                                    selected: isSelected,
                                    surface: "flat",
                                  }),
                                )}
                                onClick={() => handleToggleItem(result.chat.id)}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-medium">
                                      {result.chat.title}
                                    </span>
                                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                                      {result.chat.type === "channel" ? "频道" : "群组"}
                                    </Badge>
                                  </span>
                                  <span className="mt-1.5 flex flex-col gap-1">
                                    {result.matches.map((match) => (
                                      <span
                                        key={match.messageId}
                                        className="line-clamp-2 text-[11px] leading-4 text-muted-foreground"
                                      >
                                        {highlightSnippet(match.snippet, discovery.query)}
                                        <span className="ml-1 whitespace-nowrap text-[10px] text-muted-foreground/70">
                                          · {formatDiscoveryDate(match.messageDate)}
                                        </span>
                                      </span>
                                    ))}
                                  </span>
                                </span>
                                {isSelected ? (
                                  <span
                                    className="grid size-6 shrink-0 place-items-center rounded-md border border-primary bg-primary text-primary-foreground"
                                    aria-hidden="true"
                                  >
                                    <Check className="size-3.5" strokeWidth={2.5} />
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                          <p className="px-2 pt-1 text-[10px] text-muted-foreground/75">
                            仅显示 Telegram 本次返回的相关会话，不代表完整统计
                          </p>
                        </div>
                      )}
                    </section>
                  </>
                ) : null}
              </div>
            </ScrollArea>

            <Separator />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {selected.length > 0
                  ? `已选 ${selected.length} 个会话`
                  : "未选择时匹配全部会话"}
              </span>
              <Button type="button" size="sm" onClick={() => handleOpenChange(false)}>
                完成
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
