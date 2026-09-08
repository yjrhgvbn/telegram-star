import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { getRuntimeServerUrl } from "@/shared/runtime/serverConfig";
import type { AppConfigUpdate } from "@telegram-star/shared/contracts/config";

export const thumbQualityOptions = [
  { value: 0, title: "省流", description: "更快" },
  { value: 1, title: "均衡", description: "推荐" },
  { value: 2, title: "清晰", description: "更细节" },
] as const;

export type SettingsSaveSection = "telegram" | "media";
export interface TelegramFieldErrors {
  apiId?: string;
  apiHash?: string;
}

interface SettingsDraft {
  scope: string;
  telegram: { apiId: string; apiHash: string } | null;
  media: number | null;
  telegramError: string | null;
  mediaError: string | null;
  telegramNotice: string | null;
  mediaNotice: string | null;
  telegramFieldErrors: TelegramFieldErrors;
}

function emptyDraft(scope: string): SettingsDraft {
  return {
    scope,
    telegram: null,
    media: null,
    telegramError: null,
    mediaError: null,
    telegramNotice: null,
    mediaNotice: null,
    telegramFieldErrors: {},
  };
}

interface UseSettingsFormOptions {
  telegramAuthorized: boolean;
  serverScope?: string;
}

export function useSettingsForm({
  telegramAuthorized,
  serverScope = getRuntimeServerUrl(),
}: UseSettingsFormOptions) {
  const queryClient = useQueryClient();
  const runtimeScope = getRuntimeServerUrl();
  const configKey = useMemo(() => [...queryKeys.config.status, serverScope], [serverScope]);
  const [draft, setDraft] = useState(() => emptyDraft(serverScope));
  const [activeSave, setActiveSave] = useState<{ scope: string; section: SettingsSaveSection } | null>(null);
  const scopeRef = useRef(serverScope);
  scopeRef.current = serverScope;
  const revisions = useRef({ apiId: 0, apiHash: 0, media: 0 });
  const inFlight = useRef<typeof activeSave>(null);

  // A separate cache entry prevents the previous server's credentials from being shown
  // or submitted while the new server is loading. Prefix invalidation still reaches it.
  const configQuery = useQuery({
    queryKey: configKey,
    queryFn: () => {
      // Address saving invalidates queries before this hook necessarily re-renders.
      // Do not let that old observer fetch the new server into the previous key.
      if (getRuntimeServerUrl() !== runtimeScope) throw new Error("服务器已切换，正在重新读取配置");
      return api.config.get();
    },
    staleTime: 0,
  });

  useEffect(() => {
    setDraft((current) => current.scope === serverScope ? current : emptyDraft(serverScope));
    revisions.current.apiId += 1;
    revisions.current.apiHash += 1;
    revisions.current.media += 1;
  }, [serverScope]);

  const { mutateAsync: updateConfigAsync } = useMutation({
    mutationFn: ({ data, runtimeScope }: {
      data: AppConfigUpdate;
      scope: string;
      runtimeScope: string;
    }) => {
      if (getRuntimeServerUrl() !== runtimeScope) {
        throw new Error("服务器已切换，请重新保存");
      }
      return api.config.update(data);
    },
    onSuccess: async (nextConfig, { data, scope, runtimeScope }) => {
      const savedKey = [...queryKeys.config.status, scope];
      await queryClient.cancelQueries({ queryKey: savedKey, exact: true });
      queryClient.setQueryData(savedKey, nextConfig);
      if (scopeRef.current !== scope || getRuntimeServerUrl() !== runtimeScope) return;
      // Keep consumers of the original key compatible; this editor reads only its scoped key.
      queryClient.setQueryData(queryKeys.config.status, nextConfig);
      if (data.telegram) void queryClient.invalidateQueries({ queryKey: queryKeys.auth.status });
    },
  });

  // Pristine fields follow server data; edited sections keep their complete local draft.
  // No query synchronization effect can erase another section's edits on refetch/save.
  const current = draft.scope === serverScope ? draft : emptyDraft(serverScope);
  const status = configQuery.data?.telegram ?? null;
  const mediaStatus = configQuery.data?.media ?? null;
  const loadedApiId = status?.apiId ? String(status.apiId) : "";
  const apiId = current.telegram?.apiId ?? loadedApiId;
  const apiHash = current.telegram?.apiHash ?? "";
  const thumbIndex = current.media ?? mediaStatus?.thumbIndex ?? 1;
  const telegramDirty = apiId.trim() !== loadedApiId || apiHash.trim().length > 0;
  const mediaDirty = thumbIndex !== (mediaStatus?.thumbIndex ?? 1);
  const savingSection = activeSave?.scope === serverScope ? activeSave.section : null;
  const loading = configQuery.isPending || configQuery.isFetching;
  const loadError = configQuery.error instanceof Error ? configQuery.error.message : null;

  const setApiId = useCallback((value: string) => {
    revisions.current.apiId += 1;
    setDraft((previous) => {
      const next = previous.scope === serverScope ? previous : emptyDraft(serverScope);
      return {
        ...next,
        telegram: { apiId: value, apiHash: next.telegram?.apiHash ?? "" },
        telegramError: null,
        telegramNotice: null,
        telegramFieldErrors: { ...next.telegramFieldErrors, apiId: undefined },
      };
    });
  }, [serverScope]);

  const setApiHash = useCallback((value: string) => {
    revisions.current.apiHash += 1;
    setDraft((previous) => {
      const next = previous.scope === serverScope ? previous : emptyDraft(serverScope);
      return {
        ...next,
        telegram: { apiId: next.telegram?.apiId ?? loadedApiId, apiHash: value },
        telegramError: null,
        telegramNotice: null,
        telegramFieldErrors: { ...next.telegramFieldErrors, apiHash: undefined },
      };
    });
  }, [loadedApiId, serverScope]);

  const setThumbIndex = useCallback((value: number) => {
    revisions.current.media += 1;
    setDraft((previous) => ({
      ...(previous.scope === serverScope ? previous : emptyDraft(serverScope)),
      media: value,
      mediaError: null,
      mediaNotice: null,
    }));
  }, [serverScope]);

  const resetDraft = useCallback((section: SettingsSaveSection) => {
    if (section === "telegram") {
      revisions.current.apiId += 1;
      revisions.current.apiHash += 1;
    } else revisions.current.media += 1;
    setDraft((previous) => {
      const next = previous.scope === serverScope ? previous : emptyDraft(serverScope);
      return section === "telegram"
        ? { ...next, telegram: null, telegramError: null, telegramNotice: null, telegramFieldErrors: {} }
        : { ...next, media: null, mediaError: null, mediaNotice: null };
    });
  }, [serverScope]);

  const loadStatus = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: configKey, exact: true });
  }, [configKey, queryClient]);

  const handleSave = async (section: SettingsSaveSection): Promise<void> => {
    if (inFlight.current?.scope === serverScope) return;
    const patchFeedback = (patch: Partial<SettingsDraft>) => setDraft((previous) => (
      scopeRef.current === serverScope
        ? { ...(previous.scope === serverScope ? previous : emptyDraft(serverScope)), ...patch }
        : previous
    ));
    if (section === "telegram") {
      patchFeedback({ telegramError: null, telegramNotice: null, telegramFieldErrors: {} });
    } else patchFeedback({ mediaError: null, mediaNotice: null });

    if (!configQuery.data || loading) {
      patchFeedback(section === "telegram"
        ? { telegramError: "配置尚未读取完成，请稍后重试" }
        : { mediaError: "配置尚未读取完成，请稍后重试" });
      return;
    }

    let data: AppConfigUpdate;
    if (section === "telegram") {
      const fieldErrors: TelegramFieldErrors = {};
      if (!apiId.trim()) fieldErrors.apiId = "请输入 API ID";
      else if (!Number.isInteger(Number(apiId)) || Number(apiId) <= 0) {
        fieldErrors.apiId = "API ID 必须是正整数";
      }
      if (!apiHash.trim() && !status?.databaseConfigured) {
        fieldErrors.apiHash = "首次保存到数据库需填写 API Hash";
      }
      if (Object.keys(fieldErrors).length) {
        patchFeedback({ telegramFieldErrors: fieldErrors });
        return;
      }
      data = { telegram: { apiId: apiId.trim(), apiHash: apiHash.trim() } };
    } else {
      if (!Number.isInteger(thumbIndex) || thumbIndex < 0 || thumbIndex > 2) {
        patchFeedback({ mediaError: "请选择有效的缩略图质量" });
        return;
      }
      data = { media: { thumbIndex } };
    }

    const submittedRevisions = { ...revisions.current };
    const request = { scope: serverScope, section };
    inFlight.current = request;
    setActiveSave(request);
    try {
      const saved = await updateConfigAsync({ data, scope: serverScope, runtimeScope });
      if (scopeRef.current !== serverScope) return;
      setDraft((previous) => {
        if (previous.scope !== serverScope) return previous;
        if (section === "media") {
          const editedAfterSubmit = revisions.current.media !== submittedRevisions.media;
          return {
            ...previous,
            media: editedAfterSubmit ? previous.media : null,
            mediaNotice: editedAfterSubmit ? "已保存提交的版本" : "媒体设置已保存",
          };
        }
        const idEdited = revisions.current.apiId !== submittedRevisions.apiId;
        const hashEdited = revisions.current.apiHash !== submittedRevisions.apiHash;
        // A late save acknowledges only unchanged fields, leaving newer typing intact.
        return {
          ...previous,
          telegram: (idEdited || hashEdited) && previous.telegram ? {
            apiId: idEdited ? previous.telegram.apiId : String(saved.telegram.apiId ?? ""),
            apiHash: hashEdited ? previous.telegram.apiHash : "",
          } : null,
          telegramNotice: idEdited || hashEdited ? "已保存提交的版本" : "Telegram 设置已保存",
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存配置失败";
      patchFeedback(section === "telegram" ? { telegramError: message } : { mediaError: message });
    } finally {
      if (inFlight.current === request) {
        inFlight.current = null;
        setActiveSave(null);
      }
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
    saving: savingSection !== null,
    savingSection,
    dirty: telegramDirty || mediaDirty,
    telegramDirty,
    mediaDirty,
    loadError,
    telegramError: current.telegramError,
    mediaError: current.mediaError,
    telegramNotice: current.telegramNotice,
    mediaNotice: current.mediaNotice,
    telegramFieldErrors: current.telegramFieldErrors,
    loadStatus,
    resetDraft,
    handleSave,
    setApiId,
    setApiHash,
    setThumbIndex,
  };
}
