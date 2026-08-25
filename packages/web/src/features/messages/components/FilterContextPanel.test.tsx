// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/types";
import { FilterContextPanel } from "./FilterContextPanel";

const selectedFilter: Filter = {
  id: 7,
  name: "本季新番",
  conditions: [{ type: "keyword", values: ["更新"] }],
  enabled: true,
  autoLocateUnreadNearRead: true,
  forwardTargetIds: [],
  latestMessageAt: null,
  isFocused: false,
  lastEngagedAt: null,
  lastEngagementType: null,
  lastEngagedMessageId: null,
  manualGroupId: null,
  manualSortOrder: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("FilterContextPanel", () => {
  afterEach(cleanup);

  it("offers filter editing from the detail context panel", async () => {
    const onEditSelectedFilter = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterContextPanel
        filters={[selectedFilter]}
        selectedFilter={selectedFilter}
        selectedFilterId={String(selectedFilter.id)}
        telegramAuthorized
        onEditSelectedFilter={onEditSelectedFilter}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑规则 本季新番" }));
    expect(onEditSelectedFilter).toHaveBeenCalledOnce();
  });

  it("does not show a filter editing action for all messages", () => {
    render(
      <FilterContextPanel
        filters={[selectedFilter]}
        selectedFilter={null}
        selectedFilterId=""
        telegramAuthorized
        onEditSelectedFilter={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /编辑规则/ })).toBeNull();
  });
});
