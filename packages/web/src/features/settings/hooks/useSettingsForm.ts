import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type { AppConfigUpdate } from "@telegram-star/shared/contracts/config";

export const thumbQualityOptions = [
  { value: 0, title: "省流", description: "更快" },
  { value: 1, title: "均衡", description: "推荐" },
  { value: 2, title: "清晰", description: "更细节" },
] as const;

export type SettingsInvalidItemKind = "telegram-api" | "telegram-auth" | "media";
export type SettingsInvalidItemTone = "danger" | "warning";

export interface SettingsInvalidItem {
  kind: SettingsInvalidItemKind;
  title: string;
  detail: string;
  tone: SettingsInvalidItemTone;
}

export interface SettingsStatusSummary {
  title: string;
  tone: "loading" | "valid" | "invalid";
}

interface UseSettingsFormOptions {
  telegramAuthorized: boolean;
}

export function useSettingsForm({ telegramAuthorized }: UseSettingsFormOptions) {
  const queryClient = useQueryClient();
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [thumbIndex, setThumbIndex] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: queryKeys.config.status,
    queryFn: api.config.get,
  });

  const {
    mutateAsync: updateConfigAsync,
    isPending: updateConfigPending,
  } = useMutation({
    mutationFn: (data: AppConfigUpdate) => api.config.update(data),
    onSuccess: (nextConfig) => {
      queryClient.setQueryData(queryKeys.config.status, nextConfig);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.status });
    },
  });

  const status = configQuery.data?.telegram ?? null;
  const mediaStatus = configQuery.data?.media ?? null;
  const loading = configQuery.isLoading || configQuery.isFetching;
  const saving = updateConfigPending;
  const loadError = configQuery.error instanceof Error ? configQuery.error.message : null;
  const error = submitError ?? loadError;
  const loadedApiId = configQuery.data?.telegram.apiId ?? null;
  const loadedThumbIndex = configQuery.data?.media.thumbIndex ?? null;
  const telegramConfigured = status?.telegramConfigured ?? false;
  const databaseConfigured = status?.databaseConfigured ?? false;
  const hasStatus = Boolean(status);
  const hasMediaStatus = Boolean(mediaStatus);

  useEffect(() => {
    if (loadedThumbIndex === null) return;

    setApiId(loadedApiId ? String(loadedApiId) : "");
    setApiHash("");
    setThumbIndex(loadedThumbIndex);
  }, [loadedApiId, loadedThumbIndex]);

  const loadStatus = useCallback(() => {
    setSubmitError(null);
    setNotice(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.config.status });
  }, [queryClient]);

  const invalidItems = useMemo<SettingsInvalidItem[]>(() => {
    const items: SettingsInvalidItem[] = [];

    if (hasStatus && !telegramConfigured) {
      items.push({
        kind: "telegram-api",
        title: "Telegram API 缺失",
        detail: "补齐 API ID 和 API Hash",
        tone: "danger",
      });
    }

    if (telegramConfigured && !telegramAuthorized) {
      items.push({
        kind: "telegram-auth",
        title: "Telegram 未授权",
        detail: "完成登录后才能同步消息",
        tone: "warning",
      });
    }

    if (!loading && !hasMediaStatus) {
      items.push({
        kind: "media",
        title: "媒体配置未加载",
        detail: "刷新后重试",
        tone: "warning",
      });
    }

    return items;
  }, [hasMediaStatus, hasStatus, loading, telegramAuthorized, telegramConfigured]);

  const statusSummary = useMemo<SettingsStatusSummary>(() => {
    if (loading && !hasStatus) {
      return { title: "正在读取配置", tone: "loading" };
    }

    if (invalidItems.length === 0) {
      return { title: "当前没有失效项", tone: "valid" };
    }

    return { title: `${invalidItems.length} 项需处理`, tone: "invalid" };
  }, [hasStatus, invalidItems.length, loading]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setNotice(null);

    if (!apiId.trim()) {
      setSubmitError("Telegram API ID 不能为空");
      return;
    }

    if (!apiHash.trim() && !databaseConfigured) {
      setSubmitError("保存新配置时需要填写 Telegram API Hash");
      return;
    }

    try {
      const nextConfig = await updateConfigAsync({
        telegram: {
          apiId: apiId.trim(),
          apiHash: apiHash.trim(),
        },
        media: {
          thumbIndex,
        },
      });
      setApiId(nextConfig.telegram.apiId ? String(nextConfig.telegram.apiId) : apiId.trim());
      setApiHash("");
      setThumbIndex(nextConfig.media.thumbIndex);
      setNotice("设置已保存");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "保存配置失败");
    }
  };

  return {
    status,
    mediaStatus,
    telegramAuthorized,
    apiId,
    apiHash,
    thumbIndex,
    loading,
    saving,
    error,
    notice,
    invalidItems,
    statusSummary,
    loadStatus,
    handleSave,
    setApiId,
    setApiHash,
    setThumbIndex,
  };
}
