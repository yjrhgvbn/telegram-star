import { LoaderCircle } from "lucide-react";
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
    <Card className="border border-border/70 bg-card/70" size="sm">
      <CardHeader className="pt-2 pb-2">
        <CardTitle>历史预览与回拉</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">每个会话扫描深度（条数）</label>
          <Input
            value={previewLimit}
            onChange={(event) => onPreviewLimitChange(event.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button type="button" size="sm" onClick={onPreview} disabled={previewLoading}>
            {previewLoading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              "预览历史消息"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackfill}
            disabled={backfillLoading || !selectedFilter}
          >
            {backfillLoading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              "主动拉取并过滤"
            )}
          </Button>
        </div>

        {previewSummary && (
          <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
            已扫描 {previewSummary.scannedChats} 个会话，预览到 {previewSummary.total} 条命中消息。
          </div>
        )}

        {backfillSummary && (
          <div className="rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">
            {backfillSummary}
          </div>
        )}

        <div className="space-y-2.5">
          {previewMessages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
              暂无预览结果
            </div>
          ) : (
            previewMessages.map((message) => (
              <div
                key={`${message.chatId}-${message.id}`}
                className="rounded-xl border border-border/70 bg-background/65 p-2.5"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{message.chatTitle}</span>
                  <span>·</span>
                  <span>{message.senderName || "Unknown"}</span>
                  {message.matchedKeyword && (
                    <Badge variant="secondary">命中 {message.matchedKeyword}</Badge>
                  )}
                  <Badge
                    variant={message.inDatabase ? "secondary" : "outline"}
                    className="ml-auto"
                  >
                    {message.inDatabase ? "已入库" : "未入库"}
                  </Badge>
                </div>
                <p className="text-sm leading-5 text-foreground/95">{message.content}</p>
                {message.telegramLink && (
                  <a
                    href={message.telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-xs text-primary underline-offset-4 hover:underline"
                  >
                    打开原消息
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
