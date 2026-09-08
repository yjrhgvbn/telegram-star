import { getSourceAvatar } from "../../services/telegram/avatarCache.js";
import { findMessageAvatarSource } from "./messageAvatar.repository.js";

export async function getMessageAvatarPayload(messageId: number) {
  // Use only a stored message's source. This endpoint must not become an arbitrary Telegram
  // peer lookup or expose individual senders from messages collected in a group.
  const message = await findMessageAvatarSource(messageId);
  return message ? getSourceAvatar(message.chatId) : null;
}
