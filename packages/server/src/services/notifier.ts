import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  renderForwardTemplate,
  type ForwardTemplatePayload,
} from "@telegram-star/shared/contracts/forward-targets";
import { db } from "../db/index.js";

const execFileAsync = promisify(execFile);

interface ForwardPayload {
  filterId?: number;
  filterName: string;
  matchedKeyword: string | null;
  chatTitle: string;
  senderName: string;
  senderId: string;
  content: string;
  messageDate: string;
  telegramLink: string;
}

interface ForwardTargetTemplate {
  titleTemplate: string | null;
  bodyTemplate: string | null;
}

interface ForwardNotification {
  title: string;
  body: string;
}

/**
 * Execute the Apprise CLI to send a notification.
 */
export async function sendAppriseNotification(appriseUrls: string[], title: string, body: string): Promise<void> {
  if (appriseUrls.length === 0) return;

  try {
    // apprise -t "title" -b "body" url1 url2 ...
    const args = ["-t", title, "-b", body, ...appriseUrls];
    
    const { stdout, stderr } = await execFileAsync("apprise", args, { timeout: 15000 });
    console.log("[Notify] Apprise success:", stdout.trim() || "Notification sent.");
    if (stderr) {
      console.warn("[Notify] Apprise stderr:", stderr.trim());
    }
  } catch (error: any) {
    console.error("[Notify] Apprise failed:", error.message || error);
    throw error; // Rethrow to let the caller handle it for the test endpoint
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

export async function forwardMatchedMessage(payload: ForwardPayload): Promise<void> {
  if (!payload.filterId) {
    return;
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
      appriseUrl: true,
      titleTemplate: true,
      bodyTemplate: true,
    },
  });

  if (targets.length === 0) {
    return;
  }

  // 每个转发通道独立渲染模板，避免一个通道的格式影响其它目标。
  Promise.all(
    targets.map((target) => {
      const notification = buildForwardNotification(payload, target);
      return sendAppriseNotification([target.appriseUrl], notification.title, notification.body);
    }),
  ).catch(err => {
    console.error("[Notify] Unhandled error in sendAppriseNotification:", err);
  });
}
