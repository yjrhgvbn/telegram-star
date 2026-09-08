// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { saveServerUrl } from "@/shared/runtime/serverConfig";
import { MessageSourceAvatar } from "./MessageSourceAvatar";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("MessageSourceAvatar", () => {
  it("keeps a fixed fallback until the source photo loads", () => {
    const { container } = render(<MessageSourceAvatar messageId={12} source="消息频道" />);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/api/messages/12/avatar");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.classList.contains("is-loaded")).toBe(false);
    expect(container.textContent).toBe("消息");
    fireEvent.load(image);
    expect(image.classList.contains("is-loaded")).toBe(true);
  });

  it("falls back after a failed photo without suppressing another message or server", () => {
    const { container, rerender } = render(<MessageSourceAvatar messageId={12} source="频道" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("频道");
    rerender(<MessageSourceAvatar messageId={13} source="群组" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/messages/13/avatar");
    fireEvent.error(container.querySelector("img")!);
    saveServerUrl("https://another.example");
    rerender(<MessageSourceAvatar messageId={13} source="群组" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://another.example/api/messages/13/avatar");
  });
});
