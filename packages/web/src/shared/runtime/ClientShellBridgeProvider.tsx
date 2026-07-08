import {
  createContext,
  useCallback,
  useContext,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useDesktopBridge } from "./desktopBridge";
import { useMobileBridge } from "./mobileBridge";

export interface ClientShellBridgeValue {
  openExternal: (url: string) => boolean;
}

export const ClientShellBridgeContext = createContext<ClientShellBridgeValue>({
  openExternal: () => false,
});

interface ClientShellBridgeProviderProps {
  children: ReactNode;
}

export function ClientShellBridgeProvider({ children }: ClientShellBridgeProviderProps) {
  const desktopBridge = useDesktopBridge();
  const mobileBridge = useMobileBridge();

  const openExternal = useCallback(
    (url: string) => {
      if (desktopBridge.available && desktopBridge.capabilities?.openExternal) {
        void desktopBridge.sendCommand("open-external", { url });
        return true;
      }

      if (mobileBridge.available && mobileBridge.capabilities?.openExternal) {
        void mobileBridge.sendCommand("open-external", { url });
        return true;
      }

      return false;
    },
    [
      desktopBridge.available,
      desktopBridge.capabilities?.openExternal,
      desktopBridge.sendCommand,
      mobileBridge.available,
      mobileBridge.capabilities?.openExternal,
      mobileBridge.sendCommand,
    ],
  );

  return (
    <ClientShellBridgeContext.Provider value={{ openExternal }}>
      {children}
    </ClientShellBridgeContext.Provider>
  );
}

export function useClientShellBridge() {
  return useContext(ClientShellBridgeContext);
}

export function useClientExternalLink() {
  const { openExternal } = useClientShellBridge();

  return useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      url: string,
      beforeOpen?: () => void,
    ) => {
      beforeOpen?.();

      if (!openExternal(url)) return false;

      event.preventDefault();
      return true;
    },
    [openExternal],
  );
}
