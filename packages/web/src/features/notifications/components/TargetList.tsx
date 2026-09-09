import { useMemo, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { ListSearchToolbar } from "@/components/ListSearchToolbar";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { NEW_FORWARD_TARGET_ID, type EditableForwardTarget } from "../types";
import "./TargetList.css";

export function TargetList({
  targets,
  selectedTargetId,
  loading,
  error,
  onRetry,
  onAdd,
  onSelect,
}: {
  targets: EditableForwardTarget[];
  selectedTargetId: string | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onAdd: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleTargets = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? targets.filter((target) =>
          `${target.name} ${target.appriseUrl}`.toLocaleLowerCase().includes(term),
        )
      : targets;
  }, [query, targets]);

  return (
    <section className="forward-library" aria-label="转发通道">
      <ListSearchToolbar mobileTitle="转发">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索通道"
          aria-label="搜索转发通道"
          clearLabel="清空通道搜索"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onAdd}
          disabled={loading}
          aria-label="新建通道"
        >
          <Plus />
        </Button>
      </ListSearchToolbar>
      <div className="forward-library__items">
        {error ? (
          <div className="forward-library__feedback" role="alert">
            <span>通道读取失败：{error}</span>
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={loading}>重试读取通道</Button>
          </div>
        ) : null}
        {loading && !targets.length ? (
          <div className="forward-library__empty" role="status">
            <LoaderCircle className="size-4 animate-spin" />
            读取通道中
          </div>
        ) : !targets.length && error ? null : !targets.length ? (
          <div className="forward-library__empty">
            还没有转发通道
            <Button variant="outline" size="sm" onClick={onAdd}>
              新建通道
            </Button>
          </div>
        ) : !visibleTargets.length ? (
          <div className="forward-library__empty">没有匹配的通道</div>
        ) : (
          visibleTargets.map((target) => {
            const id = target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id);
            const invalid = !target.name.trim() || !target.appriseUrl.trim();
            return (
              <button
                key={id}
                type="button"
                className="forward-library__item"
                aria-current={id === selectedTargetId ? "page" : undefined}
                onClick={() => onSelect(id)}
              >
                <span className="forward-library__title">
                  <span>{target.name.trim() || "新建通道"}</span>
                  <small data-mobile-only={target.enabled && !invalid ? true : undefined}>
                    {invalid ? "待完善" : target.enabled ? "已启用" : "已停用"}
                  </small>
                </span>
                <span className="forward-library__summary">
                  {target.filterIds.length} 条规则
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
