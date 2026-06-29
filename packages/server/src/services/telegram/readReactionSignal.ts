export interface ReactionMessageRef {
  chatId: string;
  telegramMessageId: number;
}

/**
 * 判断消息的 reactions 中是否包含当前用户自己的 reaction。
 * GramJS 在自己 react 过的消息上会为对应 result 设置 chosen=true 或 chosenOrder。
 */
export function hasUserReactionSignal(message: any): boolean {
  const results = message?.reactions?.results;
  if (!Array.isArray(results)) return false;

  // chosen=true 是最明确的自有 reaction 信号；chosenOrder 仅接受非负整数，避免 null/浮点/负数误判。
  return results.some(
    (reaction: any) =>
      reaction?.chosen === true ||
      (typeof reaction?.chosenOrder === "number" &&
        Number.isInteger(reaction.chosenOrder) &&
        reaction.chosenOrder >= 0),
  );
}

/**
 * 从 UpdateMessageReactions 中提取数据库使用的 chatId 与消息 ID。
 * 当前项目只同步群组/频道消息，私聊等其他 peer 类型保持忽略。
 */
export function extractReactionMessageRef(update: any): ReactionMessageRef | null {
  if (update?.className !== "UpdateMessageReactions") return null;

  const peer = update.peer;
  const telegramMessageId = Number(update.msgId || 0);
  if (!peer || !telegramMessageId) return null;

  let chatId = "";
  if (peer.className === "PeerChannel") {
    chatId = peer.channelId?.toString?.() ?? "";
  } else if (peer.className === "PeerChat") {
    chatId = peer.chatId?.toString?.() ?? "";
  }

  return chatId ? { chatId, telegramMessageId } : null;
}
