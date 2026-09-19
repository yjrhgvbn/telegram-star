import { afterAll, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../../services/messageMemberships.test-helpers.js";
const state = vi.hoisted(() => ({
  fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined,
  backfill: vi.fn(),
}));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../../services/messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
vi.mock("../../services/telegram.js", () => ({ backfillFilterHistory: state.backfill }));
import { db } from "../../db/index.js";
import { createFilterBackfillJob } from "./filterBackfillJobs.service.js";
afterAll(async () => state.fixture?.cleanup());

describe("backfill job concurrency", () => {
  it("returns one active job and scans only once for simultaneous requests", async () => {
    const now = new Date().toISOString();
    const filter = await db.filter.create({ data: { name: "private messages", conditions: "[]", createdAt: now, updatedAt: now } });
    let finish!: (value: unknown) => void;
    state.backfill.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const jobs = await Promise.all(Array.from({ length: 8 }, () => createFilterBackfillJob(filter.id, { mode: "count", perChatLimit: 100 })));
    expect(new Set(jobs.map(job => job.id)).size).toBe(1);
    expect(await db.filterBackfillJob.count()).toBe(1);
    await vi.waitFor(() => expect(state.backfill).toHaveBeenCalledTimes(1));
    finish({ scannedChats: 1, scannedMessages: 0, matchedCount: 0, savedCount: 0, skippedExistingCount: 0, skippedRemovedCount: 0 });
    await vi.waitFor(async () => expect((await db.filterBackfillJob.findUnique({ where: { id: jobs[0].id } }))?.status).toBe("completed"));
  });
});
