import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import {
  checkServerHealth,
  type ServerConnectionState,
} from "@/shared/api/health";
import {
  getRuntimeServerUrl,
  normalizeServerUrl,
  saveServerUrl,
} from "@/shared/runtime/serverConfig";
import { queryKeys } from "@/shared/query/queryKeys";

export interface ServerConnectionSummary {
  title: string;
  tone: "neutral" | "checking" | "connected" | "failed";
}

export type ServerConnectionMode = "same" | "custom";

function validateServerUrl(value: string): string | null {
  const normalized = normalizeServerUrl(value);
  try {
    const url = new URL(normalized);
    if (!/^https?:\/\//i.test(normalized) || !url.hostname) {
      return "请输入完整的 http:// 或 https:// 服务器地址。";
    }
    if (url.search || url.hash || url.username || url.password) {
      return "请输入服务器根地址，不包含查询参数、锚点或登录信息。";
    }
    return null;
  } catch {
    return "请输入完整的 http:// 或 https:// 服务器地址。";
  }
}

function getInitialServerUrl(): string {
  return getRuntimeServerUrl();
}

function reloadQueriesForServer(queryClient: QueryClient, serverUrl: string): void {
  // Both methods update query state synchronously. Cancel first so a late response
  // from the previous server cannot refill the cleared auth, devices or other data.
  void queryClient.cancelQueries().catch(() => undefined);
  // The editor still observes its previous scoped key until React rerenders. Do not
  // refetch that key with the newly saved URL and put new credentials in its cache.
  queryClient.removeQueries({
    predicate: (query) => queryKeys.config.status.every((part, index) => query.queryKey[index] === part)
      && query.queryKey.length > queryKeys.config.status.length
      && query.queryKey[queryKeys.config.status.length] !== serverUrl,
  });
  void queryClient.resetQueries().catch(() => undefined);
}

function getConnectionSummary(state: ServerConnectionState): ServerConnectionSummary {
  if (state === "checking") {
    return { title: "检查中", tone: "checking" };
  }

  if (state === "connected") {
    return { title: "已连接", tone: "connected" };
  }

  if (state === "failed") {
    return { title: "连接失败", tone: "failed" };
  }

  return { title: "未检查", tone: "neutral" };
}

export function useServerConnectionSettings() {
  const queryClient = useQueryClient();
  const [currentServerUrl, setCurrentServerUrl] = useState(getInitialServerUrl);
  const [serverUrlInput, setServerUrlInput] = useState(currentServerUrl);
  const [connectionMode, setConnectionMode] = useState<ServerConnectionMode>(
    () => currentServerUrl ? "custom" : "same",
  );
  const [inputError, setInputError] = useState<string | null>(null);
  const [checkedServerUrl, setCheckedServerUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ServerConnectionState>("unknown");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const checkEpoch = useRef(0);

  const normalizedServerUrl = connectionMode === "custom" ? normalizeServerUrl(serverUrlInput) : "";
  const checkedInputMatches = checkedServerUrl === normalizedServerUrl;
  const visibleConnectionState = checkedInputMatches ? connectionState : "unknown";
  const visibleConnectionError = checkedInputMatches ? connectionError : null;
  const visibleHealth = checkedInputMatches ? health : null;
  const currentMode = currentServerUrl ? "custom" : "same";
  const dirty = connectionMode !== currentMode || normalizedServerUrl !== currentServerUrl;
  const modeLabel = connectionMode === "custom" ? "自定义地址" : "使用当前站点";
  const currentLabel = currentServerUrl || "同源 /api";
  const summary = useMemo(
    () => getConnectionSummary(visibleConnectionState),
    [visibleConnectionState],
  );

  useEffect(() => () => {
    checkEpoch.current += 1;
  }, []);

  const clearFeedback = useCallback(() => {
    // 输入、模式和保存变化都会使旧测试失效，包括地址改回原值的情况。
    checkEpoch.current += 1;
    setCheckedServerUrl(null);
    setConnectionState("unknown");
    setConnectionError(null);
    setHealth(null);
    setInputError(null);
    setNotice(null);
  }, []);

  const testConnection = useCallback(async () => {
    clearFeedback();
    const validationError = connectionMode === "custom" ? validateServerUrl(serverUrlInput) : null;
    if (validationError) {
      setInputError(validationError);
      return null;
    }
    const targetServerUrl = normalizedServerUrl;
    const requestEpoch = checkEpoch.current;

    setCheckedServerUrl(targetServerUrl);
    setConnectionState("checking");

    try {
      const nextHealth = await checkServerHealth(targetServerUrl);
      if (requestEpoch !== checkEpoch.current) return null;
      setConnectionState("connected");
      setHealth(nextHealth);
      return nextHealth;
    } catch (error) {
      if (requestEpoch !== checkEpoch.current) return null;
      setConnectionState("failed");
      setConnectionError(error instanceof Error ? error.message : "连接测试失败");
      return null;
    }
  }, [clearFeedback, connectionMode, normalizedServerUrl, serverUrlInput]);

  const saveConnection = useCallback(() => {
    clearFeedback();
    const validationError = connectionMode === "custom" ? validateServerUrl(serverUrlInput) : null;
    if (validationError) {
      setInputError(validationError);
      return false;
    }
    const nextServerUrl = normalizedServerUrl;

    // 只有显式选择当前站点才保存空字符串，不能将空的自定义草稿当作同源。
    saveServerUrl(nextServerUrl);
    setCurrentServerUrl(nextServerUrl);
    setServerUrlInput(nextServerUrl);
    setNotice(nextServerUrl ? "服务器地址已保存" : "已切换为同源模式");
    if (nextServerUrl !== currentServerUrl) reloadQueriesForServer(queryClient, nextServerUrl);
    return true;
  }, [clearFeedback, connectionMode, currentServerUrl, normalizedServerUrl, queryClient, serverUrlInput]);

  const clearConnection = useCallback(() => {
    clearFeedback();
    saveServerUrl("");
    setCurrentServerUrl("");
    setServerUrlInput("");
    setConnectionMode("same");
    setNotice("已切换为同源模式");
    if (currentServerUrl) reloadQueriesForServer(queryClient, "");
  }, [clearFeedback, currentServerUrl, queryClient]);

  const resetConnectionDraft = useCallback(() => {
    clearFeedback();
    setServerUrlInput(currentServerUrl);
    setConnectionMode(currentServerUrl ? "custom" : "same");
  }, [clearFeedback, currentServerUrl]);

  const updateServerUrlInput = useCallback((value: string) => {
    clearFeedback();
    setServerUrlInput(value);
    setConnectionMode("custom");
  }, [clearFeedback]);

  const updateConnectionMode = useCallback((mode: ServerConnectionMode) => {
    if (mode === connectionMode) return;
    clearFeedback();
    setConnectionMode(mode);
  }, [clearFeedback, connectionMode]);

  return {
    currentServerUrl,
    currentLabel,
    serverUrlInput,
    connectionMode,
    inputError,
    normalizedServerUrl,
    modeLabel,
    dirty,
    connectionState: visibleConnectionState,
    connectionError: visibleConnectionError,
    health: visibleHealth,
    notice,
    summary,
    checking: visibleConnectionState === "checking",
    testConnection,
    saveConnection,
    clearConnection,
    resetConnectionDraft,
    setServerUrlInput: updateServerUrlInput,
    setConnectionMode: updateConnectionMode,
  };
}
