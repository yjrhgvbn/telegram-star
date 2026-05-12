import { request } from "node:https";
import { getNotificationSettings } from "./notification-settings.js";

interface ForwardPayload {
  filterName: string;
  matchedKeyword: string | null;
  chatTitle: string;
  senderName: string;
  content: string;
  messageDate: string;
  telegramLink: string;
}

function postJson(urlString: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString);
      const req = request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              resolve();
              return;
            }

            const body = Buffer.concat(chunks).toString("utf-8");
            reject(new Error(`HTTP ${status}: ${body}`));
          });
        }
      );

      req.on("error", reject);
      req.write(JSON.stringify(payload));
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function sendFeishuNotification(payload: ForwardPayload): Promise<void> {
  const settings = await getNotificationSettings();
  const webhookUrl = settings.feishuWebhookUrl;
  if (!webhookUrl) {
    return;
  }
  await postJson(webhookUrl, {
    msg_type: "text",
    content: {
      text: payload.content,
    },
  });
}

export async function forwardMatchedMessage(payload: ForwardPayload): Promise<void> {
  const settings = await getNotificationSettings();
  const sources = settings.sources;
  if (sources.length === 0) {
    return;
  }

  const tasks: Promise<void>[] = [];

  if (sources.includes("feishu")) {
    tasks.push(sendFeishuNotification(payload));
  }

  if (tasks.length === 0) {
    return;
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Notify] Failed to forward matched message:", result.reason);
    }
  }
}
