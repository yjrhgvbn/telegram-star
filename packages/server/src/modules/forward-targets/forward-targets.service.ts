import {
  forwardTargetActionResponseSchema,
  forwardTargetListSchema,
  forwardTargetSchema,
  type ForwardTarget,
  type ForwardTargetActionResponse,
  type ForwardTargetCreateInput,
  type ForwardTargetUpdateInput,
} from "@telegram-star/shared/contracts/forward-targets";
import { sendAppriseNotification } from "../../services/notifier.js";
import {
  createForwardTargetRow,
  deleteForwardTargetRow,
  findForwardTargetById,
  findForwardTargetRows,
  type ForwardTargetRow,
  updateForwardTargetRow,
} from "./forward-targets.repository.js";

export class ForwardTargetNotFoundError extends Error {
  constructor() {
    super("Forward target not found");
  }
}

export interface ForwardTargetTestNotification {
  title: string;
  body: string;
}

export function toApiForwardTarget(target: ForwardTargetRow): ForwardTarget {
  return forwardTargetSchema.parse({
    ...target,
    filterIds: target.filters.map((filter) => filter.id),
  });
}

export function buildForwardTargetTestNotification(): ForwardTargetTestNotification {
  // 测试发送不绑定过滤器，也不写库；只验证用户输入的 Apprise URL 是否可投递。
  return {
    title: "[Telegram] 测试消息",
    body: "这是一条来自 Telegram Star 的测试消息，如果您能看到此消息，说明转发通道配置成功！",
  };
}

export async function listForwardTargets(): Promise<ForwardTarget[]> {
  const targets = await findForwardTargetRows();
  return forwardTargetListSchema.parse(targets.map(toApiForwardTarget));
}

export async function createForwardTarget(input: ForwardTargetCreateInput): Promise<ForwardTarget> {
  return toApiForwardTarget(await createForwardTargetRow(input));
}

export async function updateForwardTarget(
  id: number,
  input: ForwardTargetUpdateInput,
): Promise<ForwardTarget> {
  const existing = await findForwardTargetById(id);
  if (!existing) throw new ForwardTargetNotFoundError();

  return toApiForwardTarget(await updateForwardTargetRow(id, input));
}

export async function deleteForwardTarget(id: number): Promise<ForwardTargetActionResponse> {
  const existing = await findForwardTargetById(id);
  if (!existing) throw new ForwardTargetNotFoundError();

  await deleteForwardTargetRow(id);
  return forwardTargetActionResponseSchema.parse({ success: true });
}

export async function testForwardTarget(appriseUrl: string): Promise<ForwardTargetActionResponse> {
  const notification = buildForwardTargetTestNotification();
  await sendAppriseNotification([appriseUrl], notification.title, notification.body);
  return forwardTargetActionResponseSchema.parse({ success: true });
}
