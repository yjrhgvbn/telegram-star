const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface FilterActivityPresentation {
  label: string;
  dateTime: string | null;
  exactTime: string | null;
}

export function getFilterActivityPresentation(
  value: string | null,
  nowMs = Date.now(),
): FilterActivityPresentation {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return {
      label: "尚无命中消息",
      dateTime: null,
      exactTime: null,
    };
  }

  // 服务端与设备时间偶尔会有轻微偏差，未来时间统一按“刚刚”处理。
  const elapsedMs = Math.max(0, nowMs - timestamp);
  let label: string;

  if (elapsedMs < MINUTE_MS) {
    label = "刚刚";
  } else if (elapsedMs < HOUR_MS) {
    label = `${Math.floor(elapsedMs / MINUTE_MS)} 分钟前`;
  } else if (elapsedMs < DAY_MS) {
    label = `${Math.floor(elapsedMs / HOUR_MS)} 小时前`;
  } else if (elapsedMs < 30 * DAY_MS) {
    label = `${Math.floor(elapsedMs / DAY_MS)} 天前`;
  } else {
    const date = new Date(timestamp);
    const now = new Date(nowMs);
    label = date.getFullYear() === now.getFullYear()
      ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
      : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  return {
    label,
    dateTime: value,
    exactTime: new Date(timestamp).toLocaleString("zh-CN", { hour12: false }),
  };
}
