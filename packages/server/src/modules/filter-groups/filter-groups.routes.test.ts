import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { filterGroupRoutes } from "./filter-groups.routes.js";
import * as service from "./filter-groups.service.js";

vi.mock("./filter-groups.service.js", () => {
  class FilterGroupNotFoundError extends Error {
    constructor() {
      super("Filter group not found");
    }
  }
  class FilterGroupNameConflictError extends Error {
    constructor() {
      super("Filter group name already exists");
    }
  }
  return {
    FilterGroupNotFoundError,
    FilterGroupNameConflictError,
    createFilterGroup: vi.fn(),
    deleteFilterGroup: vi.fn(),
    getFilterGroupLayout: vi.fn(),
    listFilterGroups: vi.fn(),
    reorderFilterGroups: vi.fn(),
    updateFilterGroup: vi.fn(),
  };
});

const group = {
  id: 1,
  name: "本季在追",
  sortOrder: 0,
  filterCount: 2,
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("filter group routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists, creates, renames, reorders, and deletes groups", async () => {
    const layout = {
      ungroupedPosition: 1,
    };
    vi.mocked(service.listFilterGroups).mockResolvedValue([group]);
    vi.mocked(service.getFilterGroupLayout).mockResolvedValue(layout);
    vi.mocked(service.createFilterGroup).mockResolvedValue(group);
    vi.mocked(service.updateFilterGroup).mockResolvedValue({ ...group, name: "长期更新" });
    vi.mocked(service.reorderFilterGroups).mockResolvedValue({ success: true });
    vi.mocked(service.deleteFilterGroup).mockResolvedValue({ success: true });
    const app = await createRouteTestApp((app) =>
      app.register(filterGroupRoutes, { prefix: "/api/filter-groups" }),
    );

    const listResponse = await app.inject({ method: "GET", url: "/api/filter-groups" });
    const layoutResponse = await app.inject({
      method: "GET",
      url: "/api/filter-groups/layout",
    });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/filter-groups",
      payload: { name: " 本季在追 " },
    });
    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/api/filter-groups/1",
      payload: { name: "长期更新" },
    });
    const orderResponse = await app.inject({
      method: "PUT",
      url: "/api/filter-groups/order",
      payload: { ids: [1], ungroupedPosition: 0 },
    });
    const deleteResponse = await app.inject({ method: "DELETE", url: "/api/filter-groups/1" });
    await app.close();

    expect(parseJson(listResponse.payload)).toEqual([group]);
    expect(parseJson(layoutResponse.payload)).toEqual(layout);
    expect(createResponse.statusCode, createResponse.payload).toBe(200);
    expect(updateResponse.statusCode, updateResponse.payload).toBe(200);
    expect(orderResponse.statusCode, orderResponse.payload).toBe(200);
    expect(deleteResponse.statusCode, deleteResponse.payload).toBe(200);
    expect(service.createFilterGroup).toHaveBeenCalledWith({ name: "本季在追" });
    expect(service.updateFilterGroup).toHaveBeenCalledWith(1, { name: "长期更新" });
    expect(service.reorderFilterGroups).toHaveBeenCalledWith({
      ids: [1],
      ungroupedPosition: 0,
    });
  });

  it("maps duplicate names to conflict responses", async () => {
    vi.mocked(service.createFilterGroup).mockRejectedValue(
      new service.FilterGroupNameConflictError(),
    );
    const app = await createRouteTestApp((app) =>
      app.register(filterGroupRoutes, { prefix: "/api/filter-groups" }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/filter-groups",
      payload: { name: "本季在追" },
    });
    await app.close();
    expect(response.statusCode).toBe(409);
  });
});
