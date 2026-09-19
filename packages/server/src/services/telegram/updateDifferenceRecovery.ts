import { Api, type TelegramClient } from "telegram";
import { getInputChannel, getInputPeer, getPeerId } from "telegram/Utils.js";
import { appLogger } from "../../shared/logging.js";
import { getPeerChatId, isValidChat } from "./utils.js";
import type { MessageIngestionResult } from "./messageIngestion.js";

interface GlobalUpdateCursor {
  pts: number;
  qts: number;
  date: number;
}

export interface UpdateRecoveryCursor {
  global?: GlobalUpdateCursor;
  channels: Record<string, number>;
}

export interface UpdateRecoveryDialog {
  entity?: any;
  dialog?: { pts?: number };
}

export interface UpdateRecoveryResult {
  scannedMessages: number;
  savedCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  failedScopes: number;
}

export interface UpdateRecoveryDependencies {
  loadCursor: () => Promise<UpdateRecoveryCursor | null>;
  saveCursor: (cursor: UpdateRecoveryCursor) => Promise<void>;
  isActive: () => boolean;
  ingest: (message: any, chat: any) => Promise<MessageIngestionResult>;
  maxPages?: number;
}

const MAX_DIFFERENCE_PAGES = 50;
const DIFFERENCE_PAGE_SIZE = 100;
const MESSAGE_UPDATES = new Set([
  "UpdateNewMessage", "UpdateNewChannelMessage", "UpdateEditMessage", "UpdateEditChannelMessage",
]);

function validCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Configuration rows are persisted independently of the history time watermark. */
export function parseUpdateRecoveryCursor(value: unknown): UpdateRecoveryCursor | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UpdateRecoveryCursor>;
  const global = candidate.global;
  const channels = Object.fromEntries(Object.entries(candidate.channels ?? {}).filter(
    ([id, pts]) => /^\d+$/.test(id) && validCounter(pts),
  ));
  return {
    ...(global && validCounter(global.pts) && validCounter(global.qts) && validCounter(global.date)
      ? { global: { pts: global.pts, qts: global.qts, date: global.date } }
      : {}),
    channels,
  };
}

/**
 * Recover message changes by Telegram's independent global/channel pts sequences.
 * Unlike history pagination, an edited message is processed regardless of its original date.
 * Each page is acknowledged only after ingestion succeeds; retries use normal DB deduplication.
 */
export async function recoverUpdateDifferences(input: {
  client: Pick<TelegramClient, "invoke">;
  accountId: string;
  dialogs: UpdateRecoveryDialog[];
  chatScope: Set<string> | null;
}, dependencies: UpdateRecoveryDependencies): Promise<UpdateRecoveryResult> {
  const assertActive = () => {
    if (!dependencies.isActive()) throw new Error("Telegram update recovery cancelled after account/connection change");
  };
  assertActive();
  const loaded = await dependencies.loadCursor();
  const cursor: UpdateRecoveryCursor = {
    ...(loaded?.global ? { global: { ...loaded.global } } : {}),
    channels: { ...loaded?.channels },
  };
  const result: UpdateRecoveryResult = {
    scannedMessages: 0, savedCount: 0, duplicateCount: 0, unmatchedCount: 0, failedScopes: 0,
  };
  const maxPages = dependencies.maxPages ?? MAX_DIFFERENCE_PAGES;
  const dialogEntities = new Map<string, any>();
  for (const dialog of input.dialogs) {
    if (isValidChat(dialog.entity)) dialogEntities.set(getPeerId(dialog.entity), dialog.entity);
  }
  const save = async () => {
    assertActive();
    await dependencies.saveCursor(cursor);
  };
  const invoke = async (request: any): Promise<any> => {
    assertActive();
    const response = await input.client.invoke(request);
    assertActive();
    return response;
  };
  const processPage = async (response: any) => {
    const entities = new Map(dialogEntities);
    for (const entity of [...(response.users ?? []), ...(response.chats ?? [])]) {
      const peerId = getPeerId(entity);
      const existing = entities.get(peerId);
      // A min entity cannot supply an input peer/access hash. Preserve the complete
      // dialog entity instead of replacing it with a partial difference response.
      if (entity.min && existing && !existing.min) continue;
      entities.set(peerId, entity);
    }
    const messages = new Map<string, any>();
    for (const message of [
      ...(response.newMessages ?? response.messages ?? []),
      ...(response.otherUpdates ?? []).filter((update: any) => MESSAGE_UPDATES.has(update.className))
        .map((update: any) => update.message),
    ]) {
      if (!message?.peerId || message.className === "MessageEmpty") continue;
      messages.set(`${getPeerId(message.peerId)}:${message.id}`, message);
    }
    for (const message of messages.values()) {
      assertActive();
      const peerId = getPeerId(message.peerId);
      const chatId = getPeerChatId(message.peerId);
      // Global differences also contain unrelated peers, including groups the user
      // has left. Their missing/inaccessible entity must not block a selected chat.
      if (input.chatScope && !input.chatScope.has(chatId)) continue;
      const chat = entities.get(peerId);
      if (["ChatForbidden", "ChannelForbidden", "UserEmpty", "ChatEmpty"].includes(chat?.className)) {
        appLogger.warn({ event: "telegram.difference.peer_unavailable", accountId: input.accountId, peerId },
          "Skipped a recovered message whose Telegram peer is no longer available");
        continue;
      }
      if (!isValidChat(chat)) {
        // Never acknowledge a message that could not be resolved; retry the page later.
        throw new Error(`Missing Telegram entity for recovered peer ${peerId}`);
      }
      // Raw RPC results need the same initialization as GramJS getMessages results.
      // It resolves sender/chat from response entities without adding Telegram requests.
      if (typeof message._finishInit === "function") {
        let inputPeer;
        try { inputPeer = getInputPeer(chat); }
        catch {
          // A newly encountered min user may not have an access hash yet. GramJS
          // can still initialize its message from response entities and its cache;
          // no input peer is needed to persist the supplied text/media metadata.
          const known = dialogEntities.get(peerId);
          if (known && known !== chat) {
            try { inputPeer = getInputPeer(known); } catch { /* Use GramJS's cached peer. */ }
          }
        }
        message._finishInit(input.client, entities, inputPeer);
        message._entities = entities;
      }
      const status = await dependencies.ingest(message, chat);
      assertActive();
      result.scannedMessages += 1;
      if (status === "created") result.savedCount += 1;
      else if (status === "duplicate") result.duplicateCount += 1;
      else result.unmatchedCount += 1;
    }
  };
  const recoverScope = async (scope: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      assertActive();
      result.failedScopes += 1;
      appLogger.error({ event: "telegram.difference.failed", accountId: input.accountId, scope, err },
        "Telegram difference recovery failed; the unprocessed cursor is retained");
    }
  };
  const logTooLong = (scope: string) => appLogger.error({
    event: "telegram.difference.too_long", accountId: input.accountId, scope,
  }, "Telegram no longer retains the complete update difference; historical edits outside its snapshot may need manual backfill");

  await recoverScope("global", async () => {
    if (!cursor.global) {
      const state = await invoke(new Api.updates.GetState());
      cursor.global = { pts: state.pts, qts: state.qts, date: state.date };
      await save();
      return;
    }
    for (let page = 0; page < maxPages; page += 1) {
      const previous = cursor.global;
      const response = await invoke(new Api.updates.GetDifference({
        ...previous, ptsLimit: DIFFERENCE_PAGE_SIZE, qtsLimit: DIFFERENCE_PAGE_SIZE,
      }));
      if (response.className === "updates.DifferenceTooLong") {
        logTooLong("global");
        // Telegram has discarded part of the update log. Establish a new baseline before
        // the caller's bounded history pass; do not spin forever on an unrecoverable cursor.
        const state = await invoke(new Api.updates.GetState());
        cursor.global = { pts: state.pts, qts: state.qts, date: state.date };
        await save();
        return;
      }
      if (response.className === "updates.DifferenceEmpty") {
        cursor.global = { ...previous, date: response.date };
        await save();
        return;
      }
      if (!["updates.Difference", "updates.DifferenceSlice"].includes(response.className)) {
        throw new Error(`Unexpected Telegram difference ${response.className}`);
      }
      await processPage(response);
      const state = response.state ?? response.intermediateState;
      if (!state || !validCounter(state.pts) || !validCounter(state.qts) || !validCounter(state.date)) {
        throw new Error("Telegram difference returned an invalid state");
      }
      cursor.global = { pts: state.pts, qts: state.qts, date: state.date };
      await save();
      if (response.className === "updates.Difference") return;
      if (previous.pts === state.pts && previous.qts === state.qts && previous.date === state.date) {
        throw new Error("Telegram global difference pagination stopped advancing");
      }
    }
    throw new Error(`Telegram global difference exceeded ${maxPages} pages; next run continues from its saved cursor`);
  });

  for (const dialog of input.dialogs) {
    const entity = dialog.entity;
    if (entity?.className !== "Channel") continue;
    const chatId = entity.id.toString();
    if (input.chatScope && !input.chatScope.has(chatId)) continue;
    await recoverScope(`channel:${chatId}`, async () => {
      if (cursor.channels[chatId] === undefined) {
        if (!validCounter(dialog.dialog?.pts)) throw new Error("Telegram dialog is missing its initial channel pts");
        cursor.channels[chatId] = dialog.dialog.pts;
        await save();
        return;
      }
      for (let page = 0; page < maxPages; page += 1) {
        const previousPts = cursor.channels[chatId];
        const response = await invoke(new Api.updates.GetChannelDifference({
          channel: getInputChannel(entity), filter: new Api.ChannelMessagesFilterEmpty(),
          pts: previousPts, limit: DIFFERENCE_PAGE_SIZE, force: true,
        }));
        if (!["updates.ChannelDifference", "updates.ChannelDifferenceEmpty", "updates.ChannelDifferenceTooLong"].includes(response.className)) {
          throw new Error(`Unexpected Telegram channel difference ${response.className}`);
        }
        const tooLong = response.className === "updates.ChannelDifferenceTooLong";
        if (tooLong) logTooLong(`channel:${chatId}`);
        await processPage(response);
        const pts = tooLong ? response.dialog?.pts : response.pts;
        if (!validCounter(pts) || pts < previousPts) throw new Error("Telegram channel difference returned an invalid pts");
        cursor.channels[chatId] = pts;
        await save();
        if (response.final || response.className === "updates.ChannelDifferenceEmpty") return;
        if (pts === previousPts) throw new Error("Telegram channel difference pagination stopped advancing");
      }
      throw new Error(`Telegram channel difference exceeded ${maxPages} pages; next run continues from its saved cursor`);
    });
  }
  return result;
}
