import { afterAll, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../../services/messageMemberships.test-helpers.js";

const state = vi.hoisted(() => ({ fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined }));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../../services/messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
import { db } from "../../db/index.js";
import { listInitialMessages, listMessagesBeforeCursor, listMessagesAfterCursor } from "./messages.repository.js";
afterAll(async () => state.fixture?.cleanup());

describe("cross-chat pagination against SQLite", () => {
  it("visits every message exactly once when dates and Telegram IDs collide", async () => {
    const date = "2026-09-17T00:00:00.000Z";
    const rows = [];
    for (let i = 0; i < 7; i++) rows.push(await db.message.create({ data: {
      chatId: String(100 + i), telegramMessageId: 42, messageDate: date, createdAt: date, content: "same second",
    } }));
    const seen: number[] = [];
    let page = await listInitialMessages({}, 2);
    while (page.rows.length) {
      seen.unshift(...page.rows.map(row => row.id));
      if (!page.hasOlder) break;
      page = await listMessagesBeforeCursor({}, page.rows[0], 2);
    }
    expect(seen).toEqual(rows.map(row => row.id));
    const forward: number[] = [rows[0].id];
    let cursor = rows[0];
    for (;;) {
      const next = await listMessagesAfterCursor({}, cursor, 2);
      forward.push(...next.rows.map(row => row.id));
      if (!next.hasNewer) break;
      cursor = next.rows.at(-1)!;
    }
    expect(forward).toEqual(seen);
  });
});
