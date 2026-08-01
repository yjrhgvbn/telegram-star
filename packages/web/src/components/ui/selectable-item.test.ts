import { describe, expect, it } from "vitest";
import { selectableItemVariants } from "./selectable-item";

describe("selectableItemVariants", () => {
  it("uses one quiet surface for the current navigation item", () => {
    const className = selectableItemVariants({
      kind: "current",
      selected: true,
      surface: "responsive",
    });

    expect(className).toContain("selectable-item");
    expect(className).toContain("bg-accent");
    expect(className).toContain("border-transparent");
    expect(className).toContain("shadow-none");
    expect(className).not.toContain("inset_3px");
    expect(className).not.toContain("ring-3");
  });

  it("keeps keyboard focus as a one-pixel inset treatment", () => {
    const className = selectableItemVariants({
      kind: "choice",
      selected: false,
      surface: "flat",
    });

    expect(className).toContain("focus-visible:shadow-[inset_0_0_0_1px");
    expect(className).not.toContain("focus-within:ring");
  });
});
