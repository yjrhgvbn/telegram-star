import type { ReactNode } from "react";
import {
  Check,
  Database,
  ExternalLink,
  FlaskConical,
  Inbox,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  Filter,
  HistoricalFilterPreviewSample,
  JoinedChat,
} from "@/types";
import type { DraftCondition } from "../types";
import {
  evaluatePreviewMessage,
  mergePersistableConditions,
  normalizeConditions,
} from "../utils";

interface PreviewSummary {
  scannedChats: number;
  total: number;
}

interface PreviewPanelProps {
  selectedFilter: Filter | null;
  conditions: DraftCondition[];
  chats: JoinedChat[];
  draftDirty: boolean;
  previewStale: boolean;
  previewLoading: boolean;
  backfillLoading: boolean;
  previewSamples: HistoricalFilterPreviewSample[];
  previewSummary: PreviewSummary | null;
  backfillSummary: string;
  previewLimit: string;
  onPreviewLimitChange: (value: string) => void;
  onPreview: () => void;
  onBackfill: () => void;
  className?: string;
}

const scopeOptions = [
  { value: "50", label: "每个会话最近 50 条" },
  { value: "200", label: "每个会话最近 200 条" },
  { value: "500", label: "每个会话最近 500 条" },
];

function cleanPreviewContent(content: string): string {
  return content
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderHighlightedContent(
  content: string,
  matchedKeyword: string | null,
): ReactNode {
  if (!matchedKeyword) return content;

  const start = content.toLocaleLowerCase().indexOf(matchedKeyword.toLocaleLowerCase());
  if (start < 0) return content;

  const end = start + matchedKeyword.length;
  return (
    <>
      {content.slice(0, start)}
      <mark>{content.slice(start, end)}</mark>
      {content.slice(end)}
    </>
  );
}

export function PreviewPanel({
  selectedFilter,
  conditions,
  chats,
  draftDirty,
  previewStale,
  previewLoading,
  backfillLoading,
  previewSamples,
  previewSummary,
  backfillSummary,
  previewLimit,
  onPreviewLimitChange,
  onPreview,
  onBackfill,
  className,
}: PreviewPanelProps) {
  const persistedConditions = mergePersistableConditions(normalizeConditions(conditions));
  const unmatchedSampleCount = previewSamples.filter((sample) => !sample.matched).length;
  const selectedScope =
    scopeOptions.find((option) => option.value === previewLimit) ?? scopeOptions[1];

  return (
    <section
      id="test-workbench"
      className={cn("flex-col overflow-hidden bg-card/86 xl:min-h-0", className)}
    >
      <header className="flex min-h-[62px] shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">测试工作台</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            使用当前未保存条件
          </p>
        </div>
        <span className="pt-0.5 text-[10px] text-muted-foreground">
          {draftDirty ? "草稿待验证" : selectedFilter ? "已保存" : "新草稿"}
        </span>
      </header>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border bg-muted/88 p-2.5">
        <Select
          value={previewLimit}
          onValueChange={(value) => {
            if (value) onPreviewLimitChange(value);
          }}
        >
          <SelectTrigger size="sm" className="w-full bg-card" aria-label="测试范围">
            <SelectValue>{selectedScope.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {scopeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          onClick={onPreview}
          disabled={previewLoading}
        >
          {previewLoading ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" />
          ) : previewStale ? (
            <RotateCcw data-icon="inline-start" />
          ) : (
            <FlaskConical data-icon="inline-start" />
          )}
          {previewLoading ? "测试中" : previewStale ? "重新测试" : "运行测试"}
        </Button>
      </div>

      <div
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5"
      >
        {previewStale ? (
          <div className="rounded-lg bg-warning/16 px-2.5 py-2 text-[11px] leading-4 text-warning-foreground">
            条件已修改，下方是旧结果。运行测试后更新。
          </div>
        ) : null}

        {previewSummary ? (
          <div className="flex items-center justify-between gap-3 px-0.5 text-[11px] text-muted-foreground">
            <span>样本判断 · 扫描 {previewSummary.scannedChats} 个会话</span>
            <span>
              <strong className="text-primary">{previewSummary.total} 条命中</strong>
              {unmatchedSampleCount > 0 ? ` · ${unmatchedSampleCount} 条未命中样本` : null}
            </span>
          </div>
        ) : null}

        {previewSamples.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-input px-4 py-5 text-center">
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary">
              <Inbox className="size-4" />
            </span>
            <p className="mt-2 text-sm font-semibold">
              {previewSummary ? "当前范围内没有消息命中" : "先运行一次草稿测试"}
            </p>
            <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
              {previewSummary
                ? "可以放宽条件，或扩大扫描范围后再次测试。"
                : "这里会逐条解释消息为什么命中或未命中。"}
            </p>
          </div>
        ) : (
          previewSamples.map((message) => {
            const evidence = evaluatePreviewMessage(message, persistedConditions, chats);
            const messageDate = new Date(message.messageDate);

            return (
              <article
                key={`${message.chatId}-${message.id}`}
                className={cn(
                  "rounded-xl border bg-card px-2.5 py-2.5",
                  message.matched
                    ? "border-border"
                    : "border-destructive/24",
                )}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {message.chatTitle}
                    {!Number.isNaN(messageDate.getTime())
                      ? ` · ${messageDate.toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : null}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-md",
                      message.matched
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {message.matched ? "命中" : "未命中"}
                  </Badge>
                </div>

                <p className="mt-1.5 line-clamp-4 text-xs leading-5 text-foreground/88">
                  {renderHighlightedContent(
                    cleanPreviewContent(message.content),
                    message.matchedKeyword,
                  )}
                </p>

                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {evidence.map((item, index) => (
                    <div
                      key={`${item.type}-${index}`}
                      className="flex items-start gap-2 text-[10px] leading-4"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {item.label} · {item.detail}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 font-semibold",
                          item.matched ? "text-success" : "text-destructive",
                        )}
                      >
                        {item.matched ? <Check className="size-3" /> : <X className="size-3" />}
                        {item.matched ? "通过" : "未通过"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {message.inDatabase ? "已在消息列表" : "尚未入库"}
                  </span>
                  {message.telegramLink ? (
                    <a
                      href={message.telegramLink}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      原消息
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })
        )}

        <div className="mt-auto pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full border-dashed bg-card/62 text-xs shadow-none"
            onClick={onBackfill}
            disabled={backfillLoading || !selectedFilter || draftDirty}
          >
            {backfillLoading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Database data-icon="inline-start" />
            )}
            {!selectedFilter
              ? "保存后可回拉命中消息"
              : draftDirty
                ? "先保存，再回拉历史命中"
                : "保存后回拉命中的历史消息"}
          </Button>
          {backfillSummary ? (
            <p className="mt-2 rounded-lg bg-accent px-2.5 py-2 text-[11px] leading-4 text-accent-foreground">
              {backfillSummary}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
