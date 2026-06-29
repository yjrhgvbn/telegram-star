import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type { AuthStatus } from "@/types";

const initialAuthStatus: AuthStatus = {
  connected: false,
  authorized: false,
  waitingForCode: false,
  waitingForPassword: false,
  telegramConfigured: false,
  telegramConfigSource: "missing",
  databaseConfigured: false,
  apiId: null,
  apiHashMasked: null,
};

export function useAuthStatus() {
  const queryClient = useQueryClient();
  const authStatusQuery = useQuery({
    queryKey: queryKeys.auth.status,
    queryFn: api.auth.status,
    retry: 0,
  });

  const { mutateAsync: logoutAsync } = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.status, initialAuthStatus);
    },
  });

  const handleLoginSuccess = useCallback(() => {
    queryClient.setQueryData<AuthStatus>(queryKeys.auth.status, (current) => ({
      ...(current ?? initialAuthStatus),
      connected: true,
      authorized: true,
      waitingForCode: false,
      waitingForPassword: false,
    }));
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.status });
  }, [queryClient]);

  const handleLogout = useCallback(async () => {
    await logoutAsync();
  }, [logoutAsync]);

  return {
    authStatus: authStatusQuery.data ?? initialAuthStatus,
    authLoading: authStatusQuery.isLoading,
    handleLoginSuccess,
    handleLogout,
  };
}
