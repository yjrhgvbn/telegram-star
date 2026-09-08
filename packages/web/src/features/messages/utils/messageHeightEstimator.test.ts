import { describe, expect, it } from "vitest";
import { estimateMessageItemHeight, getMessageListEstimateWidth, type MessageHeightEstimateInput } from "./messageHeightEstimator";

const createMessage = (overrides: Partial<MessageHeightEstimateInput> = {}): MessageHeightEstimateInput => ({content: "", mediaType: null, mediaExtra: null, ...overrides});
const desktop = {viewportWidth: 1440, containerWidth: 980, measureLineCount: () => 1};

describe("estimateMessageItemHeight", () => {
  it("accounts for 24px hard text lines and a separate sender line", () => {
    const base = estimateMessageItemHeight(createMessage(), desktop);
    expect(estimateMessageItemHeight(createMessage({content: "a\n\nb"}), desktop) - base).toBe(72);
    expect(estimateMessageItemHeight(createMessage({chatTitle: "频道", senderName: "发送者"}), desktop) - base).toBe(20);
  });
  it("uses the taller text or media block in a wide message, not their sum", () => {
    const options = {...desktop, measureLineCount: () => 10};
    const text = createMessage({content: "正文"});
    const media = createMessage({content: "正文", mediaType: "video", mediaExtra: '{"w":16,"h":9}'});
    expect(estimateMessageItemHeight(media, options)).toBe(estimateMessageItemHeight(text, options));
  });
  it("stacks text and media on small screens", () => {
    const options = {viewportWidth: 390, containerWidth: 390, measureLineCount: () => 1};
    const video = createMessage({mediaType: "video", mediaExtra: '{"w":16,"h":9}'});
    expect(estimateMessageItemHeight({...video, content: "消息"}, options) - estimateMessageItemHeight(video, options)).toBe(24 + 12);
  });
  it("caps very tall visual attachments and reserves their real filename and size", () => {
    const base = estimateMessageItemHeight(createMessage(), desktop);
    const video = createMessage({mediaType: "video", mediaExtra: '{"w":10,"h":100}'});
    expect(estimateMessageItemHeight(video, desktop) - base).toBe(280);
    expect(estimateMessageItemHeight({...video, mediaFileName: "第09集.mp4", mediaFileSize: 123456}, desktop) - estimateMessageItemHeight(video, desktop)).toBe(46);
  });
  it.each(["null", "[]", '"bad"', '{"w":0,"h":10}', "{bad-json"])("handles invalid metadata %s without a non-finite estimate", mediaExtra => {
    const base = estimateMessageItemHeight(createMessage(), desktop);
    expect(estimateMessageItemHeight(createMessage({mediaType: "photo", mediaExtra}), desktop) - base).toBe(240);
  });
  it("measures only the rendered prefix and includes the expand button", () => {
    const lines: string[] = [];
    const base = estimateMessageItemHeight(createMessage(), desktop);
    const height = estimateMessageItemHeight(createMessage({content: Array.from({length: 20}, (_, i) => `消息${i}`).join("\n")}), {...desktop, measureLineCount: line => {lines.push(line);return 1;}});
    expect(lines).toHaveLength(8);
    expect(lines.join("\n")).not.toContain("消息19");
    expect(height - base).toBe(8 * 24 + 40);
  });
  it.each([
    [639, 500, 434], [680, 680, 608], [681, 500, 420],
    [900, 650, 570], [901, 650, 558], [1440, 1400, 800],
  ])("limits text within the actual row at viewport %i and container %i", (viewportWidth, containerWidth, expectedWidth) => {
    let width = 0;
    estimateMessageItemHeight(createMessage({content: "text"}), {viewportWidth, containerWidth, measureLineCount: (_text, available) => {width = available; return 1;}});
    expect(width).toBe(expectedWidth);
  });
  it("retains the full list width while rejecting unusable measurements", () => {
    expect(getMessageListEstimateWidth(1800)).toBe(1800);
    expect(getMessageListEstimateWidth(390)).toBe(390);
    for (const invalid of [undefined, NaN, Infinity, 0, -1]) expect(getMessageListEstimateWidth(invalid)).toBe(400);
  });
  it.each([
    [748, 280, 344], [1248, 336, 788], [1448, 360, 800], [2000, 360, 800],
  ])("sizes parallel media and bounded text at container width %i", (containerWidth, mediaWidth, expectedTextWidth) => {
    let textWidth = 0;
    const options = {...desktop, containerWidth, measureLineCount: (_text: string, width: number) => {textWidth = width; return 1;}};
    const base = estimateMessageItemHeight(createMessage(), options);
    const result = estimateMessageItemHeight(createMessage({content: "原文", mediaType: "video", mediaExtra: '{"w":16,"h":9}'}), options);
    expect(textWidth).toBe(expectedTextWidth);
    expect(result - base).toBeCloseTo(mediaWidth * 9 / 16);
  });
  it("stacks just below the 700px article breakpoint and uses parallel media at the breakpoint", () => {
    const video = createMessage({content: "原文", mediaType: "video", mediaExtra: '{"w":16,"h":9}'});
    const stacked = {...desktop, containerWidth: 747};
    const parallel = {...desktop, containerWidth: 748};
    expect(estimateMessageItemHeight(video, stacked) - estimateMessageItemHeight(createMessage(), stacked)).toBe(24 + 12 + 420 * 9 / 16);
    expect(estimateMessageItemHeight(video, parallel) - estimateMessageItemHeight(createMessage(), parallel)).toBe(280 * 9 / 16);
  });
  it.each([[315, 48], [316, 0]])("reserves a second action line only when two buttons cannot fit at width %i", (containerWidth, expectedExtra) => {
    const options = {...desktop, viewportWidth: 390, containerWidth};
    const base = estimateMessageItemHeight(createMessage(), options);
    expect(estimateMessageItemHeight(createMessage({telegramLink: "https://t.me/example/1"}), options) - base).toBe(expectedExtra);
  });
  it("reserves an attachment row for unknown Telegram media types", () => {
    const base = estimateMessageItemHeight(createMessage(), desktop);
    expect(estimateMessageItemHeight(createMessage({mediaType: "future-type"}), desktop) - base).toBe(64);
  });
});
