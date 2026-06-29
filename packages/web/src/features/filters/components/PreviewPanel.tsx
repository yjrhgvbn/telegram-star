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
    <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
      <CardHeader className="gap-3 px-4 pt-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">历史验证</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedFilter ? "可预览并回拉命中消息" : "保存后可执行历史回拉"}
            </div>
          </div>
          <Badge variant={selectedFilter ? "secondary" : "outline"} className="h-7 rounded-lg px-2.5">
            <History className="size-3.5" />
            {selectedFilter ? "已保存" : "草稿"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="rounded-lg bg-background/70 p-3 ring-1 ring-foreground/10">
          <label className="text-sm font-medium">扫描深度</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              value={previewLimit}
              inputMode="numeric"
              onChange={(event) => onPreviewLimitChange(event.target.value.replace(/[^0-9]/g, ""))}
              className="h-10 bg-card/75"
            />
            <Button type="button" size="lg" className="sm:w-28" onClick={onPreview} disabled={previewLoading}>
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
            size="lg"
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
          <div className="space-y-2">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">预览结果</div>
            <Badge variant="outline" className="rounded-md">
              {previewMessages.length}
            </Badge>
          </div>
          {previewMessages.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-lg bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
              <Inbox className="mb-2 size-6 text-muted-foreground/70" />
              暂无预览结果
            </div>
          ) : (
            previewMessages.map((message) => (
              <article
                key={`${message.chatId}-${message.id}`}
                className="rounded-lg bg-background/70 p-3 ring-1 ring-foreground/10"
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
