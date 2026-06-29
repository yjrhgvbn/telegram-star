/**
 * 统一获取消息的文本内容（text 或 caption）。
 * 带媒体的消息可能在 message.message 中存储 caption。
 */
export function getMessageTextContent(message: any): string {
  if (typeof message?.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }
  if (
    typeof message?.message === "string" &&
    message.message.trim().length > 0
  ) {
    return message.message;
  }
  return "";
}

export function hasMessageContent(message: any): boolean {
  if (!message) return false;
  if (getMessageTextContent(message).length > 0) return true;

  return Boolean(message.media && message.media.className !== "MessageMediaEmpty");
}
