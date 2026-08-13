import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  renderForwardTemplate,
  type ForwardTemplatePayload,
} from "@telegram-star/shared/contracts/forward-targets";
import { db } from "../db/index.js";
import { appLogger } from "../shared/logging.js";

const execFileAsync = promisify(execFile);

interface ForwardPayload {
  filterId?: number;
  targetId?: number;
  filterName: string;
  matchedKeyword: string | null;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
  messageKey?: string;
  rowId?: number;
}

interface ForwardTargetTemplate {
  titleTemplate: string | null;
  bodyTemplate: string | null;
}

interface ForwardNotification {
  title: string;
  body: string;
}

interface NotificationLogContext {
  messageKey?: string;
  rowId?: number;
  filterId?: number;
  source?: "message-forward" | "target-test";
}

export function getSafeProcessError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const value = error as {
    name?: unknown;
    code?: unknown;
    signal?: unknown;
    killed?: unknown;
  };
  return {
    name: typeof value.name === "string" ? value.name : "ProcessError",
    code: typeof value.code === "string" || typeof value.code === "number" ? value.code : undefined,
    signal: typeof value.signal === "string" ? value.signal : undefined,
    killed: typeof value.killed === "boolean" ? value.killed : undefined,
  };
}

/**
 * Execute the Apprise CLI to send a notification.
 */
export async function sendAppriseNotification(
  appriseUrls: string[],
  title: string,
  body: string,
  context: NotificationLogContext = {},
): Promise<void> {
  if (appriseUrls.length === 0) return;

  const startedAtMs = Date.now();
  try {
    // apprise -t "title" -b "body" url1 url2 ...
    const args = ["-t", title, "-b", body, ...appriseUrls];

    const { stderr } = await execFileAsync("apprise", args, { timeout: 15000 });
    appLogger.info(
      {
        event: "notification.apprise.sent",
        ...context,
        targetCount: appriseUrls.length,
        durationMs: Date.now() - startedAtMs,
      },
      "Apprise notification sent",
    );
    if (stderr) {
      appLogger.warn(
        {
          event: "notification.apprise.stderr",
          ...context,
          targetCount: appriseUrls.length,
          stderrBytes: Buffer.byteLength(stderr),
        },
        "Apprise returned stderr",
      );
    }
  } catch (error: unknown) {
    // child_process 错误对象可能携带包含通知 URL、标题和正文的 cmd 字段，禁止整体输出。
    appLogger.error(
      {
        event: "notification.apprise.failed",
        ...context,
        targetCount: appriseUrls.length,
        durationMs: Date.now() - startedAtMs,
        error: getSafeProcessError(error),
      },
      "Apprise notification failed",
    );
    throw new Error("Notification delivery failed", { cause: error });
  }
}

function resolveTemplate(template: string | null | undefined, fallback: string): string {
  const normalized = template?.trim();
  return normalized ? normalized : fallback;
}

function buildTemplatePayload(payload: ForwardPayload): ForwardTemplatePayload {
  return {
    filterName: payload.filterName,
    matchedKeyword: payload.matchedKeyword,
    chatTitle: payload.chatTitle,
    senderName: payload.senderName,
    senderId: payload.senderId,
    content: payload.content,
    messageDate: new Date(payload.messageDate).toLocaleString(),
    telegramLink: payload.telegramLink,
  };
}

function renderWithFallback(template: string, fallback: string, payload: ForwardTemplatePayload): string {
  const rendered = renderForwardTemplate(template, payload);
  return rendered.trim() ? rendered : renderForwardTemplate(fallback, payload);
}

export function buildForwardNotification(
  payload: ForwardPayload,
  target: ForwardTargetTemplate,
): ForwardNotification {
  const templatePayload = buildTemplatePayload(payload);
  const titleTemplate = resolveTemplate(target.titleTemplate, DEFAULT_FORWARD_TITLE_TEMPLATE);
  const bodyTemplate = resolveTemplate(target.bodyTemplate, DEFAULT_FORWARD_BODY_TEMPLATE);

  return {
    title: renderWithFallback(titleTemplate, DEFAULT_FORWARD_TITLE_TEMPLATE, templatePayload),
    body: renderWithFallback(bodyTemplate, DEFAULT_FORWARD_BODY_TEMPLATE, templatePayload),
  };
}

export async function forwardMatchedMessage(payload: ForwardPayload): Promise<number> {
  if (!payload.filterId) {
    return 0;
  }

  // Find enabled ForwardTargets that are linked to this filter
  const targets = await db.forwardTarget.findMany({
    where: {
      enabled: true,
      filters: {
        some: {
          id: payload.filterId,
        },
      },
    },
    select: {
      id: true,
      appriseUrl: true,
      titleTemplate: true,
      bodyTemplate: true,
    },
  });

  if (targets.length === 0) {
    return 0;
  }

  // 每个转发通道独立渲染模板，避免一个通道的格式影响其它目标。
  Promise.all(
    targets.map((target) => {
      const notification = buildForwardNotification(payload, target);
      return sendAppriseNotification([target.appriseUrl], notification.title, notification.body, {
        source: "message-forward",
        messageKey: payload.messageKey,
        rowId: payload.rowId,
        filterId: payload.filterId,
        targetId: target.id,
      });
    }),
  ).catch((error: unknown) => {
    appLogger.error(
      {
        event: "notification.forward.failed",
        messageKey: payload.messageKey,
        rowId: payload.rowId,
        filterId: payload.filterId,
        targetCount: targets.length,
        error: getSafeProcessError(error instanceof Error && error.cause ? error.cause : error),
      },
      "Matched message notification failed",
    );
  });
  return targets.length;
}
