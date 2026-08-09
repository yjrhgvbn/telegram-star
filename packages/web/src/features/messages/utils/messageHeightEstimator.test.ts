import { describe, expect, it } from "vitest";
import {
  estimateMessageItemHeight,
  type MessageHeightEstimateInput,
} from "./messageHeightEstimator";

function createMessage(overrides: Partial<MessageHeightEstimateInput> = {}): MessageHeightEstimateInput {
  return {
    content: "",
    mediaType: null,
    mediaExtra: null,
    ...overrides,
  };
}

describe("estimateMessageItemHeight", () => {
  it("uses the desktop base height when there is no content or media", () => {
    const height = estimateMessageItemHeight(createMessage(), {
      viewportWidth: 1024,
      containerWidth: 580,
    });

    expect(height).toBeCloseTo(122.66);
  });

  it("uses the mobile base and sticker height", () => {
    const height = estimateMessageItemHeight(createMessage({ mediaType: "sticker" }), {
      viewportWidth: 390,
      containerWidth: 390,
    });

    expect(height).toBeCloseTo(168.35 + 160 + 10);
  });

  it("estimates visual media with mediaExtra aspect ratio", () => {
    const height = estimateMessageItemHeight(
      createMessage({
        mediaType: "photo",
        mediaExtra: JSON.stringify({ w: 500, h: 300 }),
      }),
      {
        viewportWidth: 1024,
        containerWidth: 580,
      },
    );

    expect(height).toBeCloseTo(122.66 + ((580 - 56) * 300) / 500 + 10);
  });

  it("matches the rendered minimum height for very wide media", () => {
    const height = estimateMessageItemHeight(
      createMessage({
        mediaType: "photo",
        mediaExtra: JSON.stringify({ w: 2000, h: 100 }),
      }),
      {
        viewportWidth: 1024,
        containerWidth: 580,
      },
    );

    expect(height).toBeCloseTo(122.66 + 80 + 10);
  });

  it("falls back to default visual media height for invalid mediaExtra", () => {
    const height = estimateMessageItemHeight(
      createMessage({
        mediaType: "video",
        mediaExtra: "{bad-json",
      }),
      {
        viewportWidth: 1024,
        containerWidth: 580,
      },
    );

    expect(height).toBeCloseTo(122.66 + 240 + 10);
  });

  it("counts hard line breaks in message text", () => {
    const height = estimateMessageItemHeight(createMessage({ content: "a\n\nb" }), {
      viewportWidth: 1024,
      containerWidth: 580,
      measureLineCount: () => 1,
    });

    expect(height).toBeCloseTo(122.66 + 3 * 22 + 10);
  });

  it("caps desktop estimates at the rendered message-column width", () => {
    let measuredWidth = 0;

    estimateMessageItemHeight(createMessage({ content: "message" }), {
      viewportWidth: 1440,
      containerWidth: 1400,
      measureLineCount: (_paragraph, availableWidth) => {
        measuredWidth = availableWidth;
        return 1;
      },
    });

    expect(measuredWidth).toBe(980 - 56);
  });
});
