import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../db/index.js";

const execFileAsync = promisify(execFile);

interface ForwardPayload {
  filterId?: number;
  filterName: string;
  matchedKeyword: string | null;
  chatTitle: string;
  senderName: string;
  content: string;
  messageDate: string;
  telegramLink: string;
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
    },
  });

  if (targets.length === 0) {
    return;
  }

  const appriseUrls = targets.map((t) => t.appriseUrl);

  const title = `[Telegram] 命中规则: ${payload.filterName}`;
  const body = `【群组】: ${payload.chatTitle}
【发送者】: ${payload.senderName}
【时间】: ${new Date(payload.messageDate).toLocaleString()}

${payload.content}

链接: ${payload.telegramLink}`;

  // Fire and forget, or wait for it (we wait for it here so we can log errors, but it won't block the caller too much if it's async)
  // Actually, the caller awaits this, so it delays the process. We might want to let it run in background.
  sendAppriseNotification(appriseUrls, title, body).catch(err => {
    console.error("[Notify] Unhandled error in sendAppriseNotification:", err);
  });
}
