// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/types";
import { FiltersFeature } from "./FiltersFeature";

const useFiltersMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: null,
    error: null,
    isFetching: false,
    isLoading: false,
    isPlaceholderData: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/useAuthStatus", () => ({
  useAuthStatus: () => ({
    authStatus: { authorized: false },
    authLoading: false,
    handleLoginSuccess: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFilters", () => ({ useFilters: useFiltersMock }));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./components/FilterForm", () => ({ FilterForm: () => null }));
vi.mock("./components/HistoryBackfillDialog", () => ({
  HistoryBackfillDialog: () => null,
}));
vi.mock("./components/PreviewPanel", () => ({ PreviewPanel: () => null }));

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

function renderEditorFromMessages() {
  return render(
    <MemoryRouter
      initialEntries={["/messages/7", "/filters/7"]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/messages/:filterId" element={<p>消息上下文</p>} />
        <Route path="/filters/:filterId" element={<FiltersFeature />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FiltersFeature", () => {
  beforeEach(() => {
    useFiltersMock.mockReturnValue({
      filters: [selectedFilter],
      chats: [],
      loading: false,
      chatsLoading: false,
      createFilter: vi.fn(),
      updateFilter: vi.fn(),
      deleteFilter: vi.fn(),
      toggleFilter: vi.fn(),
      startBackfillJob: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns to the page that opened the filter editor", async () => {
    const user = userEvent.setup();
    renderEditorFromMessages();

    await user.click(screen.getByRole("button", { name: "返回上一页" }));

    expect(screen.getByText("消息上下文")).toBeTruthy();
  });

  it("returns to the opener after confirming an unsaved draft should be discarded", async () => {
    const user = userEvent.setup();
    renderEditorFromMessages();

    await user.click(screen.getByRole("button", { name: "编辑规则名称" }));
    await user.clear(screen.getByRole("textbox", { name: "自定义规则名称" }));
    await user.type(
      screen.getByRole("textbox", { name: "自定义规则名称" }),
      "临时名称",
    );
    await user.click(screen.getByRole("button", { name: "返回上一页" }));
    await user.click(screen.getByRole("button", { name: "放弃修改" }));

    expect(screen.getByText("消息上下文")).toBeTruthy();
  });
});
