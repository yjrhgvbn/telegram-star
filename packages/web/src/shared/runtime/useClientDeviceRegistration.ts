import { useEffect, useState } from "react";
import { clientsApi } from "@/shared/api/clients";
import {
  buildClientRegisterInput,
  detectClientRuntime,
  getClientDeviceId,
} from "./clientRuntime";

export const CLIENT_HEARTBEAT_INTERVAL_MS = 60_000;

async function registerCurrentClient(clientId: string) {
  const runtime = detectClientRuntime();
  return clientsApi.register(buildClientRegisterInput(clientId, runtime));
}

export function useClientDeviceRegistration(): string {
  // clientId 只在首次渲染时读取或生成，避免组件重渲染时把同一个端误判成新设备。
  const [clientId] = useState(() => getClientDeviceId());

  useEffect(() => {
    let stopped = false;
    let heartbeatTimer: ReturnType<typeof window.setInterval> | undefined;

    const heartbeat = async () => {
      try {
        await clientsApi.heartbeat(clientId);
      } catch {
        // 设备注册不是认证；如果后端切换或记录被删，下一次心跳顺手恢复设备记录即可。
        await registerCurrentClient(clientId).catch(() => undefined);
      }
    };

    const start = async () => {
      try {
        await registerCurrentClient(clientId);
      } catch {
        // 后端离线、地址未配置或网络受限都不能阻断页面启动。
      }

      if (stopped) return;
      // 注册成功与否都启动心跳；请求失败会在 heartbeat 内部被吸收，避免未处理异常影响页面。
      heartbeatTimer = window.setInterval(() => {
        void heartbeat();
      }, CLIENT_HEARTBEAT_INTERVAL_MS);
    };

    void start();

    return () => {
      stopped = true;
      // React StrictMode 开发环境会触发一次额外的挂载/卸载，清理计时器可以避免重复心跳。
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    };
  }, [clientId]);

  return clientId;
}
