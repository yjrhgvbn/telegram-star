import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import { appLogger } from "../shared/logging.js";
import { withMessageMembershipTransaction } from "./messageMemberships.js";
import { buildForwardNotification, getSafeProcessError, sendAppriseNotification, type ForwardPayload } from "./notifier.js";

export const NOTIFICATION_OUTBOX_CONCURRENCY = 2;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 5;
export const NOTIFICATION_OUTBOX_LEASE_MS = 60_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

/** Called only inside the transaction that first creates the message. */
export async function enqueueMatchedMessage(
  tx: Prisma.TransactionClient,
  payload: ForwardPayload & { rowId: number; messageKey: string; filterId: number },
): Promise<number> {
  const targets = await tx.forwardTarget.findMany({
    where: { enabled: true, filters: { some: { id: payload.filterId } } },
    select: { id: true, titleTemplate: true, bodyTemplate: true },
  });
  if (targets.length === 0) return 0;
  await tx.notificationOutbox.createMany({
    data: targets.map((target) => ({
      messageId: payload.rowId,
      messageKey: payload.messageKey,
      filterId: payload.filterId,
      targetId: target.id,
      ...buildForwardNotification(payload, target),
    })),
  });
  return targets.length;
}

function eligibleAt(now: Date): Prisma.NotificationOutboxWhereInput {
  return {
    attempts: { lt: NOTIFICATION_OUTBOX_MAX_ATTEMPTS },
    OR: [
      { status: "pending", nextAttemptAt: { lte: now } },
      { status: "processing", leaseUntil: { lte: now } },
    ],
  };
}

async function claimNotifications(now: Date) {
  return withMessageMembershipTransaction(async (tx) => {
    // A process that died on its final attempt must not leave a permanently
    // processing row. Other in-flight leases are never reset on startup.
    await tx.notificationOutbox.updateMany({
      where: { status: "processing", leaseUntil: { lte: now }, attempts: { gte: NOTIFICATION_OUTBOX_MAX_ATTEMPTS } },
      data: { status: "failed", leaseToken: null, leaseUntil: null, completedAt: now, lastErrorJson: '{"name":"DeliveryLeaseExpired"}' },
    });
    const candidates = await tx.notificationOutbox.findMany({
      where: eligibleAt(now),
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: NOTIFICATION_OUTBOX_CONCURRENCY,
    });
    const claimed = [];
    for (const candidate of candidates) {
      const leaseToken = randomUUID();
      const result = await tx.notificationOutbox.updateMany({
        where: { id: candidate.id, ...eligibleAt(now) },
        data: {
          status: "processing", attempts: { increment: 1 }, leaseToken,
          leaseUntil: new Date(now.getTime() + NOTIFICATION_OUTBOX_LEASE_MS),
        },
      });
      if (result.count) claimed.push({ ...candidate, leaseToken, attempts: candidate.attempts + 1 });
    }
    return claimed;
  });
}

type ClaimedNotification = Awaited<ReturnType<typeof claimNotifications>>[number];

/** Factory keeps worker lifecycle testable without starting timers on import. */
export function createNotificationOutboxWorker(options: {
  send?: typeof sendAppriseNotification;
  now?: () => Date;
  pollIntervalMs?: number;
} = {}) {
  const send = options.send ?? sendAppriseNotification;
  const now = options.now ?? (() => new Date());
  let active = false;
  let timer: NodeJS.Timeout | undefined;
  let pending: Promise<void> | null = null;
  let lastCleanupMs = 0;

  async function finish(job: ClaimedNotification, data: Prisma.NotificationOutboxUpdateManyMutationInput) {
    await withMessageMembershipTransaction((tx) => tx.notificationOutbox.updateMany({
      where: { id: job.id, status: "processing", leaseToken: job.leaseToken },
      data: { ...data, leaseToken: null, leaseUntil: null },
    }));
  }

  async function deliver(job: ClaimedNotification) {
    const context = {
      source: "message-forward" as const, messageKey: job.messageKey, rowId: job.messageId,
      filterId: job.filterId, targetId: job.targetId, outboxId: job.id, attempt: job.attempts,
    };
    try {
      // Target deletion cascades to its tasks. Re-check enabled state immediately
      // before starting delivery so disabling a target also stops queued sends.
      const target = await db.forwardTarget.findUnique({ where: { id: job.targetId }, select: { enabled: true, appriseUrl: true } });
      if (!target?.enabled) {
        await finish(job, { status: "cancelled", completedAt: now(), title: "", body: "" });
        return;
      }
      await send([target.appriseUrl], job.title, job.body, context);
      await finish(job, { status: "sent", completedAt: now(), lastErrorJson: null, title: "", body: "" });
    } catch (error) {
      const failure = getSafeProcessError(error instanceof Error && error.cause ? error.cause : error);
      const exhausted = job.attempts >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
      const nextAttemptAt = new Date(now().getTime() + RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)]!);
      await finish(job, {
        status: exhausted ? "failed" : "pending", nextAttemptAt,
        completedAt: exhausted ? now() : null, lastErrorJson: JSON.stringify(failure),
      });
      appLogger.warn({
        event: exhausted ? "notification.outbox.exhausted" : "notification.outbox.retry_scheduled",
        ...context, error: failure, ...(exhausted ? {} : { nextAttemptAt: nextAttemptAt.toISOString() }),
      }, exhausted ? "Notification delivery exhausted its retry limit" : "Notification delivery will be retried");
    }
  }

  function runOnce(): Promise<void> {
    if (pending) return pending;
    pending = (async () => {
      do {
        const current = now();
        if (current.getTime() - lastCleanupMs >= 3_600_000) {
          await db.notificationOutbox.deleteMany({ where: { status: { in: ["sent", "cancelled", "failed"] }, completedAt: { lt: new Date(current.getTime() - 30 * 86_400_000) } } });
          lastCleanupMs = current.getTime();
        }
        const jobs = await claimNotifications(now());
        const results = await Promise.allSettled(jobs.map(deliver));
        for (const result of results) {
          if (result.status === "rejected") {
            // A DB failure leaves the lease recoverable; never dump rendered
            // text, destination credentials, or child-process command args.
            appLogger.error({ event: "notification.outbox.worker_failed", error: getSafeProcessError(result.reason) }, "Notification outbox delivery could not be recorded");
          }
        }
        if (jobs.length === 0) break;
      } while (active);
    })().finally(() => { pending = null; });
    return pending;
  }

  function wake() {
    if (!active) return;
    void runOnce().catch((error) => {
      appLogger.error({ event: "notification.outbox.worker_failed", error: getSafeProcessError(error) }, "Notification outbox could not claim pending deliveries");
    });
  }

  return {
    runOnce,
    wake,
    start() {
      if (active) return;
      active = true;
      timer = setInterval(wake, options.pollIntervalMs ?? 1_000);
      timer.unref?.();
      wake();
    },
    async stop() {
      active = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      await pending;
    },
  };
}

const notificationOutbox = createNotificationOutboxWorker();
export const startNotificationOutbox = () => notificationOutbox.start();
export const stopNotificationOutbox = () => notificationOutbox.stop();
export const wakeNotificationOutbox = () => notificationOutbox.wake();
