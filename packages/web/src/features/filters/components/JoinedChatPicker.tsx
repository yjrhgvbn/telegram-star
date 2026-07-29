import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JoinedChat } from "@/types";

interface JoinedChatPickerProps {
  /**
   * 可选择的会话。由页面统一请求，避免每个条件编辑器重复订阅查询。
   */
  items: JoinedChat[];

  /**
   * 会话是否仍在加载。
   */
  loading: boolean;

  /**
   * 标签文本，用于显示在触发按钮上
   */
  label?: string;

  /**
   * 已选项的 ID 列表
   */
  selected: string[];

  /**
   * 搜索输入框的占位符
   */
  searchPlaceholder?: string;

  /**
   * 没有可选项时的提示文本
   */
  emptyText?: string;

  /**
   * 当选择项变化时的回调
   */
  onSelectionChange: (selected: string[]) => void;

  /**
   * 是否已打开
   */
  open?: boolean;

  /**
   * 打开/关闭回调
   */
  onOpenChange?: (open: boolean) => void;
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
  const resolvedOpen = open ?? innerOpen;
  const selectedSet = new Set(selected);
  const pinnedSelectedSet = new Set(pinnedSelectedIds);

  const filteredItems = items.filter((item) => {
    if (!searchInput.trim()) return true;
    const query = searchInput.toLowerCase();
    return item.title.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const aSelected = pinnedSelectedSet.has(a.id);
    const bSelected = pinnedSelectedSet.has(b.id);
    if (aSelected === bSelected) return 0;
    return aSelected ? -1 : 1;
  });

  const selectedItems = selected.map((id) => ({
    id,
    title: items.find((item) => item.id === id)?.title || id,
  }));
  const selectedTitles = selectedItems.map((item) => item.title).join("、");

  const handleToggleItem = (id: string) => {
    if (selected.includes(id)) {
      onSelectionChange(selected.filter((item) => item !== id));
    } else {
      onSelectionChange([...selected, id]);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSearchInput("");
      // 只在打开时固定一次置顶基准，避免用户勾选时列表项瞬间跳位。
      setPinnedSelectedIds(selected);
    }
    setInnerOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  // 支持 Esc 关闭弹框
  useEffect(() => {
    if (!resolvedOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [resolvedOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={resolvedOpen}
        aria-label={
          selected.length > 0
            ? `${label ? `${label}，` : ""}已选 ${selected.length} 个会话：${selectedTitles}`
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
          <span className="px-1.5 text-xs text-muted-foreground">选择会话</span>
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

      {resolvedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/18 p-4 backdrop-blur-[2px]"
          onClick={() => handleOpenChange(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="joined-chat-picker-title"
            className="flex h-[min(72vh,620px)] w-[min(92vw,560px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_70px_rgba(32,50,45,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <div id="joined-chat-picker-title" className="text-base font-semibold">选择会话</div>
                <div className="text-xs text-muted-foreground">已选 {selected.length} 个</div>
              </div>
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

            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="chat-search"
                  aria-label="搜索会话"
                  placeholder={searchPlaceholder}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  autoFocus
                  className="h-9 bg-background/78 pl-9"
                />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
              {loading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">加载中...</p>
              ) : sortedItems.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
              ) : (
                sortedItems.map((item) => {
                  const isSelected = selectedSet.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                        isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/65",
                      )}
                      onClick={() => handleToggleItem(item.id)}
                    >
                      <span className="truncate">{item.title}</span>
                      <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                        {isSelected ? <Check className="size-4 text-primary" /> : item.id}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
