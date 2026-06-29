import {
  messageEventPayloadSchema,
  type MessageEventPayload,
} from "@telegram-star/shared/contracts/messages";

/**
 * 轻量级 SSE 事件总线。
 *
 * listener 在新消息入库或已读状态变更时调用 emitMessageEvent()，
 * SSE 端点将事件推送给所有已连接的浏览器客户端，
 * 客户端收到后触发 SWR 重新拉取，从而替代定时轮询。
 */

export type { MessageEventPayload } from "@telegram-star/shared/contracts/messages";

/** 已注册的 SSE 推送函数集合 */
const subscribers = new Set<(payload: MessageEventPayload) => void>();

/** 注册一个 SSE 推送函数，返回取消订阅的函数 */
export function subscribeToMessageEvents(
  send: (payload: MessageEventPayload) => void,
): () => void {
  subscribers.add(send);
  return () => subscribers.delete(send);
}

/** 向所有已连接客户端广播消息事件 */
export function emitMessageEvent(payload: MessageEventPayload): void {
  const event = messageEventPayloadSchema.parse(payload);
  for (const send of subscribers) {
    send(event);
  }
}
