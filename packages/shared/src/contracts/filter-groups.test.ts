import { describe, expect, it } from "vitest";
import {
  filterGroupCreateInputSchema,
  filterGroupLayoutSchema,
  filterGroupListSchema,
  filterGroupOrderInputSchema,
  filterManualOrderInputSchema,
  filterPlacementInputSchema,
} from "./filter-groups";

describe("filter groups contract", () => {
  it("accepts persisted groups and trims names", () => {
    expect(filterGroupCreateInputSchema.parse({ name: "  本季在追  " })).toEqual({
      name: "本季在追",
    });
    expect(
      filterGroupListSchema.parse([
        {
          id: 1,
          name: "本季在追",
          sortOrder: 0,
          filterCount: 2,
          createdAt: "2026-08-22T00:00:00.000Z",
          updatedAt: "2026-08-22T00:00:00.000Z",
        },
      ])[0]?.filterCount,
    ).toBe(2);
  });

  it("validates placement and complete ordering payloads", () => {
    expect(
      filterPlacementInputSchema.parse({ manualGroupId: null, targetIndex: 2 }),
    ).toEqual({ manualGroupId: null, targetIndex: 2 });
    expect(filterManualOrderInputSchema.parse({ manualGroupId: 1, filterIds: [3, 2] })).toEqual({
      manualGroupId: 1,
      filterIds: [3, 2],
    });
    expect(filterGroupOrderInputSchema.parse({ ids: [] })).toEqual({ ids: [] });
    expect(
      filterGroupOrderInputSchema.parse({ ids: [2, 1], ungroupedPosition: 1 }),
    ).toEqual({ ids: [2, 1], ungroupedPosition: 1 });
    expect(filterGroupLayoutSchema.parse({
      ungroupedPosition: 2,
    })).toEqual({
      ungroupedPosition: 2,
    });
    expect(() => filterGroupOrderInputSchema.parse({ ids: [1, 1] })).toThrow();
    expect(() => filterPlacementInputSchema.parse({ manualGroupId: 0 })).toThrow();
  });
});
