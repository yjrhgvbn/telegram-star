import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Menu } from "@base-ui/react/menu";
import { ArrowLeft, MoreHorizontal, Search, X } from "lucide-react";
import { useMessages } from "./hooks/useMessages";
import { useMessageViewState, type MessageReadFilter } from "./hooks/useMessageViewState";
import { useMessageCompletion } from "./hooks/useMessageCompletion";
import { useFilters } from "@/hooks/useFilters";
import { useFilterGroups } from "@/hooks/useFilterGroups";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { AppShell } from "@/components/AppShell";
import { FilterPanel } from "./components/FilterPanel";
import { MessageList } from "./components/MessageList";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "./MessagesFeature.css";

const statusFilters: Array<{ value: MessageReadFilter; label: string }> = [
  { value: "all", label: "全部" }, { value: "unread", label: "待完成" }, { value: "read", label: "已完成" },
];
function useMobileMessages() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width:680px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width:680px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return mobile;
}

export function MessagesFeature() {
  const { filterId: rawFilterId } = useParams<{ filterId?: string }>();
  const navigate = useNavigate();
  const mobile = useMobileMessages();
  const isGroupSelected = rawFilterId !== undefined;
  const selectedFilterId = rawFilterId === "all" ? "" : (rawFilterId ?? "");
  const groupKey = selectedFilterId || "all";
  const lastSelectedFilter = useRef(selectedFilterId);
  if (isGroupSelected) lastSelectedFilter.current = selectedFilterId;
  const view = useMessageViewState(groupKey, undefined, !mobile || isGroupSelected);
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters, messageGroups, loading: filtersLoading, error: filtersError, setFilterPlacement } = useFilters();
  const { groups: filterGroups, ungroupedPosition, loading: filterGroupsLoading, createGroup, renameGroup, deleteGroup, reorderGroups } = useFilterGroups();
  const selectedFilter = filters.find((item) => String(item.id) === selectedFilterId) ?? null;
  const missingGroup = !filtersLoading && selectedFilterId !== "" && !selectedFilter;
  const currentTitle = selectedFilterId === "" ? "全部消息" : (selectedFilter?.name ?? "消息组");
  const [searchRequest, setSearchRequest] = useState({ group: groupKey, value: view.searchQuery });
  const search = searchRequest.group === groupKey ? searchRequest.value : view.searchQuery;
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchRequest({ group: groupKey, value: view.searchQuery }), 180);
    return () => window.clearTimeout(timer);
  }, [groupKey, view.searchQuery]);
  const searchSettled = search === view.searchQuery;
  const scope = JSON.stringify([groupKey, view.readFilter, search, view.order]);
  const {
    messages, hasOlder, hasNewer, loading: messagesLoading, error, loadingOlder, loadingNewer,
    anchorId, restoredAnchorId, hasPendingNew, loadOlder, loadNewer, flushPending, setAtBottom,
    toggleRead, recordTelegramOpen, markAsReadLocal, refresh,
  } = useMessages({
    limit: 20,
    isRead: view.readFilter === "all" ? undefined : view.readFilter === "read",
    filterId: selectedFilter ? selectedFilter.id : undefined,
    search: search || undefined,
    autoLocateEnabled: selectedFilterId !== "" && (selectedFilter?.autoLocateUnreadNearRead ?? true),
    restoreAnchorId: view.restorePosition?.messageId,
    enabled: !authLoading && (!mobile || isGroupSelected) && !filtersLoading && !missingGroup,
  });
  const completion = useMessageCompletion({ scope, messages, toggleRead, markAsReadLocal });
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [locateRequest, setLocateRequest] = useState<{ scope: string; id: number } | null>(null);
  const locateSequence = useRef(0);
  const currentScope = useRef(scope);
  const scopeEpoch = useRef(0);
  if (currentScope.current !== scope) { currentScope.current = scope; scopeEpoch.current += 1; }
  useEffect(() => () => { scopeEpoch.current += 1; }, []);
  const searchRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLButtonElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(rawFilterId);
  useEffect(() => {
    if (previousRoute.current === rawFilterId) return;
    previousRoute.current = rawFilterId;
    if (!mobile) return;
    const frame = requestAnimationFrame(() => {
      const target = isGroupSelected ? detailRef.current?.querySelector<HTMLElement>("[data-message-scroll]") : sidebarRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [rawFilterId, isGroupSelected, mobile]);
  const selectedMessages = messages.filter((message) => selectedIds.has(message.id));
  const completionPending = completion.pendingIds.size > 0;

  useEffect(() => {
    setSelectedIds(new Set()); setSelecting(false); setToolsOpen(false);
  }, [groupKey, view.readFilter, view.searchQuery, view.order, mobile, isGroupSelected]);
  useEffect(() => {
    if (selecting) selectAllRef.current?.focus({ preventScroll: true });
  }, [selecting]);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedMessages.length > 0 && selectedMessages.length < messages.length;
  }, [messages.length, selectedMessages.length, selecting]);

  const handleSelectFilter = useCallback((id: string) => navigate(id ? `/messages/${id}` : "/messages/all"), [navigate]);
  const handleEditFilter = useCallback((id: number) => navigate(`/filters/${id}`), [navigate]);
  const handleRefresh = () => { view.clearPosition(); setSelectedIds(new Set()); completion.dismissError(); refresh(); };
  const handleSearchToggle = () => {
    const opening = !(view.searchOpen || view.searchQuery);
    view.setSearchOpen(opening);
    if (!opening) view.setSearchQuery("");
    window.requestAnimationFrame(() => (opening ? searchRef.current : searchToggleRef.current)?.focus({ preventScroll: true }));
  };
  const handleLocate = () => {
    setToolsOpen(false);
    const filter = messages.some((message) => !message.isRead) ? view.readFilter : "unread";
    if (filter !== view.readFilter) view.setReadFilter(filter);
    locateSequence.current += 1;
    setLocateRequest({ scope: JSON.stringify([groupKey, filter, search, view.order]), id: locateSequence.current });
  };
  const handleOrder = () => { view.setOrder(view.order === "asc" ? "desc" : "asc"); setToolsOpen(false); };
  const handleSelectMode = () => { setSelecting(true); setToolsOpen(false); };
  const cancelSelection = () => {
    setSelecting(false); setSelectedIds(new Set());
    window.requestAnimationFrame(() => toolsRef.current?.focus({ preventScroll: true }));
  };
  const toggleSelection = (id: number) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const applySelection = async (done: boolean) => {
    const epoch = scopeEpoch.current;
    await completion.apply(selectedMessages.map((message) => message.id), done);
    if (scopeEpoch.current === epoch) cancelSelection();
  };

  return (
    <AppShell activeTab="messages" authStatus={authStatus} authLoading={authLoading} onLoginSuccess={handleLoginSuccess}>
      <div className="messages-workspace" data-detail={isGroupSelected || undefined}>
        <aside ref={sidebarRef} className="messages-sidebar" aria-label="消息组列表" tabIndex={-1}>
          {filtersError ? <p className="messages-inline-error" role="alert">消息组加载失败：{filtersError}</p> : null}
          <FilterPanel
            filters={messageGroups} filterGroups={filterGroups} ungroupedPosition={ungroupedPosition}
            loading={filtersLoading || filterGroupsLoading} selectedFilterId={mobile && !isGroupSelected ? lastSelectedFilter.current : selectedFilterId}
            onSelectFilter={handleSelectFilter} onCreateGroup={createGroup} onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup} onReorderGroups={reorderGroups} onSetPlacement={setFilterPlacement}
            onEditFilter={handleEditFilter}
          />
        </aside>
        <main ref={detailRef} className="messages-detail" aria-labelledby="messages-title">
          <header className="messages-header">
            <div className="messages-title-row">
              <div className="messages-heading">
                <Button variant="ghost" size="icon-lg" className="messages-back" onClick={() => navigate("/messages")} aria-label="返回消息组列表"><ArrowLeft /></Button>
                <h1 id="messages-title">{currentTitle}</h1>
              </div>
              <div className="messages-mobile-search-toggle">
                <Button ref={searchToggleRef} variant="ghost" size="icon-lg" onClick={handleSearchToggle} aria-label={view.searchOpen || view.searchQuery ? "收起消息搜索" : "搜索消息"} aria-expanded={Boolean(view.searchOpen || view.searchQuery)} aria-controls="messages-search"><Search /></Button>
              </div>
              <form id="messages-search" className="messages-search" data-open={Boolean(view.searchOpen || view.searchQuery) || undefined} onSubmit={(event) => { event.preventDefault(); handleRefresh(); }}>
                <SearchInput ref={searchRef} placeholder="搜索当前消息组" aria-label="搜索当前消息组" value={view.searchQuery} onChange={(event) => view.setSearchQuery(event.target.value)} onClear={() => view.setSearchQuery("")} onKeyDown={(event) => { if (event.key === "Escape" && mobile) { event.preventDefault(); handleSearchToggle(); } }} />
              </form>
              <Menu.Root open={toolsOpen} onOpenChange={setToolsOpen}>
                <Menu.Trigger render={<Button ref={toolsRef} variant="ghost" size="icon-lg" className="messages-tools-trigger" aria-label="消息列表操作" />}><MoreHorizontal /></Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="message-theme messages-menu-positioner" align="end" sideOffset={6}>
                    <Menu.Popup className="messages-tools-menu">
                      <Menu.Group>
                        {mobile && <Menu.Item className="messages-locate" onClick={handleLocate}>定位待完成</Menu.Item>}
                        {mobile && <Menu.Item onClick={handleOrder}>时间顺序：{view.order === "asc" ? "从早到晚" : "从晚到早"}</Menu.Item>}
                        {mobile && <Menu.Item disabled={!messages.length || !searchSettled} onClick={handleSelectMode}>选择消息</Menu.Item>}
                        <Menu.Item onClick={handleRefresh}>刷新消息</Menu.Item>
                        {selectedFilter && <Menu.Item onClick={() => handleEditFilter(selectedFilter.id)}>编辑监听规则</Menu.Item>}
                      </Menu.Group>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
            <div className="messages-filter-row">
              <Tabs value={view.readFilter} onValueChange={(value) => view.setReadFilter(value as MessageReadFilter)}>
                <TabsList variant="line" aria-label="消息完成状态">
                  {statusFilters.map((filter) => <TabsTrigger key={filter.value} value={filter.value} onClick={() => { if (view.readFilter === filter.value) handleRefresh(); }}>{filter.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <div className="messages-desktop-tools">
                <Button variant="ghost" className="messages-locate" onClick={handleLocate}>定位待完成</Button>
                <Button variant="ghost" onClick={handleOrder} aria-label="切换消息时间顺序" title={view.order === "asc" ? "从早到晚，点击切换" : "从晚到早，点击切换"}>{view.order === "asc" ? "正序" : "倒序"}</Button>
                <Button variant="ghost" onClick={selecting ? cancelSelection : handleSelectMode} disabled={!messages.length || !searchSettled}>{selecting ? "取消选择" : "选择"}</Button>
              </div>
            </div>
            {selecting && <div className="messages-selection" role="group" aria-label="批量消息操作">
              <label><input ref={selectAllRef} type="checkbox" aria-label="选择当前已加载的消息" checked={messages.length > 0 && selectedMessages.length === messages.length} onChange={(event) => setSelectedIds(new Set(event.target.checked ? messages.map((message) => message.id) : []))} disabled={completionPending} /><span>已选 {selectedMessages.length} 条</span></label>
              <div>
                <Button className="messages-selection__complete" disabled={completionPending || !selectedMessages.some((message) => !message.isRead)} onClick={() => void applySelection(true)}>标记完成</Button>
                <Button variant="ghost" disabled={completionPending || !selectedMessages.some((message) => message.isRead)} onClick={() => void applySelection(false)}>恢复待完成</Button>
                <Button variant="ghost" onClick={cancelSelection} disabled={completionPending}>取消</Button>
              </div>
              <span className="messages-selection-hint">全选仅包含当前已加载的消息</span>
            </div>}
          </header>
          {completion.error && <div className="messages-operation-error" role="alert">
            <span>{completion.error}</span>
            <Button variant="ghost" size="icon-lg" aria-label="关闭操作提示" onClick={completion.dismissError}><X /></Button>
          </div>}
          <div className="messages-content">
            <MessageList
              key={scope} messages={messages} hasOlder={hasOlder} hasNewer={hasNewer}
              loading={messagesLoading || filtersLoading} error={missingGroup ? "这个消息组不存在或已被删除" : error}
              loadingOlder={loadingOlder} loadingNewer={loadingNewer} anchorId={anchorId} hasPendingNew={hasPendingNew}
              onLoadOlder={loadOlder} onLoadNewer={loadNewer} onFlushPending={flushPending} onSetAtBottom={setAtBottom}
              onToggleRead={completion.toggle} onOpenTelegram={recordTelegramOpen} markAsReadLocal={markAsReadLocal}
              searchQuery={search} readFilter={view.readFilter} order={view.order} onRetry={handleRefresh}
              restorePosition={restoredAnchorId === view.restorePosition?.messageId ? view.restorePosition : null}
              onRememberPosition={searchSettled ? view.rememberPosition : undefined} locateRequest={locateRequest?.scope === scope ? locateRequest.id : 0} onLocateHandled={() => setLocateRequest(null)}
              isSelecting={selecting} selectedIds={selectedIds} onSelect={toggleSelection} pendingIds={completion.pendingIds}
            />
          </div>
        </main>
      </div>
    </AppShell>
  );
}
