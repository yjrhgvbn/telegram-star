import type {
  Filter,
  FilterBackfillJob,
  FilterBackfillResponse,
  FilterPreviewResponse,
} from "@telegram-star/shared/contracts/filters";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { filterRoutes } from "./filters.routes.js";
import * as filtersService from "./filters.service.js";
import * as backfillJobsService from "./filterBackfillJobs.service.js";

vi.mock("./filters.service.js", () => {
  class FilterNotFoundError extends Error {
    constructor() {
      super("Filter not found");
    }
  }

  return {
    FilterNotFoundError,
    backfillFilter: vi.fn(),
    createFilter: vi.fn(),
    deleteFilter: vi.fn(),
    listFilters: vi.fn(),
    previewFilterHistory: vi.fn(),
    reorderManualFilters: vi.fn(),
    setFilterFocused: vi.fn(),
    setFilterPlacement: vi.fn(),
    toggleFilter: vi.fn(),
    updateFilter: vi.fn(),
  };
});

vi.mock("./filterBackfillJobs.service.js", () => {
  class FilterBackfillJobNotFoundError extends Error {
    constructor(message = "Backfill job not found") {
      super(message);
    }
  }

  return {
    FilterBackfillJobNotFoundError,
    createFilterBackfillJob: vi.fn(),
    getFilterBackfillJob: vi.fn(),
    getLatestFilterBackfillJob: vi.fn(),
  };
});

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `filter-${id}`,
    conditions: [{ type: "keyword", values: [`keyword-${id}`] }],
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
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    updatedAt: `2026-06-29T00:00:0${id}.000Z`,
    ...patch,
  };
}

describe("filter routes", () => {
  beforeEach(() => {
    vi.mocked(filtersService.backfillFilter).mockReset();
    vi.mocked(filtersService.createFilter).mockReset();
    vi.mocked(filtersService.deleteFilter).mockReset();
    vi.mocked(filtersService.listFilters).mockReset();
    vi.mocked(filtersService.previewFilterHistory).mockReset();
    vi.mocked(filtersService.reorderManualFilters).mockReset();
    vi.mocked(filtersService.setFilterFocused).mockReset();
    vi.mocked(filtersService.setFilterPlacement).mockReset();
    vi.mocked(filtersService.toggleFilter).mockReset();
    vi.mocked(filtersService.updateFilter).mockReset();
    vi.mocked(backfillJobsService.createFilterBackfillJob).mockReset();
    vi.mocked(backfillJobsService.getFilterBackfillJob).mockReset();
    vi.mocked(backfillJobsService.getLatestFilterBackfillJob).mockReset();
  });

  it("starts and reads background backfill jobs", async () => {
    const job: FilterBackfillJob = {
      id: "job-3",
      filterId: 3,
      mode: "count",
      status: "running",
      startAt: null,
      endAt: null,
      perChatLimit: 5_000,
      totalChats: 2,
      completedChats: 1,
      scannedMessages: 5_000,
      matchedCount: 8,
      savedCount: 7,
      skippedExistingCount: 1,
      currentChatTitle: "资源频道",
      error: null,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:01:00.000Z",
      completedAt: null,
    };
    vi.mocked(backfillJobsService.createFilterBackfillJob).mockResolvedValue(job);
    vi.mocked(backfillJobsService.getLatestFilterBackfillJob).mockResolvedValue(job);
    vi.mocked(backfillJobsService.getFilterBackfillJob).mockResolvedValue(job);
    const app = await createRouteTestApp(filterRoutes);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/filters/3/backfill-jobs",
      payload: { mode: "count", perChatLimit: 5_000 },
    });
    const latestResponse = await app.inject({
      method: "GET",
      url: "/api/filters/3/backfill-jobs/latest",
    });
    const jobResponse = await app.inject({
      method: "GET",
      url: "/api/filters/3/backfill-jobs/job-3",
    });
    await app.close();

    expect(createResponse.statusCode, createResponse.payload).toBe(200);
    expect(latestResponse.statusCode, latestResponse.payload).toBe(200);
    expect(jobResponse.statusCode, jobResponse.payload).toBe(200);
    expect(backfillJobsService.createFilterBackfillJob).toHaveBeenCalledWith(3, {
      mode: "count",
      perChatLimit: 5_000,
    });
    expect(backfillJobsService.getLatestFilterBackfillJob).toHaveBeenCalledWith(3);
    expect(backfillJobsService.getFilterBackfillJob).toHaveBeenCalledWith(3, "job-3");
  });

  it("lists filters", async () => {
    const filters = [createFilter(1)];
    vi.mocked(filtersService.listFilters).mockResolvedValue(filters);
    const app = await createRouteTestApp(filterRoutes);

    const response = await app.inject({ method: "GET", url: "/api/filters" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(filters);
  });

  it("validates and creates filters", async () => {
    const created = createFilter(2, { name: "created" });
    vi.mocked(filtersService.createFilter).mockResolvedValue(created);
    const app = await createRouteTestApp(filterRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/filters",
      payload: {
        name: "created",
        conditions: [{ type: "keyword", values: ["night"] }],
        autoLocateUnreadNearRead: false,
        forwardTargetIds: [2],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(created);
    expect(filtersService.createFilter).toHaveBeenCalledWith({
      name: "created",
      conditions: [{ type: "keyword", values: ["night"] }],
      autoLocateUnreadNearRead: false,
      forwardTargetIds: [2],
    });
  });

  it("rejects invalid filter create payloads", async () => {
    const app = await createRouteTestApp(filterRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/filters",
      payload: { name: "", conditions: [] },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(filtersService.createFilter).not.toHaveBeenCalled();
  });

  it("maps service not-found errors to 404", async () => {
    vi.mocked(filtersService.deleteFilter).mockRejectedValue(new filtersService.FilterNotFoundError());
    const app = await createRouteTestApp(filterRoutes);

    const response = await app.inject({ method: "DELETE", url: "/api/filters/99" });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(parseJson(response.payload)).toEqual({ error: "Filter not found" });
  });

  it("updates, focuses, toggles, previews, and backfills through validated params", async () => {
    const updated = createFilter(3, { name: "updated" });
    const focused = createFilter(3, { isFocused: true });
    const toggled = createFilter(3, { enabled: false });
    const preview: FilterPreviewResponse = {
      messages: [],
      samples: [],
      scannedChats: 2,
      total: 0,
      nextPage: 2,
    };
    const backfill: FilterBackfillResponse = {
      scannedChats: 2,
      matchedCount: 3,
      savedCount: 2,
      skippedExistingCount: 1,
    };

    vi.mocked(filtersService.updateFilter).mockResolvedValue(updated);
    vi.mocked(filtersService.setFilterFocused).mockResolvedValue(focused);
    vi.mocked(filtersService.toggleFilter).mockResolvedValue(toggled);
    vi.mocked(filtersService.previewFilterHistory).mockResolvedValue(preview);
    vi.mocked(filtersService.backfillFilter).mockResolvedValue(backfill);

    const app = await createRouteTestApp(filterRoutes);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/filters/3",
      payload: {
        name: "updated",
        conditions: [{ type: "keyword", values: ["updated"] }],
        forwardTargetIds: [4],
      },
    });
    const toggleResponse = await app.inject({ method: "PATCH", url: "/api/filters/3/toggle" });
    const focusResponse = await app.inject({
      method: "PATCH",
      url: "/api/filters/3/focus",
      payload: { isFocused: true },
    });
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/filters/preview",
      payload: {
        conditions: [{ type: "keyword", values: ["updated"] }],
        page: 2,
      },
    });
    const backfillResponse = await app.inject({
      method: "POST",
      url: "/api/filters/3/backfill",
      payload: { perChatLimit: 10 },
    });
    await app.close();

    expect(updateResponse.statusCode).toBe(200);
    expect(toggleResponse.statusCode).toBe(200);
    expect(focusResponse.statusCode).toBe(200);
    expect(previewResponse.statusCode).toBe(200);
    expect(backfillResponse.statusCode).toBe(200);
    expect(filtersService.updateFilter).toHaveBeenCalledWith(3, {
      name: "updated",
      conditions: [{ type: "keyword", values: ["updated"] }],
      forwardTargetIds: [4],
    });
    expect(filtersService.toggleFilter).toHaveBeenCalledWith(3);
    expect(filtersService.setFilterFocused).toHaveBeenCalledWith(3, { isFocused: true });
    expect(filtersService.previewFilterHistory).toHaveBeenCalledWith({
      conditions: [{ type: "keyword", values: ["updated"] }],
      page: 2,
    });
    expect(filtersService.backfillFilter).toHaveBeenCalledWith(3, { perChatLimit: 10 });
  });

  it("rejects invalid focus payloads", async () => {
    const app = await createRouteTestApp(filterRoutes);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/filters/3/focus",
      payload: { isFocused: "yes" },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(filtersService.setFilterFocused).not.toHaveBeenCalled();
  });

  it("moves and reorders filters through validated payloads", async () => {
    const moved = createFilter(3, { manualGroupId: 2, manualSortOrder: 1 });
    vi.mocked(filtersService.setFilterPlacement).mockResolvedValue(moved);
    vi.mocked(filtersService.reorderManualFilters).mockResolvedValue({ success: true });
    const app = await createRouteTestApp(filterRoutes);

    const moveResponse = await app.inject({
      method: "PATCH",
      url: "/api/filters/3/placement",
      payload: { manualGroupId: 2, targetIndex: 1 },
    });
    const orderResponse = await app.inject({
      method: "PUT",
      url: "/api/filters/manual-order",
      payload: { manualGroupId: 2, filterIds: [3, 1] },
    });
    await app.close();

    expect(moveResponse.statusCode, moveResponse.payload).toBe(200);
    expect(orderResponse.statusCode, orderResponse.payload).toBe(200);
    expect(filtersService.setFilterPlacement).toHaveBeenCalledWith(3, {
      manualGroupId: 2,
      targetIndex: 1,
    });
    expect(filtersService.reorderManualFilters).toHaveBeenCalledWith({
      manualGroupId: 2,
      filterIds: [3, 1],
    });
  });
});
