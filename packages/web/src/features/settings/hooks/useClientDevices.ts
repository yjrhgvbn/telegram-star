import { useCallback, useMemo } from "react";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientDevice } from "@/types";
import { clientsApi } from "@/shared/api/clients";
import { queryKeys } from "@/shared/query/queryKeys";
import { getClientDeviceId } from "@/shared/runtime/clientRuntime";
import { getRuntimeServerUrl } from "@/shared/runtime/serverConfig";

const deleteDeviceKey = ["clients", "delete"] as const;
interface DeleteDeviceVariables { id: string; serverUrl: string }

// Mutation state belongs to the QueryClient, so leaving and reopening settings
// cannot hide an in-flight deletion or enable a conflicting server switch.
export function useClientDeviceDeletion() {
  const pendingIds = useMutationState({
    filters: { mutationKey: deleteDeviceKey, exact: true, status: "pending" },
    select: (mutation) => (mutation.state.variables as DeleteDeviceVariables).id,
  });
  return pendingIds[0] ?? null;
}

export function useClientDevices() {
  const queryClient = useQueryClient();
  const deletingId = useClientDeviceDeletion();
  const currentClientId = useMemo(() => getClientDeviceId(), []);

  const devicesQuery = useQuery({
    queryKey: queryKeys.clients.all,
    queryFn: clientsApi.list,
  });

  const { mutateAsync: deleteDeviceAsync } = useMutation({
    mutationKey: deleteDeviceKey,
    mutationFn: ({ id, serverUrl }: DeleteDeviceVariables) => {
      if (getRuntimeServerUrl() !== serverUrl) throw new Error("服务器已切换，请重新操作");
      return clientsApi.delete(id);
    },
    onSuccess: async (_response, { id, serverUrl }) => {
      // This cache key is shared by every server. A late response from the old
      // backend must neither cancel the new list request nor edit its records.
      if (getRuntimeServerUrl() !== serverUrl) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.clients.all, exact: true });
      if (getRuntimeServerUrl() !== serverUrl) return;
      queryClient.setQueryData<ClientDevice[]>(queryKeys.clients.all, (current) =>
        current?.filter((device) => device.id !== id),
      );
    },
  });

  const deleteDevice = useCallback(
    async (id: string) => {
      // Check the live cache as well as the rendered button state; two mounted
      // consumers can otherwise begin duplicate removals in the same tick.
      if (queryClient.isMutating({ mutationKey: deleteDeviceKey, exact: true }))
        throw new Error("正在移除设备记录，请稍后再试");
      await deleteDeviceAsync({ id, serverUrl: getRuntimeServerUrl() });
    },
    [deleteDeviceAsync, queryClient],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
  }, [queryClient]);

  return {
    devices: devicesQuery.data ?? [],
    currentClientId,
    deletingId,
    loading: devicesQuery.isLoading,
    refreshing: devicesQuery.isFetching,
    error: devicesQuery.error instanceof Error ? devicesQuery.error.message : null,
    deleteDevice,
    refresh,
  };
}
