import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientDevice } from "@/types";
import { clientsApi } from "@/shared/api/clients";
import { queryKeys } from "@/shared/query/queryKeys";
import { getClientDeviceId } from "@/shared/runtime/clientRuntime";

export function useClientDevices() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const currentClientId = useMemo(() => getClientDeviceId(), []);

  const devicesQuery = useQuery({
    queryKey: queryKeys.clients.all,
    queryFn: clientsApi.list,
  });

  const { mutateAsync: deleteDeviceAsync } = useMutation({
    mutationFn: clientsApi.delete,
    onSuccess: (_response, id) => {
      queryClient.setQueryData<ClientDevice[]>(queryKeys.clients.all, (current) =>
        (current ?? []).filter((device) => device.id !== id),
      );
    },
  });

  const deleteDevice = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteDeviceAsync(id);
      } finally {
        setDeletingId(null);
      }
    },
    [deleteDeviceAsync],
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
