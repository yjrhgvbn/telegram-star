import { describe, expect, it } from "vitest";
import {
  getDialogPageSlice,
  getNextDialogPage,
  normalizeBackfillBatchSize,
  normalizeHistoricalPreviewLimits,
  normalizeSegmentedHistoryLimits,
  normalizeSingleChatMessageLimits,
} from "./historyScanPolicy.js";

describe("historyScanPolicy", () => {
  it("normalizes single-chat message limits", () => {
    expect(normalizeSingleChatMessageLimits({})).toEqual({
      messageLimit: 100,
      chatSearchLimit: 500,
    });
    expect(normalizeSingleChatMessageLimits({ messageLimit: 0, chatSearchLimit: 2000 })).toEqual({
      messageLimit: 1,
      chatSearchLimit: 1000,
    });
  });

  it("normalizes segmented history batch limits", () => {
    expect(normalizeSegmentedHistoryLimits({})).toEqual({ batchSize: 100 });
    expect(normalizeSegmentedHistoryLimits({ batchSize: 1 })).toEqual({ batchSize: 20 });
    expect(normalizeSegmentedHistoryLimits({ batchSize: 500 })).toEqual({ batchSize: 200 });
  });

  it("normalizes preview scan limits and page bounds", () => {
    expect(normalizeHistoricalPreviewLimits({})).toEqual({
      perChatLimit: 200,
      totalLimit: 50,
      pageSize: 100,
      page: 1,
    });
    expect(
      normalizeHistoricalPreviewLimits({
        perChatLimit: 20_000,
        totalLimit: 0,
        pageSize: 900,
        page: -3,
      }),
    ).toEqual({
      perChatLimit: 10000,
      totalLimit: 1,
      pageSize: 500,
      page: 1,
    });
  });

  it("normalizes backfill batch concurrency", () => {
    expect(normalizeBackfillBatchSize()).toBe(50);
    expect(normalizeBackfillBatchSize(0)).toBe(1);
    expect(normalizeBackfillBatchSize(800)).toBe(500);
  });

  it("calculates dialog page slices and next page", () => {
    const dialogs = ["a", "b", "c", "d", "e"];

    expect(getDialogPageSlice(dialogs, 2, 2)).toEqual(["c", "d"]);
    expect(getNextDialogPage(dialogs.length, 2, 2)).toBe(3);
    expect(getNextDialogPage(dialogs.length, 3, 2)).toBeUndefined();
  });
});
