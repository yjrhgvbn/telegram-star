import { describe, expect, it } from "vitest";
import {
  forwardTargetCreateInputSchema,
  forwardTargetListSchema,
  forwardTargetTestInputSchema,
} from "./forward-targets";

describe("forward targets contract", () => {
  it("accepts a persisted forward target response", () => {
    const targets = forwardTargetListSchema.parse([
      {
        id: 1,
        name: "Feishu on-call",
        appriseUrl: "feishu://token",
        enabled: true,
        filterIds: [1, 2],
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(targets[0]?.filterIds).toEqual([1, 2]);
  });

  it("rejects empty target names and apprise urls", () => {
    expect(() =>
      forwardTargetCreateInputSchema.parse({
        name: " ",
        appriseUrl: "feishu://token",
        enabled: true,
        filterIds: [],
      }),
    ).toThrow();

    expect(() =>
      forwardTargetCreateInputSchema.parse({
        name: "Feishu",
        appriseUrl: " ",
        enabled: true,
        filterIds: [],
      }),
    ).toThrow();
  });

  it("validates test notification input", () => {
    expect(forwardTargetTestInputSchema.parse({ appriseUrl: "discord://id/token" })).toEqual({
      appriseUrl: "discord://id/token",
    });

    expect(() => forwardTargetTestInputSchema.parse({ appriseUrl: "" })).toThrow();
  });
});
