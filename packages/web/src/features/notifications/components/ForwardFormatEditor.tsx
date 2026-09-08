import { useId, useLayoutEffect, useRef, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_FORMAT_PRESETS,
  FORWARD_TEMPLATE_SAMPLE_PAYLOAD,
  FORWARD_TEMPLATE_VARIABLES,
  renderForwardTemplate,
  type ForwardFormatPreset,
  type ForwardTemplateVariable,
} from "@telegram-star/shared/contracts/forward-targets";
import "./ForwardFormatEditor.css";

const VARIABLE_LABELS: Record<ForwardTemplateVariable, string> = {
  filterName: "规则名称",
  matchedKeyword: "命中关键词",
  chatTitle: "消息来源",
  senderName: "发送者",
  senderId: "发送者 ID",
  messageDate: "消息时间",
  content: "消息正文",
  telegramLink: "原消息链接",
};

const PRESET_LABELS: Record<ForwardFormatPreset["id"], string> = {
  compact: "简洁",
  detailed: "详细",
  markdown: "Markdown",
};

type TemplateField = "title" | "body";
type TextControl = HTMLInputElement | HTMLTextAreaElement;

interface ForwardFormatEditorProps {
  titleTemplate: string;
  bodyTemplate: string;
  onTitleTemplateChange: (value: string) => void;
  onBodyTemplateChange: (value: string) => void;
  onApplyPreset: (preset: ForwardFormatPreset) => void;
  disabled?: boolean;
}

export function ForwardFormatEditor({
  titleTemplate,
  bodyTemplate,
  onTitleTemplateChange,
  onBodyTemplateChange,
  onApplyPreset,
  disabled = false,
}: ForwardFormatEditorProps) {
  const id = useId();
  const [pane, setPane] = useState("editor");
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<TemplateField>("body");
  const selection = useRef<{ field: TemplateField; start: number; end: number } | null>(null);
  const pendingCaret = useRef<{ field: TemplateField; offset: number } | null>(null);

  // Match the server's trim/default behavior so an empty field previews what will be sent.
  const effectiveTitle = titleTemplate.trim() || DEFAULT_FORWARD_TITLE_TEMPLATE;
  const effectiveBody = bodyTemplate.trim() || DEFAULT_FORWARD_BODY_TEMPLATE;
  const preset = FORWARD_FORMAT_PRESETS.find(
    (candidate) =>
      candidate.titleTemplate === effectiveTitle && candidate.bodyTemplate === effectiveBody,
  );
  const previewTitle = renderForwardTemplate(effectiveTitle, FORWARD_TEMPLATE_SAMPLE_PAYLOAD);
  const previewBody = renderForwardTemplate(effectiveBody, FORWARD_TEMPLATE_SAMPLE_PAYLOAD);

  useLayoutEffect(() => {
    const next = pendingCaret.current;
    if (!next) return;
    pendingCaret.current = null;
    const control = next.field === "title" ? titleRef.current : bodyRef.current;
    control?.focus({ preventScroll: true });
    control?.setSelectionRange(next.offset, next.offset);
  }, [titleTemplate, bodyTemplate]);

  function rememberSelection(field: TemplateField, control: TextControl) {
    activeField.current = field;
    selection.current = {
      field,
      start: control.selectionStart ?? control.value.length,
      end: control.selectionEnd ?? control.value.length,
    };
  }

  function insertVariable(variable: ForwardTemplateVariable) {
    const field = activeField.current;
    const value = field === "title" ? titleTemplate : bodyTemplate;
    const range = selection.current?.field === field ? selection.current : null;
    const start = Math.min(range?.start ?? value.length, value.length);
    const end = Math.min(range?.end ?? value.length, value.length);
    const token = `{{${variable}}}`;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;

    // Keep both mouse and keyboard insertion in the last edited field, replacing its selection.
    pendingCaret.current = { field, offset: start + token.length };
    selection.current = { field, start: start + token.length, end: start + token.length };
    if (field === "title") onTitleTemplateChange(next);
    else onBodyTemplateChange(next);
  }

  return (
    <div className="forward-format-workspace">
      <div className="forward-format-layout" data-pane={pane}>
        <ToggleGroup
          className="forward-format-pane-switch"
          aria-label="消息格式视图"
          value={[pane]}
          onValueChange={(values) => {
            if (values[0]) setPane(values[0]);
          }}
        >
          <Toggle value="editor" aria-controls={`${id}-editor`}>编辑模板</Toggle>
          <Toggle value="preview" aria-controls={`${id}-preview`}>示例预览</Toggle>
        </ToggleGroup>

        <section id={`${id}-editor`} className="forward-format-editor" aria-label="编辑模板">
          <div className="forward-format-preset-row">
            <ToggleGroup
              className="forward-format-presets"
              aria-label="消息格式预设"
              value={preset ? [preset.id] : []}
              disabled={disabled}
              onValueChange={(values) => {
                const next = FORWARD_FORMAT_PRESETS.find((item) => item.id === values[0]);
                if (next) onApplyPreset(next);
              }}
            >
              {FORWARD_FORMAT_PRESETS.map((item) => (
                <Toggle key={item.id} value={item.id}>
                  {PRESET_LABELS[item.id]}
                </Toggle>
              ))}
            </ToggleGroup>
            {!preset ? <span className="forward-format-custom">自定义</span> : null}
          </div>

          <label className="forward-format-field" htmlFor={`${id}-title`}>
            <span>标题模板</span>
            <Input
              ref={titleRef}
              id={`${id}-title`}
              value={titleTemplate}
              placeholder={DEFAULT_FORWARD_TITLE_TEMPLATE}
              disabled={disabled}
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onTitleTemplateChange(event.target.value)}
              onFocus={(event) => rememberSelection("title", event.currentTarget)}
              onSelect={(event) => rememberSelection("title", event.currentTarget)}
              onBlur={(event) => rememberSelection("title", event.currentTarget)}
            />
          </label>

          <label className="forward-format-field" htmlFor={`${id}-body`}>
            <span>正文模板</span>
            <Textarea
              ref={bodyRef}
              id={`${id}-body`}
              value={bodyTemplate}
              placeholder={DEFAULT_FORWARD_BODY_TEMPLATE}
              disabled={disabled}
              maxLength={4000}
              spellCheck={false}
              onChange={(event) => onBodyTemplateChange(event.target.value)}
              onFocus={(event) => rememberSelection("body", event.currentTarget)}
              onSelect={(event) => rememberSelection("body", event.currentTarget)}
              onBlur={(event) => rememberSelection("body", event.currentTarget)}
            />
          </label>

          <section className="forward-format-variables" aria-labelledby={`${id}-variables`}>
            <h3 id={`${id}-variables`}>插入变量</h3>
            <div>
              {FORWARD_TEMPLATE_VARIABLES.map((variable) => (
                <Button
                  key={variable}
                  type="button"
                  variant="secondary"
                  title={`{{${variable}}}`}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertVariable(variable)}
                >
                  {VARIABLE_LABELS[variable]}
                </Button>
              ))}
            </div>
          </section>
        </section>

        <section id={`${id}-preview`} className="forward-format-preview" aria-label="示例预览">
          <h3>示例预览</h3>
          <div className="forward-format-preview-content">
            <p className="forward-format-preview-label">标题</p>
            <p className="forward-format-preview-title">{previewTitle}</p>
            <p className="forward-format-preview-label">正文</p>
            <p className="forward-format-preview-body">{previewBody}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
