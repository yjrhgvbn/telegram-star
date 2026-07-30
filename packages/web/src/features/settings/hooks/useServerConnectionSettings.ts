import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

export interface ServerConnectionSummary {
  title: string;
  tone: "neutral" | "checking" | "connected" | "failed";
}

function getInitialServerUrl(): string {
  return getRuntimeServerUrl();
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
  const [serverUrlInput, setServerUrlInput] = useState(getInitialServerUrl);
  const [checkedServerUrl, setCheckedServerUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ServerConnectionState>("unknown");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedServerUrl = normalizeServerUrl(serverUrlInput);
  const checkedInputMatches = checkedServerUrl === normalizedServerUrl;
  const visibleConnectionState = checkedInputMatches ? connectionState : "unknown";
  const visibleConnectionError = checkedInputMatches ? connectionError : null;
  const visibleHealth = checkedInputMatches ? health : null;
  const dirty = normalizedServerUrl !== currentServerUrl;
  const modeLabel = normalizedServerUrl ? "远程后端" : "同源后端";
  const currentLabel = currentServerUrl || "同源 /api";
  const summary = useMemo(
    () => getConnectionSummary(visibleConnectionState),
    [visibleConnectionState],
  );

  const testConnection = useCallback(async () => {
    const targetServerUrl = normalizeServerUrl(serverUrlInput);

    setCheckedServerUrl(targetServerUrl);
    setConnectionState("checking");
    setConnectionError(null);
    setHealth(null);
    setNotice(null);

    try {
      const nextHealth = await checkServerHealth(targetServerUrl);
      setConnectionState("connected");
      setHealth(nextHealth);
      setNotice(`已连接到 ${nextHealth.appName} ${nextHealth.serverVersion}`);
      return nextHealth;
    } catch (error) {
      setConnectionState("failed");
      setConnectionError(error instanceof Error ? error.message : "连接测试失败");
      return null;
    }
  }, [serverUrlInput]);

  const saveConnection = useCallback(() => {
    const nextServerUrl = normalizeServerUrl(serverUrlInput);

    // 保存的是服务器根地址；空字符串代表当前 Web 与 API 同源。
    saveServerUrl(nextServerUrl);
    setCurrentServerUrl(nextServerUrl);
    setServerUrlInput(nextServerUrl);
    setCheckedServerUrl(null);
    setConnectionState("unknown");
    setConnectionError(null);
    setHealth(null);
    setNotice(nextServerUrl ? "服务器地址已保存" : "已切换为同源模式");
    void queryClient.invalidateQueries();
  }, [queryClient, serverUrlInput]);

  const clearConnection = useCallback(() => {
    saveServerUrl("");
    setCurrentServerUrl("");
    setServerUrlInput("");
    setCheckedServerUrl(null);
    setConnectionState("unknown");
    setConnectionError(null);
    setHealth(null);
    setNotice("已切换为同源模式");
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const resetConnectionDraft = useCallback(() => {
    setServerUrlInput(currentServerUrl);
    setCheckedServerUrl(null);
    setConnectionState("unknown");
    setConnectionError(null);
    setHealth(null);
    setNotice(null);
  }, [currentServerUrl]);

  const updateServerUrlInput = useCallback((value: string) => {
    setServerUrlInput(value);
    setNotice(null);
  }, []);

  return {
    currentServerUrl,
    currentLabel,
    serverUrlInput,
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
  };
}
