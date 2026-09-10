import { memo, useDeferredValue, useEffect, useMemo, useState, type ReactNode, type UIEvent } from "react";
import { ExternalLink, Inbox, LoaderCircle } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  FilterMatchEvidence,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
} from "@/types";
import {
  findPreviewHighlightRanges,
  getPreviewExclusionHighlightTexts,
  getPreviewHighlightTexts,
  type PreviewHighlightRange,
} from "../previewHighlight";
import "./PreviewPanel.css";

interface PreviewSummary {
  scannedChats: number;
  total: number;
}

interface PreviewPanelProps {
  previewEnabled: boolean;
  previewLoading: boolean;
  previewStale: boolean;
  previewError: string;
  previewMessages: HistoricalFilterPreviewMessage[];
  previewSamples?: HistoricalFilterPreviewSample[];
  previewSummary: PreviewSummary | null;
  previewLimit: string;
  onPreviewLimitChange: (value: string) => void;
  onLocateCondition?: (groupId: string) => void;
  className?: string;
}

const PAGE_SIZE = 20;
const EMPTY_SAMPLES: HistoricalFilterPreviewSample[] = [];
const scopeOptions = [
  { value: "50", label: "每会话最近 50 条" },
  { value: "200", label: "每会话最近 200 条" },
  { value: "500", label: "每会话最近 500 条" },
  { value: "1000", label: "每会话最近 1,000 条" },
];
const evidenceTypeLabels: Record<FilterMatchEvidence["type"], string> = {
  keyword: "关键词",
  sender: "发送者用户 ID",
  chat: "消息来源",
  regex: "正则",
  script: "脚本",
};

/** Keep Telegram line breaks while mapping the normalized match evidence back to display offsets. */
function getContentHighlightRanges(content: string, texts: string[]): PreviewHighlightRange[] {
  const offsets: PreviewHighlightRange[] = [];
  let normalized = "";

  for (const match of content.matchAll(/\s+|\S/g)) {
    const start = match.index;
    normalized += /^\s/.test(match[0]) ? " " : match[0];
    offsets.push({ start, end: start + match[0].length });
  }

  return findPreviewHighlightRanges(normalized, texts).map((range) => ({
    start: offsets[range.start].start,
    end: offsets[range.end - 1].end,
  }));
}

function renderHighlightedContent(content: string, ranges: PreviewHighlightRange[]): ReactNode {
  if (ranges.length === 0) return content;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) nodes.push(content.slice(cursor, range.start));
    nodes.push(<mark key={`${range.start}-${range.end}`}>{content.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  }

  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes;
}

function formatMessageDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelevantEvidence(message: HistoricalFilterPreviewMessage, excluded: boolean) {
  return (message.matchEvidence ?? []).filter((evidence) => {
    if (!excluded) return evidence.effect === "require" && evidence.passed && evidence.groupPassed !== false;
    // A failed OR sibling does not reject a message when another member passed its group.
    return !evidence.passed && (evidence.effect === "exclude" || evidence.groupPassed !== true);
  });
}

function getEvidenceLabel(evidence: FilterMatchEvidence, chatTitle: string): string {
  const type = evidenceTypeLabels[evidence.type];
  if (!evidence.passed && evidence.effect === "require") return `未满足${type}`;
  const prefix = evidence.effect === "exclude" ? `排除${type}` : type;
  // Script source is not a useful evidence label; only show the actual returned match text.
  const values = evidence.type === "chat" ? [chatTitle] : evidence.type === "script" ? evidence.matchedTexts : evidence.matchedValues;
  return values.length > 0 ? `${prefix} · ${values.join(" / ")}` : `${prefix}${evidence.effect === "exclude" ? "命中" : "通过"}`;
}

const PreviewMessageItem = memo(function PreviewMessageItem({
  message,
  excluded = false,
  onLocateCondition,
}: {
  message: HistoricalFilterPreviewMessage;
  excluded?: boolean;
  onLocateCondition?: (groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = message.content.replace(/\*\*/g, "").trim() || message.mediaFileName || "媒体消息";
  const highlightTexts = excluded
    ? getPreviewExclusionHighlightTexts(message)
    : getPreviewHighlightTexts(message);
  const highlightRanges = getContentHighlightRanges(content, highlightTexts);
  const messageDate = formatMessageDate(message.messageDate);
  const evidence = getRelevantEvidence(message, excluded);
  const canExpand = content.length > 280 || content.split("\n").length > 6;

  return (
    <article className="rule-preview-message" data-excluded={excluded || undefined}>
      <div className="rule-preview-message-meta">
        <span className="rule-preview-source">{message.chatTitle}</span>
        {messageDate ? <time dateTime={message.messageDate}>{messageDate}</time> : null}
        {message.telegramLink ? (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            role="link"
            className="rule-preview-open"
            render={<a href={message.telegramLink} target="_blank" rel="noreferrer" aria-label="打开 Telegram 原消息" />}
          >
            <ExternalLink />
          </Button>
        ) : null}
      </div>

      <p className="rule-preview-content" data-collapsed={canExpand && !expanded || undefined}>
        {renderHighlightedContent(content, highlightRanges)}
      </p>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rule-preview-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起原文" : "展开原文"}
        </Button>
      ) : null}

      <div className="rule-preview-evidence">
        {evidence.length > 0 ? evidence.map((item) => {
          const label = getEvidenceLabel(item, message.chatTitle);
          return item.groupId && onLocateCondition ? (
            <Button
              key={item.conditionIndex}
              type="button"
              variant="ghost"
              size="xs"
              className="rule-preview-evidence-link"
              title={`${label}；定位条件`}
              onClick={() => onLocateCondition(item.groupId!)}
            >
              <span>{label}</span>
            </Button>
          ) : (
            <Badge key={item.conditionIndex} variant="secondary" title={label}>{label}</Badge>
          );
        }) : (
          <Badge variant="secondary">
            {excluded ? "未通过当前规则" : message.matchedKeyword ? `关键词 · ${message.matchedKeyword}` : "符合当前规则"}
          </Badge>
        )}
      </div>
    </article>
  );
});

export function PreviewPanel({
  previewEnabled,
  previewLoading,
  previewStale,
  previewError,
  previewMessages,
  previewSamples = EMPTY_SAMPLES,
  previewSummary,
  previewLimit,
  onPreviewLimitChange,
  onLocateCondition,
  className,
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("matched");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredMessages = useDeferredValue(previewMessages);
  const deferredSamples = useDeferredValue(previewSamples);
  const excludedSamples = useMemo(() => deferredSamples.filter((sample) => !sample.matched), [deferredSamples]);
  const selectedScope = scopeOptions.find((option) => option.value === previewLimit) ?? scopeOptions[1];
  const activeMessages = activeTab === "excluded" ? excludedSamples : deferredMessages;
  const resultCount = previewSummary?.total ?? deferredMessages.length;
  const isStale = previewStale || deferredMessages !== previewMessages || deferredSamples !== previewSamples;
  const hasResults = previewSummary !== null || deferredMessages.length > 0 || deferredSamples.length > 0;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [previewLimit, previewMessages, previewSamples]);

  const loadMore = () => setVisibleCount((current) => Math.min(current + PAGE_SIZE, activeMessages.length));
  const handleResultScroll = (event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (remaining <= 240 && visibleCount < activeMessages.length) loadMore();
  };

  let emptyTitle = activeTab === "excluded" ? "当前范围内没有排除样本" : "当前范围内没有匹配样本";
  if (!previewEnabled) emptyTitle = "填写条件后查看样本";
  else if (previewError && !hasResults) emptyTitle = "暂时无法完成预览";
  else if (previewLoading && !hasResults) emptyTitle = "正在匹配历史消息…";

  return (
    <section className={cn("rule-preview", className)} aria-label="消息样本预览" aria-busy={previewLoading}>
      <header className="rule-preview-header">
        <h2>预览样本</h2>
        <Select
          items={scopeOptions}
          value={previewLimit}
          onValueChange={(value) => { if (value) onPreviewLimitChange(value); }}
        >
          <SelectTrigger size="sm" className="rule-preview-scope" aria-label="预览扫描范围">
            <SelectValue>{selectedScope.label}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false} className="rules-theme">
            <SelectGroup>
              {scopeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </header>

      <Tabs
        className="rule-preview-tabs"
        value={activeTab}
        onValueChange={(value) => { setActiveTab(String(value)); setVisibleCount(PAGE_SIZE); }}
      >
        <div className="rule-preview-tabs-heading">
          <TabsList variant="line" aria-label="预览样本类型">
            <TabsTrigger value="matched">匹配样本 <span>{previewEnabled ? resultCount : 0}</span></TabsTrigger>
            <TabsTrigger value="excluded">排除样本 <span>{previewEnabled ? excludedSamples.length : 0}</span></TabsTrigger>
          </TabsList>
        </div>

        {previewEnabled && (previewError || previewLoading || isStale) ? (
          <div className="rule-preview-status" data-error={Boolean(previewError) || undefined} role={previewError ? "alert" : "status"}>
            {previewError ? (
              <>{hasResults ? "更新失败，显示上次结果。" : ""}{previewError}</>
            ) : (
              <><LoaderCircle className="rule-preview-spinner" />{hasResults ? "更新中，显示上次结果" : "正在预览…"}</>
            )}
          </div>
        ) : null}

        {["matched", "excluded"].map((tab) => (
          <TabsContent key={tab} value={tab} className="rule-preview-results" onScroll={handleResultScroll}>
            {!previewEnabled || !hasResults || activeMessages.length === 0 ? (
              <div className="rule-preview-empty">
                {previewLoading && !hasResults ? <LoaderCircle className="rule-preview-spinner" /> : <Inbox />}
                <p>{emptyTitle}</p>
              </div>
            ) : (
              <div className="rule-preview-messages" data-stale={isStale || undefined}>
                {activeMessages.slice(0, visibleCount).map((message) => (
                  <PreviewMessageItem
                    key={`${tab}-${message.chatId}-${message.id}`}
                    message={message}
                    excluded={tab === "excluded"}
                    onLocateCondition={!isStale && !previewLoading && !previewError ? onLocateCondition : undefined}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {previewEnabled && hasResults ? (
        <footer className="rule-preview-footer">
          <span>已显示 {Math.min(visibleCount, activeMessages.length)} / {activeMessages.length} 条</span>
          {visibleCount < activeMessages.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={loadMore}>加载更多</Button>
          ) : previewSummary ? <span>扫描 {previewSummary.scannedChats} 个会话</span> : null}
        </footer>
      ) : null}
    </section>
  );
}
