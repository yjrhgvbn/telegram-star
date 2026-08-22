import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repository from "./filter-groups.repository.js";
import {
  FilterGroupNameConflictError,
  FilterGroupOrderMismatchError,
  createFilterGroup,
  deleteFilterGroup,
  getFilterGroupLayout,
  listFilterGroups,
  reorderFilterGroups,
} from "./filter-groups.service.js";

vi.mock("./filter-groups.repository.js", () => ({
  createFilterGroupRow: vi.fn(),
  deleteFilterGroupAndReleaseFilters: vi.fn(),
  findFilterGroupById: vi.fn(),
  findFilterGroupLayoutPosition: vi.fn(),
  findFilterGroupByName: vi.fn(),
  findFilterGroupRows: vi.fn(),
  reorderFilterGroupRows: vi.fn(),
  updateFilterGroupRow: vi.fn(),
}));

function createRow(id: number, name = `group-${id}`) {
  return {
    id,
    name,
    sortOrder: id - 1,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    _count: { filters: id },
  };
}

describe("filter-groups.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps group counts for the API", async () => {
    vi.mocked(repository.findFilterGroupRows).mockResolvedValue([createRow(1, "本季在追")]);
    await expect(listFilterGroups()).resolves.toEqual([
      expect.objectContaining({ id: 1, name: "本季在追", filterCount: 1 }),
    ]);
  });

  it("loads the persisted system-item layout", async () => {
    const layout = {
      ungroupedPosition: 1,
    };
    vi.mocked(repository.findFilterGroupRows).mockResolvedValue([createRow(1), createRow(2)]);
    vi.mocked(repository.findFilterGroupLayoutPosition).mockResolvedValue(1);
    await expect(getFilterGroupLayout()).resolves.toEqual(layout);
    expect(repository.findFilterGroupLayoutPosition).toHaveBeenCalledWith(2);
  });

  it("rejects duplicate group names", async () => {
    vi.mocked(repository.findFilterGroupByName).mockResolvedValue(createRow(1));
    await expect(createFilterGroup({ name: "group-1" })).rejects.toBeInstanceOf(
      FilterGroupNameConflictError,
    );
    expect(repository.createFilterGroupRow).not.toHaveBeenCalled();
  });

  it("requires the complete group order", async () => {
    vi.mocked(repository.findFilterGroupRows).mockResolvedValue([createRow(1), createRow(2)]);
    await expect(reorderFilterGroups({ ids: [2] })).rejects.toBeInstanceOf(
      FilterGroupOrderMismatchError,
    );
    await expect(
      reorderFilterGroups({ ids: [2, 1], ungroupedPosition: 1 }),
    ).resolves.toEqual({ success: true });
    expect(repository.reorderFilterGroupRows).toHaveBeenCalledWith({
      ids: [2, 1],
      ungroupedPosition: 1,
    });
    await expect(
      reorderFilterGroups({ ids: [2, 1], ungroupedPosition: 3 }),
    ).rejects.toBeInstanceOf(FilterGroupOrderMismatchError);
  });

  it("deletes only the group after checking it exists", async () => {
    vi.mocked(repository.findFilterGroupById).mockResolvedValue(createRow(2));
    await expect(deleteFilterGroup(2)).resolves.toEqual({ success: true });
    expect(repository.deleteFilterGroupAndReleaseFilters).toHaveBeenCalledWith(2);
  });

});
