import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useFilters } from "@/hooks/useFilters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JoinedChatPickerProps {
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
  label,
  selected,
  searchPlaceholder = "搜索...",
  emptyText = "没有可选项",
  onSelectionChange,
  open,
  onOpenChange,
}: JoinedChatPickerProps) {
  const { chats, chatsLoading } = useFilters();
  const [searchInput, setSearchInput] = useState("");
  const [innerOpen, setInnerOpen] = useState(false);
  const [pinnedSelectedIds, setPinnedSelectedIds] = useState<string[]>([]);
  const resolvedOpen = open ?? innerOpen;
  const selectedSet = new Set(selected);
  const pinnedSelectedSet = new Set(pinnedSelectedIds);

  const filteredItems = chats.filter((item) => {
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

  const selectedTitles = selected
    .map((id) => chats.find((item) => item.id === id)?.title || id)
    .filter(Boolean)
    .join("、");
  const selectedSummary = selected.length > 0
    ? `${label ? `${label} ` : ""}${selected.length} 个会话`
    : (label || "未选择会话");

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
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg bg-card/75 px-3 py-2.5 text-left transition ring-1 ring-foreground/10",
          resolvedOpen ? "bg-accent/55 ring-primary/20" : "hover:bg-background",
        )}
        onClick={() => handleOpenChange(!resolvedOpen)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{selectedSummary}</span>
          {selectedTitles && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selectedTitles}</span>
          )}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition", resolvedOpen && "rotate-180")}
        />
      </button>

      {resolvedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => handleOpenChange(false)}
        >
          <div
            className="flex h-[min(78vh,680px)] w-[min(92vw,680px)] flex-col overflow-hidden rounded-lg bg-background/95 shadow-xl ring-1 ring-foreground/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
              <div>
                <div className="text-base font-semibold">选择会话</div>
                <div className="text-xs text-muted-foreground">已选 {selected.length} 个</div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)}>
                <X />
              </Button>
            </div>

            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  autoFocus
                  className="h-10 bg-card/75 pl-9"
                />
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
              {chatsLoading ? (
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
