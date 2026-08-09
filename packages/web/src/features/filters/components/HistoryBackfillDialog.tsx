import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertCircle,
  CheckCircle2,
  History,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FilterBackfillJob, FilterBackfillJobCreateInput } from "@/types";

type TimePreset = "three-months" | "one-year" | "custom" | "all";
type CountPreset = "1000" | "5000" | "10000" | "custom";

interface HistoryBackfillDialogProps {
  selectedChatCount: number;
  latestJob: FilterBackfillJob | null;
  starting: boolean;
  disabled?: boolean;
  onStart: (input: FilterBackfillJobCreateInput) => Promise<void>;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const shifted = new Date(year, month - 1 + months, 1, 12);
  const lastDayOfTargetMonth = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0,
    12,
  ).getDate();
  shifted.setDate(Math.min(day, lastDayOfTargetMonth));
  return toDateInputValue(shifted);
}

function toLocalDayIso(dateValue: string, endOfDay: boolean): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  return date.toISOString();
}

function RadioOption({
  name,
  checked,
  label,
  description,
  recommended,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  description?: string;
  recommended?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-2">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only focus:outline-none focus-visible:outline-none"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-input bg-background transition-colors after:size-2.5 after:rounded-full after:bg-primary after:opacity-0 after:content-[''] peer-checked:border-primary peer-checked:after:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium sm:text-base">
          {label}
          {recommended ? (
            <Badge
              variant="outline"
              className="border-primary/25 bg-accent/55 text-[11px] text-primary"
            >
              推荐
            </Badge>
          ) : null}
        </span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-muted-foreground sm:text-sm">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function BackfillProgress({ job }: { job: FilterBackfillJob }) {
  const progress = job.totalChats > 0
    ? Math.min(100, Math.round((job.completedChats / job.totalChats) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-5 px-5 py-5 sm:px-9 sm:py-7">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <LoaderCircle className="size-5 animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {job.status === "queued" ? "任务正在排队" : "正在扫描历史消息"}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {job.currentChatTitle || "正在准备会话列表…"}
          </p>
        </div>
        <span className="text-sm font-semibold text-primary">{progress}%</span>
      </div>

      <progress
        value={progress}
        max={100}
        aria-label={`历史补录进度 ${progress}%`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
      />

      <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border bg-muted/35 py-3 text-center">
        <div className="px-2">
          <dt className="text-[11px] text-muted-foreground">已扫描</dt>
          <dd className="mt-1 text-sm font-semibold sm:text-base">
            {numberFormatter.format(job.scannedMessages)}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-[11px] text-muted-foreground">已命中</dt>
          <dd className="mt-1 text-sm font-semibold sm:text-base">
            {numberFormatter.format(job.matchedCount)}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-[11px] text-muted-foreground">已保存</dt>
          <dd className="mt-1 text-sm font-semibold text-success sm:text-base">
            {numberFormatter.format(job.savedCount)}
          </dd>
        </div>
      </dl>

      <div className="flex gap-3 text-sm leading-6 text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>任务会继续在后台运行，关闭弹框或离开页面不会中断。</p>
      </div>
    </div>
  );
}

export function HistoryBackfillDialog({
  selectedChatCount,
  latestJob,
  starting,
  disabled,
  onStart,
}: HistoryBackfillDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"time" | "count">("time");
  const [timePreset, setTimePreset] = useState<TimePreset>("one-year");
  const [countPreset, setCountPreset] = useState<CountPreset>("5000");
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [customStartDate, setCustomStartDate] = useState(() =>
    shiftDate(toDateInputValue(new Date()), -12),
  );
  const [customEndDate, setCustomEndDate] = useState(() => toDateInputValue(new Date()));
  const [customCount, setCustomCount] = useState("20000");
  const [formError, setFormError] = useState("");

  const activeJob = latestJob && ["queued", "running"].includes(latestJob.status)
    ? latestJob
    : null;
  const triggerLabel = activeJob
    ? activeJob.totalChats > 0
      ? `补录中 · ${activeJob.completedChats}/${activeJob.totalChats}`
      : "正在准备补录"
    : "补录历史…";
  const sourceDescription = selectedChatCount > 0
    ? `从 ${selectedChatCount} 个已选会话中查找符合当前规则的历史消息`
    : "从所有可访问会话中查找符合当前规则的历史消息";

  const startBackfill = async () => {
    setFormError("");
    let input: FilterBackfillJobCreateInput;

    if (mode === "count") {
      const perChatLimit = countPreset === "custom"
        ? Number(customCount)
        : Number(countPreset);
      if (!Number.isInteger(perChatLimit) || perChatLimit < 100 || perChatLimit > 100_000) {
        setFormError("自定义数量请输入 100–100,000 之间的整数");
        return;
      }
      input = { mode: "count", perChatLimit };
    } else {
      if (timePreset === "custom" && (!customStartDate || !customEndDate)) {
        setFormError("请选择完整的开始日期和结束日期");
        return;
      }
      const endDate = timePreset === "custom" ? customEndDate : today;
      const startDate = timePreset === "all"
        ? null
        : timePreset === "custom"
          ? customStartDate
          : shiftDate(endDate, timePreset === "one-year" ? -12 : -3);
      if (!endDate || (startDate && startDate > endDate)) {
        setFormError("开始日期不能晚于结束日期");
        return;
      }
      input = {
        mode: "time",
        startAt: startDate ? toLocalDayIso(startDate, false) : null,
        endAt: toLocalDayIso(endDate, true),
      };
    }

    try {
      await onStart(input);
      setOpen(false);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "无法开始补录");
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setFormError("");
      }}
    >
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto sm:min-w-52 lg:h-[46px] lg:min-w-[256px] lg:px-4"
            disabled={disabled && !activeJob}
          />
        }
      >
        {activeJob ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : (
          <History data-icon="inline-start" />
        )}
        {triggerLabel}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-foreground/24 backdrop-blur-[2px] transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100" />
        <Dialog.Viewport className="fixed inset-x-0 top-0 bottom-15 z-70 flex items-end justify-center md:inset-0 md:items-center md:p-5">
          <Dialog.Popup className="flex max-h-[calc(100dvh-3.75rem)] w-full min-h-0 flex-col overflow-hidden rounded-t-3xl border border-b-0 bg-popover text-popover-foreground shadow-[0_-18px_56px_color-mix(in_oklab,var(--foreground)_20%,transparent)] transition duration-200 data-closed:translate-y-full data-closed:opacity-0 data-open:translate-y-0 data-open:opacity-100 md:max-h-[min(88dvh,48rem)] md:max-w-[560px] md:rounded-2xl md:border md:shadow-[0_24px_80px_color-mix(in_oklab,var(--foreground)_24%,transparent)] md:data-closed:translate-y-2">
            <header className="flex shrink-0 items-start gap-4 px-5 pt-5 pb-4 sm:px-9 sm:pt-8">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {activeJob ? "正在补录历史消息" : "补录历史消息"}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm leading-5 text-muted-foreground sm:text-base">
                  {activeJob ? "进度会自动更新，可以随时关闭弹框" : sourceDescription}
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={<Button type="button" variant="ghost" size="icon-sm" />}
                aria-label="关闭补录历史消息"
              >
                <X />
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {activeJob ? (
                <BackfillProgress job={activeJob} />
              ) : (
                <div className="px-5 pb-5 sm:px-9 sm:pb-7">
                  {latestJob?.status === "failed" ? (
                    <div className="mb-4 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/6 p-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <p className="min-w-0">
                        上次补录未完成：{latestJob.error || "未知错误"}。可以调整范围后重试。
                      </p>
                    </div>
                  ) : latestJob?.status === "completed" ? (
                    <div className="mb-4 flex gap-3 rounded-xl border border-success/20 bg-success/6 p-3 text-sm text-success">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      <p>
                        上次补录已保存 {numberFormatter.format(latestJob.savedCount)} 条消息。
                      </p>
                    </div>
                  ) : null}

                  <Tabs
                    value={mode}
                    onValueChange={(value) => {
                      setMode(value as "time" | "count");
                      setFormError("");
                    }}
                    className="flex flex-col gap-4"
                  >
                    <TabsList className="h-11 w-full rounded-xl border bg-card p-0.5">
                      <TabsTrigger
                        value="time"
                        className="h-full rounded-[10px] data-active:bg-accent/55 data-active:text-primary data-active:shadow-none"
                      >
                        按时间
                      </TabsTrigger>
                      <TabsTrigger
                        value="count"
                        className="h-full rounded-[10px] data-active:bg-accent/55 data-active:text-primary data-active:shadow-none"
                      >
                        按数量
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="time" className="space-y-0.5">
                      <RadioOption
                        name="backfill-time-range"
                        checked={timePreset === "three-months"}
                        label="最近 3 个月"
                        onChange={() => setTimePreset("three-months")}
                      />
                      <RadioOption
                        name="backfill-time-range"
                        checked={timePreset === "one-year"}
                        label="最近 1 年"
                        recommended
                        onChange={() => setTimePreset("one-year")}
                      />
                      <RadioOption
                        name="backfill-time-range"
                        checked={timePreset === "custom"}
                        label="自定义日期"
                        onChange={() => setTimePreset("custom")}
                      />
                      {timePreset === "custom" ? (
                        <div className="grid gap-3 px-1 pt-1 pb-2 sm:grid-cols-2">
                          <label className="grid gap-1.5 text-xs text-muted-foreground">
                            开始日期
                            <Input
                              type="date"
                              value={customStartDate}
                              max={customEndDate}
                              onChange={(event) => setCustomStartDate(event.target.value)}
                              className="h-11 bg-card text-sm text-foreground"
                            />
                          </label>
                          <label className="grid gap-1.5 text-xs text-muted-foreground">
                            结束日期
                            <Input
                              type="date"
                              value={customEndDate}
                              min={customStartDate}
                              max={today}
                              onChange={(event) => setCustomEndDate(event.target.value)}
                              className="h-11 bg-card text-sm text-foreground"
                            />
                          </label>
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            将补录 {customStartDate.replace(/-/g, "/")} 至 {customEndDate.replace(/-/g, "/")} 的历史消息
                          </p>
                        </div>
                      ) : null}
                      <RadioOption
                        name="backfill-time-range"
                        checked={timePreset === "all"}
                        label="完整历史"
                        description="耗时取决于会话数量和历史活跃度"
                        onChange={() => setTimePreset("all")}
                      />
                    </TabsContent>

                    <TabsContent value="count" className="space-y-0.5">
                      <RadioOption
                        name="backfill-count-range"
                        checked={countPreset === "1000"}
                        label="最近 1,000 条 / 会话"
                        onChange={() => setCountPreset("1000")}
                      />
                      <RadioOption
                        name="backfill-count-range"
                        checked={countPreset === "5000"}
                        label="最近 5,000 条 / 会话"
                        description="每个会话最多扫描 5,000 条，命中消息都会保存"
                        recommended
                        onChange={() => setCountPreset("5000")}
                      />
                      <RadioOption
                        name="backfill-count-range"
                        checked={countPreset === "10000"}
                        label="最近 10,000 条 / 会话"
                        onChange={() => setCountPreset("10000")}
                      />
                      <RadioOption
                        name="backfill-count-range"
                        checked={countPreset === "custom"}
                        label="自定义数量"
                        onChange={() => setCountPreset("custom")}
                      />
                      {countPreset === "custom" ? (
                        <label className="grid gap-1.5 px-1 pt-1 pb-2 text-xs text-muted-foreground">
                          每个会话扫描条数
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={100}
                            max={100000}
                            step={100}
                            value={customCount}
                            onChange={(event) => setCustomCount(event.target.value)}
                            className="h-11 bg-card text-sm text-foreground"
                          />
                        </label>
                      ) : null}
                      <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground sm:text-sm">
                        实际耗时取决于会话数量和历史活跃度
                      </p>
                    </TabsContent>
                  </Tabs>

                  <Separator className="my-4" />

                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/70 text-primary">
                      <Info className="size-5" />
                    </span>
                    <div className="text-sm leading-6">
                      <p className="font-medium">将在后台进行，关闭页面不会中断</p>
                      <p className="text-muted-foreground">历史消息不会发送通知</p>
                    </div>
                  </div>

                  {formError ? (
                    <p className="mt-4 text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t bg-popover px-5 pt-3 pb-4 sm:px-9 sm:pt-4 sm:pb-6">
              {activeJob ? (
                <Dialog.Close
                  render={<Button type="button" size="lg" className="w-full sm:ml-auto sm:w-36" />}
                >
                  关闭
                </Dialog.Close>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:ml-auto sm:w-[310px]">
                  <Dialog.Close
                    render={<Button type="button" variant="outline" size="lg" />}
                  >
                    取消
                  </Dialog.Close>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void startBackfill()}
                    disabled={starting}
                  >
                    {starting ? (
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    开始补录
                  </Button>
                </div>
              )}
            </footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
