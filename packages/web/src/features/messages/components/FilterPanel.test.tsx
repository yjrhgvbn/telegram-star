// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/types";
import { FilterPanel } from "./FilterPanel";

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `分组 ${id}`,
    conditions: [{ type: "keyword", values: ["更新"] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
    forwardTargetIds: [],
    latestMessageAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

describe("FilterPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows recent activity instead of condition counts", () => {
    const now = new Date(2026, 7, 9, 12, 0, 0).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);

    render(
      <MemoryRouter>
        <FilterPanel
          filters={[
            createFilter(1, {
              latestMessageAt: new Date(now - 2 * 3_600_000).toISOString(),
            }),
            createFilter(2),
          ]}
          loading={false}
          selectedFilterId="1"
          onSelectFilter={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 小时前")).toBeTruthy();
    expect(screen.getByText("尚无命中消息")).toBeTruthy();
    expect(screen.queryByText("关键词 1")).toBeNull();
  });
});
