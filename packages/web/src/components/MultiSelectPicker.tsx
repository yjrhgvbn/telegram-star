import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MultiSelectItem {
  id: string;
  title: string;
}

interface MultiSelectPickerProps {
  /**
   * 标签文本，用于显示在触发按钮上
   */
  label?: string;

  /**
   * 所有可选项
   */
  items: MultiSelectItem[];

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
   * 加载状态
   */
  loading?: boolean;

  /**
   * 搜索字段（支持多字段，用 | 分隔）
   */
  searchFields?: string[];

  /**
   * 当选择项变化时的回调
   */
  onSelectionChange: (selected: string[]) => void;

  /**
   * 自定义每个项目的渲染
   */
  renderItem?: (item: MultiSelectItem, isSelected: boolean) => React.ReactNode;

  /**
   * 弹框最大高度（CSS 类或像素值）
   */
  popoverHeight?: string;

  /**
   * 弹框最大宽度（CSS 类或像素值）
   */
  popoverWidth?: string;

  /**
   * 是否已打开
   */
  open?: boolean;

  /**
   * 打开/关闭回调
   */
  onOpenChange?: (open: boolean) => void;
}

export function MultiSelectPicker({
  label,
  items,
  selected,
  searchPlaceholder = "搜索...",
  emptyText = "没有可选项",
  loading = false,
  searchFields = ["title", "id"],
  onSelectionChange,
  renderItem,
  popoverHeight = "max-h-64",
  popoverWidth = "w-72",
  open = false,
  onOpenChange,
}: MultiSelectPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const filteredItems = items.filter((item) => {
    if (!searchInput.trim()) return true;
    const query = searchInput.toLowerCase();
    return searchFields.some((field) => {
      const value = (item as Record<string, any>)[field];
      return value && String(value).toLowerCase().includes(query);
    });
  });

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
      // 计算弹框位置
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPopoverPos({
          top: rect.bottom + 8,
          left: rect.left,
        });
      }
    }
    onOpenChange?.(newOpen);
  };

  // 点击外部关闭弹框
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      if (open) {
        handleOpenChange(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-left text-xs transition",
          open ? "bg-accent/50" : "hover:bg-accent/40",
        )}
        onClick={() => handleOpenChange(!open)}
      >
        <span className="text-muted-foreground">
          {label}
          {selected.length > 0 && <span className="ml-1 font-medium text-foreground">{selected.length}</span>}
        </span>
        <span className="text-[11px] text-muted-foreground">{open ? "收起" : "展开选择"}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={cn(
            "fixed z-50 rounded-lg border border-border/70 bg-background/95 backdrop-blur-sm shadow-lg ring-1 ring-foreground/10",
            popoverHeight,
            popoverWidth,
            "overflow-hidden flex flex-col",
          )}
          style={{
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
          }}
        >
          <div className="border-b border-border/40 p-2">
            <Input placeholder={searchPlaceholder} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} autoFocus className="h-8" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 p-2">
            {loading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">加载中...</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition",
                      isSelected ? "bg-primary/15 text-primary" : "hover:bg-accent/60",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleToggleItem(item.id);
                    }}
                  >
                    {renderItem ? (
                      renderItem(item, isSelected)
                    ) : (
                      <>
                        <span className="truncate">{item.title}</span>
                        <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">{isSelected ? "✓" : ""}</span>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
