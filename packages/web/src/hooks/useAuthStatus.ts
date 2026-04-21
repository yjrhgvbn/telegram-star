import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

export function useAuthStatus() {
  const authStatus = useAuthStore((state) => state.authStatus);
  const authLoading = useAuthStore((state) => state.authLoading);
  const initialize = useAuthStore((state) => state.initialize);
  const handleLoginSuccess = useAuthStore((state) => state.markAuthorized);
  const handleLogout = useAuthStore((state) => state.logout);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return {
    authStatus,
    authLoading,
    handleLoginSuccess,
    handleLogout,
  };
}
