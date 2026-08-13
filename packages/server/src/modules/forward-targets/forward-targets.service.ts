import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_TEMPLATE_SAMPLE_PAYLOAD,
  forwardTargetActionResponseSchema,
  forwardTargetListSchema,
  forwardTargetSchema,
  renderForwardTemplate,
  type ForwardTarget,
  type ForwardTargetActionResponse,
  type ForwardTargetCreateInput,
  type ForwardTargetTestInput,
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
    titleTemplate: target.titleTemplate ?? DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: target.bodyTemplate ?? DEFAULT_FORWARD_BODY_TEMPLATE,
  });
}

export function buildForwardTargetTestNotification(input: ForwardTargetTestInput): ForwardTargetTestNotification {
  // 测试发送不绑定过滤器，也不写库；使用同一组样例变量验证当前模板的真实推送效果。
  return {
    title: renderForwardTemplate(input.titleTemplate, FORWARD_TEMPLATE_SAMPLE_PAYLOAD),
    body: renderForwardTemplate(input.bodyTemplate, FORWARD_TEMPLATE_SAMPLE_PAYLOAD),
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

export async function testForwardTarget(input: ForwardTargetTestInput): Promise<ForwardTargetActionResponse> {
  const notification = buildForwardTargetTestNotification(input);
  await sendAppriseNotification(
    [input.appriseUrl],
    notification.title,
    notification.body,
    { source: "target-test" },
  );
  return forwardTargetActionResponseSchema.parse({ success: true });
}
