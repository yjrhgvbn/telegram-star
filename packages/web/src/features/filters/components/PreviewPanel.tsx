import { Database, ExternalLink, Eye, History, Inbox, LoaderCircle, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Filter, HistoricalFilterPreviewMessage } from "@/types";

interface PreviewSummary {
  scannedChats: number;
  total: number;
}

interface PreviewPanelProps {
  selectedFilter: Filter | null;
  previewLoading: boolean;
  backfillLoading: boolean;
  previewMessages: HistoricalFilterPreviewMessage[];
  previewSummary: PreviewSummary | null;
  backfillSummary: string;
  previewLimit: string;
  onPreviewLimitChange: (value: string) => void;
  onPreview: () => void;
  onBackfill: () => void;
}

export function PreviewPanel({
  selectedFilter,
  previewLoading,
  backfillLoading,
  previewMessages,
  previewSummary,
  backfillSummary,
  previewLimit,
  onPreviewLimitChange,
  onPreview,
  onBackfill,
}: PreviewPanelProps) {
  return (
    <Card className="bg-card/88" size="sm">
      <CardHeader className="border-b px-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">历史验证</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedFilter ? "可预览并回拉命中消息" : "保存后可执行历史回拉"}
            </div>
          </div>
          <Badge variant={selectedFilter ? "secondary" : "outline"}>
            <History data-icon="inline-start" />
            {selectedFilter ? "已保存" : "草稿"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-3">
        <div className="rounded-lg bg-muted/42 p-3">
          <label className="text-sm font-medium">扫描深度</label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={previewLimit}
              inputMode="numeric"
              onChange={(event) => onPreviewLimitChange(event.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 bg-card/78"
            />
            <Button type="button" className="w-22" onClick={onPreview} disabled={previewLoading}>
              {previewLoading ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : (
                <Eye data-icon="inline-start" />
              )}
              预览
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBackfill}
            disabled={backfillLoading || !selectedFilter}
          >
            {backfillLoading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Database data-icon="inline-start" />
            )}
            回拉命中消息
          </Button>
        </div>

        {(previewSummary || backfillSummary) && (
          <div className="flex flex-col gap-2">
            {previewSummary && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
                <SearchCheck className="size-4 text-primary" />
                <span>扫描 {previewSummary.scannedChats} 个会话</span>
                <Badge variant="secondary" className="rounded-md">
                  {previewSummary.total} 条命中
                </Badge>
              </div>
            )}

            {backfillSummary && (
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary ring-1 ring-primary/20">
                {backfillSummary}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">预览结果</div>
            <Badge variant="outline" className="rounded-md">
              {previewMessages.length}
            </Badge>
          </div>
          {previewMessages.length === 0 ? (
            <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              <Inbox className="mb-1.5 size-5 text-muted-foreground/70" />
              运行预览后显示命中结果
            </div>
          ) : (
            previewMessages.map((message) => (
              <article
                key={`${message.chatId}-${message.id}`}
                className="rounded-lg border border-border/72 bg-background/58 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{message.chatTitle}</span>
                  <span>{message.senderName || "Unknown"}</span>
                  {message.matchedKeyword && (
                    <Badge variant="secondary" className="rounded-md">
                      命中 {message.matchedKeyword}
                    </Badge>
                  )}
                  <Badge
                    variant={message.inDatabase ? "secondary" : "outline"}
                    className="ml-auto rounded-md"
                  >
                    {message.inDatabase ? "已入库" : "未入库"}
                  </Badge>
                </div>
                <p className="max-h-28 overflow-hidden text-sm leading-6 text-foreground/92">
                  {message.content}
                </p>
                {message.telegramLink && (
                  <a
                    href={message.telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    打开原消息
                  </a>
                )}
              </article>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
