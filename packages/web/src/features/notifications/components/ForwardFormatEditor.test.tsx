// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_FORMAT_PRESETS,
  FORWARD_TEMPLATE_SAMPLE_PAYLOAD,
  renderForwardTemplate,
} from "@telegram-star/shared/contracts/forward-targets";
import { ForwardFormatEditor } from "./ForwardFormatEditor";

function Harness({
  initialTitle = DEFAULT_FORWARD_TITLE_TEMPLATE,
  initialBody = DEFAULT_FORWARD_BODY_TEMPLATE,
  disabled = false,
}: {
  initialTitle?: string;
  initialBody?: string;
  disabled?: boolean;
}) {
  const [titleTemplate, setTitleTemplate] = useState(initialTitle);
  const [bodyTemplate, setBodyTemplate] = useState(initialBody);
  return (
    <ForwardFormatEditor
      titleTemplate={titleTemplate}
      bodyTemplate={bodyTemplate}
      onTitleTemplateChange={setTitleTemplate}
      onBodyTemplateChange={setBodyTemplate}
      onApplyPreset={(preset) => {
        setTitleTemplate(preset.titleTemplate);
        setBodyTemplate(preset.bodyTemplate);
      }}
      disabled={disabled}
    />
  );
}

describe("ForwardFormatEditor", () => {
  afterEach(cleanup);

  it("applies each preset directly and previews the shared fixed sample", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    for (const [index, name] of ["简洁", "详细", "Markdown"].entries()) {
      await user.click(screen.getByRole("button", { name, exact: true }));
      const preset = FORWARD_FORMAT_PRESETS[index];
      expect((screen.getByLabelText("标题模板") as HTMLInputElement).value).toBe(preset.titleTemplate);
      expect((screen.getByLabelText("正文模板") as HTMLTextAreaElement).value).toBe(preset.bodyTemplate);
      expect(screen.getByRole("button", { name, exact: true }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByText(renderForwardTemplate(preset.titleTemplate, FORWARD_TEMPLATE_SAMPLE_PAYLOAD))).toBeTruthy();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("格式预设")).toBeNull();

    await user.type(screen.getByLabelText("标题模板"), " 自定义后缀");
    expect(screen.getByText("自定义")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Markdown", exact: true }).getAttribute("aria-pressed")).toBe("false");
  });

  it("replaces a title selection and leaves the caret ready for continued insertion", async () => {
    const user = userEvent.setup();
    render(<Harness initialTitle="收到 示例 消息" initialBody="保留正文" />);
    const title = screen.getByLabelText("标题模板") as HTMLInputElement;
    await user.click(title);
    title.setSelectionRange(3, 5);
    fireEvent.select(title);

    await user.click(screen.getByRole("button", { name: "规则名称", exact: true }));
    expect(title.value).toBe("收到 {{filterName}} 消息");
    expect((screen.getByLabelText("正文模板") as HTMLTextAreaElement).value).toBe("保留正文");
    expect(document.activeElement).toBe(title);
    expect(title.selectionStart).toBe(17);
    expect(title.selectionEnd).toBe(17);

    await user.click(screen.getByRole("button", { name: "消息来源", exact: true }));
    expect(title.value).toBe("收到 {{filterName}}{{chatTitle}} 消息");
  });

  it("keeps the last body selection when a variable is activated by keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness initialTitle="保留标题" initialBody="开头 待替换 结尾" />);
    const body = screen.getByLabelText("正文模板") as HTMLTextAreaElement;
    await user.click(body);
    body.setSelectionRange(3, 6);
    fireEvent.select(body);
    const variable = screen.getByRole("button", { name: "原消息链接", exact: true });
    variable.focus();
    await user.keyboard("{Enter}");

    expect(body.value).toBe("开头 {{telegramLink}} 结尾");
    expect((screen.getByLabelText("标题模板") as HTMLInputElement).value).toBe("保留标题");
    expect(document.activeElement).toBe(body);
    expect(body.selectionStart).toBe(body.value.indexOf(" 结尾"));
  });

  it("uses default templates for blank fields without mutating the draft", () => {
    render(<Harness initialTitle="  " initialBody={"\n "} disabled />);
    expect(screen.getByRole("button", { name: "详细", exact: true }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(renderForwardTemplate(DEFAULT_FORWARD_TITLE_TEMPLATE, FORWARD_TEMPLATE_SAMPLE_PAYLOAD))).toBeTruthy();
    expect((screen.getByLabelText("标题模板") as HTMLInputElement).value).toBe("  ");
    expect((screen.getByLabelText("正文模板") as HTMLTextAreaElement).value).toBe("\n ");
    expect((screen.getByLabelText("标题模板") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "规则名称", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "简洁", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  });
});
