import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Field } from "@base-ui/react/field";
import { Popover } from "@base-ui/react/popover";
import { ALL_MESSAGES_SYSTEM_KEY } from "@telegram-star/shared/contracts/filters";
import { ArrowLeft, Check, ChevronDown, ChevronRight, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSearchToolbar } from "@/components/ListSearchToolbar";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Filter, FilterGroup, FilterGroupOrderInput } from "@/types";
import { FilterPanelItem } from "./FilterPanelItem";
import {
  getGroupSectionId,
  reorderIds,
  UNGROUPED_SECTION_ID,
} from "../utils/filterPanelOrder";
import "./FilterPanel.css";

type MaybePromise = Promise<unknown> | unknown;
type MenuKind = "create" | "group" | "filter";
type MenuView = "menu" | "rename" | "move" | "delete";

interface Props {
  filters: Filter[];
  filterGroups: FilterGroup[];
  ungroupedPosition: number;
  loading: boolean;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
  onCreateGroup: (name: string) => MaybePromise;
  onRenameGroup: (id: number, name: string) => MaybePromise;
  onEditFilter?: (id: number) => void;
  onDeleteGroup: (id: number) => MaybePromise;
  onReorderGroups: (input: FilterGroupOrderInput) => MaybePromise;
  onSetPlacement: (id: number, manualGroupId: number | null, targetIndex?: number) => MaybePromise;
}

interface MenuState {
  kind: MenuKind;
  id: number | null;
  name: string;
  view: MenuView;
  triggerId: string;
}

function getGroupIdFromSectionId(sectionId: string): number | null {
  if (sectionId === UNGROUPED_SECTION_ID) return null;
  const groupId = Number(String(sectionId).replace("section:group:", ""));
  return Number.isFinite(groupId) ? groupId : null;
}

function sortManualFilters(filters: Filter[]): Filter[] {
  return [...filters].sort(
    (left, right) =>
      left.manualSortOrder - right.manualSortOrder ||
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      left.id - right.id,
  );
}

function matchesFilter(filter: Filter, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const conditionText = filter.conditions
    .flatMap((condition) => condition.values)
    .join(" ");
  return `${filter.name} ${conditionText}`
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "操作失败，请重试";
}

function menuTriggerId(kind: MenuKind, id: number | null): string {
  return `message-filter-${kind}-${id ?? "new"}`;
}

function MenuTrigger({ kind, id, name, disabled }: {
  kind: MenuKind;
  id: number | null;
  name: string;
  disabled: boolean;
}) {
  return (
    <Popover.Trigger
      id={menuTriggerId(kind, id)}
      data-panel-kind={kind}
      data-panel-id={id ?? undefined}
      data-panel-name={name}
      data-panel-focus={kind === "create" ? "create" : undefined}
      disabled={disabled}
      render={(
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={kind === "create" ? undefined : "message-filter-menu-trigger"}
          aria-label={kind === "create" ? "新建目录" : `${kind === "group" ? "目录" : "消息组"} ${name}的操作`}
          title={kind === "create" ? "新建目录" : "更多操作"}
        />
      )}
    >
      {kind === "create" ? <Plus /> : <MoreHorizontal />}
    </Popover.Trigger>
  );
}

export function FilterPanel({
  filters,
  filterGroups,
  ungroupedPosition,
  loading,
  selectedFilterId,
  onSelectFilter,
  onCreateGroup,
  onRenameGroup,
  onEditFilter,
  onDeleteGroup,
  onReorderGroups,
  onSetPlacement,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(true);
  const lastTriggerRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const reorderFocusRef = useRef<"up" | "down" | null>(null);
  const [query, setQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [moveQuery, setMoveQuery] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [bottomPadding, setBottomPadding] = useState(12);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sortedGroups = useMemo(
    () => [...filterGroups].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [filterGroups],
  );
  const knownGroupIds = useMemo(() => new Set(sortedGroups.map((group) => group.id)), [sortedGroups]);
  const filtersById = useMemo(() => new Map(filters.map((filter) => [filter.id, filter])), [filters]);
  const manualFiltersByGroup = useMemo(() => {
    const grouped = new Map<number | null, Filter[]>([[null, []]]);
    for (const group of sortedGroups) grouped.set(group.id, []);
    for (const filter of filters) {
      const groupId = filter.manualGroupId !== null && knownGroupIds.has(filter.manualGroupId) ? filter.manualGroupId : null;
      grouped.get(groupId)?.push(filter);
    }
    for (const [groupId, items] of grouped) grouped.set(groupId, sortManualFilters(items));
    return grouped;
  }, [filters, knownGroupIds, sortedGroups]);
  const allSectionIds = useMemo(() => {
    const ids = sortedGroups.map((group) => getGroupSectionId(group.id));
    // The persisted layout stores one position for independent entries. Keep
    // that contract while removing the artificial ungrouped directory in UI.
    ids.splice(Math.min(Math.max(ungroupedPosition, 0), ids.length), 0, UNGROUPED_SECTION_ID);
    return ids;
  }, [sortedGroups, ungroupedPosition]);
  const orderedSections = useMemo(() => {
    const groupsById = new Map(sortedGroups.map((group) => [group.id, group]));
    return allSectionIds.flatMap((sectionId) => {
      const groupId = getGroupIdFromSectionId(sectionId);
      const group = groupId === null ? null : groupsById.get(groupId);
      const items = manualFiltersByGroup.get(groupId) ?? [];
      const groupMatches = group?.name.toLocaleLowerCase().includes(normalizedQuery);
      const visibleItems = groupMatches ? items : items.filter((filter) => matchesFilter(filter, normalizedQuery));
      if (groupId === null && visibleItems.length === 0) return [];
      if (normalizedQuery && !groupMatches && visibleItems.length === 0) return [];
      return [{ sectionId, group, groupId, visibleItems }];
    });
  }, [allSectionIds, manualFiltersByGroup, normalizedQuery, sortedGroups]);
  const latestMessageAt = useMemo(() => {
    let latest: string | null = null;
    let latestTimestamp = Number.NEGATIVE_INFINITY;
    for (const filter of filters) {
      const timestamp = filter.latestMessageAt ? Date.parse(filter.latestMessageAt) : Number.NaN;
      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latest = filter.latestMessageAt;
      }
    }
    return latest;
  }, [filters]);

  const targetFilter = menu?.kind === "filter" && menu.id !== null ? filtersById.get(menu.id) : undefined;
  const targetGroupId = targetFilter?.manualGroupId !== null && targetFilter?.manualGroupId !== undefined && knownGroupIds.has(targetFilter.manualGroupId)
    ? targetFilter.manualGroupId : null;
  const targetItems = manualFiltersByGroup.get(targetGroupId) ?? [];
  const reorderableSections = allSectionIds.filter((id) => id !== UNGROUPED_SECTION_ID || (manualFiltersByGroup.get(null)?.length ?? 0) > 0);
  const targetOrder = menu?.kind === "filter"
    ? targetItems.map((filter) => filter.id)
    : reorderableSections;
  const targetOrderId = menu?.kind === "filter" ? menu.id : menu?.id === null || menu?.id === undefined ? null : getGroupSectionId(menu.id);
  const targetIndex = targetOrder.findIndex((id) => id === targetOrderId);
  const moveOptions = [{ id: null, name: "独立显示" }, ...sortedGroups]
    .filter((group) => group.name.toLocaleLowerCase().includes(moveQuery.trim().toLocaleLowerCase()));
  const isNameForm = menu?.kind === "create" || (menu?.kind === "group" && menu.view === "rename");
  const menuTitle = menu?.kind === "create" ? "新建目录"
    : menu?.view === "rename" ? "重命名目录"
    : menu?.view === "move" ? "移动到目录"
    : menu?.view === "delete" ? "删除目录"
    : menu?.name ?? "消息组操作";

  const focusElement = useCallback((key: string | null) => {
    const target = key ? panelRef.current?.querySelector<HTMLElement>(`[data-panel-focus="${key}"]`) : null;
    return target ?? panelRef.current?.querySelector<HTMLInputElement>("input[type=search]") ?? null;
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const target = focusElement(focusTarget);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "nearest" });
    setFocusTarget(null);
  }, [focusTarget, filters, filterGroups, focusElement]);

  useEffect(() => {
    if (!isNameForm) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isNameForm, menu?.triggerId]);

  const menuOpen = menu !== null;
  useEffect(() => {
    if (actionPending || !menuOpen || !reorderFocusRef.current) return;
    // Run after the new order is committed so an offscreen row becomes visible
    // before Base UI positions the same popup against its stable trigger.
    if (menu?.id !== null && menu?.id !== undefined) focusElement(`${menu.kind}-${menu.id}`)?.scrollIntoView?.({ block: "nearest" });
    const preferred = popupRef.current?.querySelector<HTMLButtonElement>(`[data-panel-reorder="${reorderFocusRef.current}"]:not(:disabled)`);
    const available = preferred ?? popupRef.current?.querySelector<HTMLButtonElement>("[data-panel-reorder]:not(:disabled)");
    // Keep keyboard focus inside the open popup. At the first/last position,
    // choose the remaining direction instead of focusing a disabled button.
    (available ?? popupRef.current)?.focus({ preventScroll: true });
    reorderFocusRef.current = null;
  }, [actionPending, menuOpen, menu?.kind, menu?.id, targetIndex, focusElement]);

  useEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const panelBottom = panelRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
      const visibleBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      // The page ends above the mobile tab bar; using its actual edge includes
      // device safe-area insets and avoids covering navigation with a popup.
      setBottomPadding(Math.max(12, visibleBottom - Math.min(visibleBottom, panelBottom) + 8));
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [menuOpen]);

  function handleOpenChange(open: boolean, details: Popover.Root.ChangeEventDetails) {
    if (!open) {
      reorderFocusRef.current = null;
      restoreFocusRef.current = details.reason !== "outside-press" && details.reason !== "focus-out";
      setMenu(null);
      setActionError(null);
      return;
    }
    const trigger = details.trigger as HTMLElement | undefined;
    const kind = trigger?.dataset.panelKind as MenuKind | undefined;
    if (!trigger || !kind) return;
    const id = kind === "create" ? null : Number(trigger.dataset.panelId);
    if (id !== null && !Number.isFinite(id)) return;
    restoreFocusRef.current = true;
    reorderFocusRef.current = null;
    lastTriggerRef.current = trigger.id;
    setMenu({ kind, id, name: trigger.dataset.panelName ?? "", view: "menu", triggerId: trigger.id });
    setNameDraft("");
    setMoveQuery("");
    setActionError(null);
  }

  async function runAction(
    task: () => MaybePromise,
    successMessage: string,
    target: string | null,
    onSuccess?: (result: unknown) => void,
    keepMenuOpen = false,
  ) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setActionPending(true);
    setActionError(null);
    try {
      const result = await task();
      if (!keepMenuOpen) {
        restoreFocusRef.current = false;
        setMenu(null);
        if (target) setFocusTarget(target);
      }
      setAnnouncement(successMessage);
      onSuccess?.(result);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      pendingRef.current = false;
      setActionPending(false);
    }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!menu || menu.kind === "filter") return;
    const name = nameDraft.trim();
    const duplicate = filterGroups.some((item) => item.id !== menu.id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!name || duplicate) {
      setActionError(!name ? "请输入名称" : "目录名称已存在");
      nameInputRef.current?.focus();
      return;
    }
    if (menu.kind === "create") {
      void runAction(() => onCreateGroup(name), "目录已创建", null, (result) => {
        setQuery("");
        const id = typeof result === "object" && result !== null && "id" in result ? result.id : undefined;
        setFocusTarget(typeof id === "number" ? `group-${id}` : "create");
      });
    } else if (menu.id !== null) {
      const id = menu.id;
      void runAction(() => onRenameGroup(id, name), "名称已保存", `group-${id}`);
    }
  }

  function moveFilter(id: number, groupId: number | null, index?: number, keepMenuOpen = false) {
    void runAction(() => onSetPlacement(id, groupId, index), "消息组位置已更新", `filter-${id}`, () => {
      if (groupId !== null) setCollapsed((current) => { const next = new Set(current); next.delete(groupId); return next; });
    }, keepMenuOpen);
  }

  function reorderSections(nextIds: string[], target: string | null, keepMenuOpen = false) {
    const ids = nextIds.flatMap((sectionId) => {
      const id = getGroupIdFromSectionId(sectionId);
      return id === null ? [] : [id];
    });
    void runAction(() => onReorderGroups({ ids, ungroupedPosition: nextIds.indexOf(UNGROUPED_SECTION_ID) }), "目录顺序已更新", target, undefined, keepMenuOpen);
  }

  function reorderFromMenu(offset: number) {
    if (pendingRef.current || !menu || menu.id === null || targetIndex < 0 || !targetOrder[targetIndex + offset]) return;
    reorderFocusRef.current = offset < 0 ? "up" : "down";
    popupRef.current?.focus({ preventScroll: true });
    if (menu.kind === "filter") moveFilter(menu.id, targetGroupId, targetIndex + offset, true);
    else {
      const next = reorderIds(allSectionIds, getGroupSectionId(menu.id), reorderableSections[targetIndex + offset]);
      if (next) reorderSections(next, `group-${menu.id}`, true);
    }
  }

  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).matches("input") || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-panel-menu-item]:not(:disabled)")];
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  function renameTarget() {
    if (menu?.kind !== "group") return;
    setNameDraft(menu.name);
    setActionError(null);
    setMenu({ ...menu, view: "rename" });
  }

  function closeAfterNavigation(id: number) {
    restoreFocusRef.current = false;
    setMenu(null);
    onEditFilter?.(id);
  }

  return (
    <Popover.Root open={menuOpen} triggerId={menu?.triggerId ?? null} onOpenChange={handleOpenChange}>
      <div ref={panelRef} className="message-filter-panel">
        <ListSearchToolbar mobileTitle="消息">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="搜索消息组"
            aria-label="搜索消息组"
            clearLabel="清空消息组搜索"
          />
          <MenuTrigger kind="create" id={null} name="" disabled={actionPending} />
        </ListSearchToolbar>
        {actionError && !menuOpen ? <p role="alert" className="message-filter-error">{actionError}</p> : null}
        <ScrollArea className="message-filter-scroll">
          <nav className="message-filter-items" aria-label="消息组与目录">
            {loading ? (
              <div className="message-filter-loading" aria-label="加载消息组">
                {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
              </div>
            ) : (
              orderedSections.map(({ sectionId, group, groupId, visibleItems }) => {
                const isCollapsed = groupId !== null && !normalizedQuery && collapsed.has(groupId);
                const Chevron = isCollapsed ? ChevronRight : ChevronDown;
                return (
                  <section key={sectionId} className={cn("message-filter-section", groupId === null && "is-independent", group && visibleItems.length === 0 && "is-empty")}>
                    {group ? (
                      <div className="message-filter-section-heading">
                        <button
                          type="button"
                          className="message-filter-section-toggle"
                          data-panel-focus={`group-${group.id}`}
                          aria-label={`${isCollapsed ? "展开" : "收起"}目录 ${group.name}`}
                          aria-expanded={!isCollapsed}
                          aria-controls={`message-filter-directory-${group.id}`}
                          onClick={() => setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                            return next;
                          })}
                        >
                          <Chevron aria-hidden="true" />
                          <h3>{group.name}</h3>
                        </button>
                        {!isCollapsed && visibleItems.length === 0 ? <span className="message-filter-empty-inline">空目录</span> : null}
                        <MenuTrigger kind="group" id={group.id} name={group.name} disabled={actionPending} />
                      </div>
                    ) : null}
                    {!isCollapsed ? (
                      <div className={group ? "message-filter-directory-items" : undefined} id={group ? `message-filter-directory-${group.id}` : undefined}>
                        {visibleItems.map((filter) => (
                          <FilterPanelItem
                            key={filter.id}
                            filter={filter}
                            selectedFilterId={selectedFilterId}
                            nowMs={nowMs}
                            latestMessageAt={filter.systemKey === ALL_MESSAGES_SYSTEM_KEY ? latestMessageAt : undefined}
                            onSelectFilter={onSelectFilter}
                            actions={<MenuTrigger kind="filter" id={filter.id} name={filter.name} disabled={actionPending} />}
                          />
                        ))}
                        {visibleItems.length === 0 ? <p className="message-filter-empty-directory">暂无消息组</p> : null}
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
            {!loading && orderedSections.length === 0 ? <p className="message-filter-empty">{normalizedQuery ? "没有匹配的目录或消息组" : "还没有消息组"}</p> : null}
          </nav>
        </ScrollArea>
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </div>
      <Popover.Portal>
        <Popover.Positioner
          className="message-theme message-filter-popover-positioner"
          positionMethod="fixed"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={{ top: 12, right: 12, bottom: bottomPadding, left: 12 }}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
        >
          <Popover.Popup
            ref={popupRef}
            className="message-theme message-filter-popover"
            initialFocus={() => nameInputRef.current ?? popupRef.current?.querySelector<HTMLButtonElement>("[data-panel-menu-item]:not(:disabled)") ?? true}
            finalFocus={() => restoreFocusRef.current
              ? (lastTriggerRef.current ? document.getElementById(lastTriggerRef.current) : null) ?? focusElement(null)
              : false}
            onKeyDown={handleMenuKeys}
          >
            <div className="message-filter-popover-heading">
              {menu?.kind !== "create" && menu?.view !== "menu" ? (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="返回操作菜单" onClick={() => { setMenu(menu ? { ...menu, view: "menu" } : null); setActionError(null); }} disabled={actionPending}><ArrowLeft /></Button>
              ) : null}
              <Popover.Title>{menuTitle}</Popover.Title>
              <Popover.Close render={<Button type="button" variant="ghost" size="icon-xs" aria-label="关闭操作菜单" />}><X /></Popover.Close>
            </div>
            {isNameForm ? (
              <form className="message-filter-name-form" onSubmit={saveName} noValidate>
                <Field.Root name="name" invalid={Boolean(actionError)} disabled={actionPending}>
                  <Field.Label className="sr-only">目录名称</Field.Label>
                  <Input ref={nameInputRef} value={nameDraft} maxLength={60} autoComplete="off" aria-invalid={Boolean(actionError)} aria-describedby={actionError ? "message-filter-action-error" : undefined} onChange={(event) => { setNameDraft(event.target.value); setActionError(null); }} />
                </Field.Root>
                {actionError ? <p role="alert" id="message-filter-action-error" className="message-filter-error">{actionError}</p> : null}
                <div className="message-filter-form-actions">
                  <Popover.Close render={<Button type="button" variant="ghost" size="sm" />}>取消</Popover.Close>
                  <Button type="submit" size="sm" disabled={actionPending}>{actionPending ? "保存中…" : menu?.kind === "create" ? "创建目录" : "保存名称"}</Button>
                </div>
              </form>
            ) : (
              <div className="message-filter-menu-content">
                {actionError ? <p role="alert" className="message-filter-error">{actionError}</p> : null}
                {menu?.view === "move" ? (
                  <>
                    {sortedGroups.length > 7 ? <SearchInput value={moveQuery} onChange={(event) => setMoveQuery(event.target.value)} onClear={() => setMoveQuery("")} placeholder="搜索目录" aria-label="搜索目标目录" clearLabel="清空目标目录搜索" /> : null}
                    <div className="message-filter-menu-options">
                      {moveOptions.map((option) => (
                        <Button key={option.id ?? "independent"} type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item aria-pressed={option.id === targetGroupId} disabled={actionPending} onClick={() => {
                          if (!targetFilter) return;
                          if (option.id === targetGroupId) { setMenu(null); return; }
                          moveFilter(targetFilter.id, option.id);
                        }}>
                          <span>{option.name}</span>{option.id === targetGroupId ? <Check data-icon="inline-end" /> : null}
                        </Button>
                      ))}
                      {moveOptions.length === 0 ? <p className="message-filter-empty">没有匹配的目录</p> : null}
                    </div>
                  </>
                ) : menu?.view === "delete" ? (
                  <>
                    <Popover.Description className="message-filter-delete-description">删除“{menu.name}”后，其中的消息组会独立显示，消息不会删除。</Popover.Description>
                    <div className="message-filter-form-actions">
                      <Popover.Close render={<Button type="button" variant="ghost" size="sm" />}>取消</Popover.Close>
                      <Button type="button" variant="destructive" size="sm" disabled={actionPending} onClick={() => {
                        if (menu.id !== null) { const id = menu.id; void runAction(() => onDeleteGroup(id), "目录已删除，消息组已独立显示", "create"); }
                      }}>{actionPending ? "删除中…" : "删除目录"}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {menu?.kind === "group" ? <Button type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item disabled={actionPending} onClick={renameTarget}>重命名</Button> : null}
                    {menu?.kind === "filter" ? <Button type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item disabled={actionPending} onClick={() => setMenu({ ...menu, view: "move" })}><span>移动到目录</span><ChevronRight data-icon="inline-end" /></Button> : null}
                    <Button type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item data-panel-reorder="up" disabled={actionPending || targetIndex <= 0} onClick={() => reorderFromMenu(-1)}>上移</Button>
                    <Button type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item data-panel-reorder="down" disabled={actionPending || targetIndex < 0 || targetIndex >= targetOrder.length - 1} onClick={() => reorderFromMenu(1)}>下移</Button>
                    {menu?.kind === "group" ? <><Separator /><Button type="button" variant="destructive" className="message-filter-menu-item" data-panel-menu-item disabled={actionPending} onClick={() => setMenu({ ...menu, view: "delete" })}>删除目录</Button></> : null}
                    {targetFilter && targetFilter.systemKey !== ALL_MESSAGES_SYSTEM_KEY && onEditFilter ? <><Separator /><Button type="button" variant="ghost" className="message-filter-menu-item" data-panel-menu-item disabled={actionPending} onClick={() => closeAfterNavigation(targetFilter.id)}>编辑监听规则</Button></> : null}
                  </>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
