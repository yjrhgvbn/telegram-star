import { useState } from "react";
import type { Filter } from "../types";
import "./FilterPanel.css";

interface Props {
  filters: Filter[];
  loading: boolean;
  onCreateFilter: (data: { name: string; type: string; value: string }) => Promise<void>;
  onDeleteFilter: (id: number) => Promise<void>;
  onToggleFilter: (id: number) => Promise<void>;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
}

export function FilterPanel({
  filters,
  loading,
  onCreateFilter,
  onDeleteFilter,
  onToggleFilter,
  selectedFilterId,
  onSelectFilter,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("keyword");
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) {
      setError("名称和值不能为空");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await onCreateFilter({ name: name.trim(), type, value: value.trim() });
      setName("");
      setValue("");
      setType("keyword");
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const getTypeIcon = (t: string) => {
    switch (t) {
      case "keyword": return "🔑";
      case "group": return "👥";
      case "channel": return "📢";
      default: return "📌";
    }
  };

  const getTypeBadge = (t: string) => {
    switch (t) {
      case "keyword": return "badge-keyword";
      case "group": return "badge-group";
      case "channel": return "badge-channel";
      default: return "";
    }
  };

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h2 className="filter-panel-title">
          <span>🎯</span> 过滤器
        </h2>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "✕" : "+ 新建"}
        </button>
      </div>

      {showForm && (
        <form className="filter-form animate-fade-in" onSubmit={handleSubmit}>
          {error && <div className="filter-form-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">名称</label>
            <input
              className="input"
              placeholder="例如：BTC 讨论"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">类型</label>
            <select
              className="input select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="keyword">🔑 关键词</option>
              <option value="group">👥 群组</option>
              <option value="channel">📢 频道</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              {type === "keyword" ? "关键词" : type === "group" ? "群组名称/ID" : "频道名称/ID"}
            </label>
            <input
              className="input"
              placeholder={
                type === "keyword" ? "例如：bitcoin" :
                type === "group" ? "群组名或 Chat ID" :
                "频道名或 Chat ID"
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={creating}>
            {creating ? <span className="spinner" /> : "创建过滤器"}
          </button>
        </form>
      )}

      <div className="filter-list">
        {/* "All" option */}
        <button
          className={`filter-item ${selectedFilterId === "" ? "active" : ""}`}
          onClick={() => onSelectFilter("")}
        >
          <div className="filter-item-info">
            <span className="filter-icon">📋</span>
            <span className="filter-name">全部消息</span>
          </div>
        </button>

        {loading ? (
          <div className="filter-loading">
            <span className="spinner" />
          </div>
        ) : filters.length === 0 ? (
          <div className="filter-empty">
            <p>暂无过滤器</p>
            <p>点击上方按钮创建</p>
          </div>
        ) : (
          filters.map((filter) => (
            <div key={filter.id} className={`filter-item ${selectedFilterId === String(filter.id) ? "active" : ""} ${!filter.enabled ? "disabled" : ""}`}>
              <button
                className="filter-item-info"
                onClick={() => onSelectFilter(String(filter.id))}
              >
                <span className="filter-icon">{getTypeIcon(filter.type)}</span>
                <div className="filter-details">
                  <span className="filter-name">{filter.name}</span>
                  <span className={`badge ${getTypeBadge(filter.type)}`}>
                    {filter.value}
                  </span>
                </div>
              </button>
              <div className="filter-item-actions">
                <button
                  className={`btn btn-icon btn-sm btn-ghost toggle-btn ${filter.enabled ? "on" : ""}`}
                  onClick={() => onToggleFilter(filter.id)}
                  title={filter.enabled ? "禁用" : "启用"}
                >
                  {filter.enabled ? "🟢" : "⚪"}
                </button>
                <button
                  className="btn btn-icon btn-sm btn-ghost delete-btn"
                  onClick={() => onDeleteFilter(filter.id)}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
