export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (typeof DOMException !== "undefined" && error instanceof DOMException)
  );
}

export function formatServerUnavailableMessage(serverUrl: string): string {
  if (serverUrl) {
    return `无法连接到后端 ${serverUrl}，请检查服务器地址、网络或 CORS 设置。`;
  }

  return "无法连接到同源后端，请确认后端正在运行，或在设置页修改服务器地址。";
}
