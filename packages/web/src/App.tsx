import { useState, useEffect, useCallback } from "react";
import { api } from "./api/client";
import { useMessages, useStats } from "./hooks/useMessages";
import { useFilters } from "./hooks/useFilters";
import { TelegramLogin } from "./components/TelegramLogin";
import { FilterPanel } from "./components/FilterPanel";
import { MessageList } from "./components/MessageList";
import type { AuthStatus } from "./types";
import "./App.css";

function App() {
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

  const { filters, loading: filtersLoading, createFilter, deleteFilter, toggleFilter } = useFilters();
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
    async (data: { name: string; type: string; value: string }) => {
      await createFilter(data);
    },
    [createFilter]
  );

  const handleSearch = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    refresh();
  }, [refresh]);

  // Auto-refresh messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>连接中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Login overlay */}
      {!authStatus.authorized && (
        <TelegramLogin authStatus={authStatus} onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="sidebar-brand">
          <span className="brand-icon">⭐</span>
          <span className="brand-text">Telegram Star</span>
          <button className="btn btn-icon btn-ghost sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>
        <FilterPanel
          filters={filters}
          loading={filtersLoading}
          onCreateFilter={handleCreateFilter}
          onDeleteFilter={deleteFilter}
          onToggleFilter={toggleFilter}
          selectedFilterId={selectedFilterId}
          onSelectFilter={(id) => { setSelectedFilterId(id); setPage(1); }}
        />
        {authStatus.authorized && (
          <div className="sidebar-footer">
            <button className="btn btn-ghost btn-sm btn-full" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="header-left">
            <button className="btn btn-icon btn-ghost mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <h1 className="header-title">消息追踪</h1>
          </div>

          <div className="header-stats">
            <div className="stat-item">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">总消息</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item stat-unread">
              <span className="stat-value">{stats.unread}</span>
              <span className="stat-label">未读</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">{stats.today}</span>
              <span className="stat-label">今日</span>
            </div>
          </div>
        </header>

        {/* Toolbar */}
        <div className="toolbar">
          <form className="search-form" onSubmit={handleSearch}>
            <div className="search-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="搜索消息内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => { setSearchQuery(""); setPage(1); }}
                >
                  ✕
                </button>
              )}
            </div>
          </form>

          <div className="toolbar-filters">
            <button
              className={`btn btn-sm ${readFilter === "" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setReadFilter(""); setPage(1); }}
            >
              全部
            </button>
            <button
              className={`btn btn-sm ${readFilter === "false" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setReadFilter("false"); setPage(1); }}
            >
              未读
            </button>
            <button
              className={`btn btn-sm ${readFilter === "true" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setReadFilter("true"); setPage(1); }}
            >
              已读
            </button>
          </div>

          <button className="btn btn-sm btn-ghost" onClick={refresh} title="刷新">
            🔄
          </button>
        </div>

        {/* Message list */}
        <div className="content-area">
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
  );
}

export default App;
