import { describe, expect, it } from "vitest";
import { getFilterActivityPresentation } from "./filterActivity";

describe("filter activity presentation", () => {
  const now = new Date(2026, 7, 9, 12, 0, 0).getTime();

  it("uses a clear empty state for missing or invalid timestamps", () => {
    expect(getFilterActivityPresentation(null, now)).toEqual({
      label: "尚无命中消息",
      dateTime: null,
      exactTime: null,
    });
    expect(getFilterActivityPresentation("not-a-date", now).label).toBe("尚无命中消息");
  });

  it("formats recent activity with minute, hour, and day precision", () => {
    expect(getFilterActivityPresentation(new Date(now - 30_000).toISOString(), now).label).toBe("刚刚");
    expect(getFilterActivityPresentation(new Date(now - 5 * 60_000).toISOString(), now).label).toBe("5 分钟前");
    expect(getFilterActivityPresentation(new Date(now - 4 * 3_600_000).toISOString(), now).label).toBe("4 小时前");
    expect(getFilterActivityPresentation(new Date(now - 8 * 86_400_000).toISOString(), now).label).toBe("8 天前");
  });

  it("switches older activity to a compact calendar date", () => {
    const sameYear = new Date(2026, 5, 1, 12, 0, 0).toISOString();
    const priorYear = new Date(2025, 11, 1, 12, 0, 0).toISOString();

    expect(getFilterActivityPresentation(sameYear, now).label).toBe("6 月 1 日");
    expect(getFilterActivityPresentation(priorYear, now).label).toBe("2025 年 12 月 1 日");
  });
});
