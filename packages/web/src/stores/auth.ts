import { create } from "zustand";
import { api } from "@/api/client";
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

let initializeRequest: Promise<void> | null = null;

interface AuthStore {
  authStatus: AuthStatus;
  authLoading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  markAuthorized: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  authStatus: initialAuthStatus,
  authLoading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    if (initializeRequest) {
      return initializeRequest;
    }

    set({ authLoading: true });

    initializeRequest = api.auth
      .status()
      .then((authStatus) => {
        set({ authStatus, authLoading: false, initialized: true });
      })
      .catch(() => {
        set({ authLoading: false, initialized: true });
      })
      .finally(() => {
        initializeRequest = null;
      });

    return initializeRequest;
  },

  markAuthorized: () => {
    set((state) => ({
      authStatus: {
        ...state.authStatus,
        connected: true,
        authorized: true,
        waitingForCode: false,
        waitingForPassword: false,
      },
    }));
  },

  logout: async () => {
    await api.auth.logout();
    set({ authStatus: initialAuthStatus, authLoading: false, initialized: true });
  },
}));
