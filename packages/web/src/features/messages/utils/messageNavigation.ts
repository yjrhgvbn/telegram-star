import {
  consumeBrowserStorageItem,
  getBrowserStorage,
  setBrowserStorageItem,
  type BrowserStorage,
} from "@telegram-star/shared/browser-storage";

export const TELEGRAM_JUMP_MESSAGE_ID_KEY = "telegram_jump_msg_id";

export function rememberTelegramJumpMessageId(
  messageId: number,
  storage: BrowserStorage | undefined = getBrowserStorage("session"),
): void {
  setBrowserStorageItem(storage, TELEGRAM_JUMP_MESSAGE_ID_KEY, String(messageId));
}

export function consumeTelegramJumpMessageId(
  storage: BrowserStorage | undefined = getBrowserStorage("session"),
): number | null {
  const value = consumeBrowserStorageItem(storage, TELEGRAM_JUMP_MESSAGE_ID_KEY);
  if (!value) return null;

  const messageId = Number.parseInt(value, 10);
  return Number.isFinite(messageId) ? messageId : null;
}
