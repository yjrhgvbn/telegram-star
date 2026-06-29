import type {
  Filter,
  FilterBackfillResponse,
  FilterPreviewResponse,
} from "@telegram-star/shared/contracts/filters";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { filterRoutes } from "./filters.routes.js";
import * as filtersService from "./filters.service.js";

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
    toggleFilter: vi.fn(),
    updateFilter: vi.fn(),
  };
});

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `filter-${id}`,
    conditions: [{ type: "keyword", values: [`keyword-${id}`] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
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
    vi.mocked(filtersService.toggleFilter).mockReset();
    vi.mocked(filtersService.updateFilter).mockReset();
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
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(created);
    expect(filtersService.createFilter).toHaveBeenCalledWith({
      name: "created",
      conditions: [{ type: "keyword", values: ["night"] }],
      autoLocateUnreadNearRead: false,
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

  it("updates, toggles, previews, and backfills through validated params", async () => {
    const updated = createFilter(3, { name: "updated" });
    const toggled = createFilter(3, { enabled: false });
    const preview: FilterPreviewResponse = {
      messages: [],
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
      },
    });
    const toggleResponse = await app.inject({ method: "PATCH", url: "/api/filters/3/toggle" });
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
    expect(previewResponse.statusCode).toBe(200);
    expect(backfillResponse.statusCode).toBe(200);
    expect(filtersService.updateFilter).toHaveBeenCalledWith(3, {
      name: "updated",
      conditions: [{ type: "keyword", values: ["updated"] }],
    });
    expect(filtersService.toggleFilter).toHaveBeenCalledWith(3);
    expect(filtersService.previewFilterHistory).toHaveBeenCalledWith({
      conditions: [{ type: "keyword", values: ["updated"] }],
      page: 2,
    });
    expect(filtersService.backfillFilter).toHaveBeenCalledWith(3, { perChatLimit: 10 });
  });
});
