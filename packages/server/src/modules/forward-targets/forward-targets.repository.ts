import { db } from "../../db/index.js";
import type {
  ForwardTargetCreateInput,
  ForwardTargetUpdateInput,
} from "@telegram-star/shared/contracts/forward-targets";

export type ForwardTargetRow = Awaited<ReturnType<typeof findForwardTargetRows>>[number];

export async function findForwardTargetRows() {
  return db.forwardTarget.findMany({
    include: {
      filters: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findForwardTargetById(id: number) {
  return db.forwardTarget.findUnique({ where: { id } });
}

export async function createForwardTargetRow(input: ForwardTargetCreateInput): Promise<ForwardTargetRow> {
  const now = new Date().toISOString();
  return db.forwardTarget.create({
    data: {
      name: input.name,
      appriseUrl: input.appriseUrl,
      enabled: input.enabled,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      createdAt: now,
      updatedAt: now,
      filters: {
        connect: input.filterIds.map((id) => ({ id })),
      },
    },
    include: {
      filters: { select: { id: true } },
    },
  });
}

export async function updateForwardTargetRow(
  id: number,
  input: ForwardTargetUpdateInput,
): Promise<ForwardTargetRow> {
  return db.forwardTarget.update({
    where: { id },
    data: {
      name: input.name,
      appriseUrl: input.appriseUrl,
      enabled: input.enabled,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      updatedAt: new Date().toISOString(),
      filters: {
        set: input.filterIds.map((filterId) => ({ id: filterId })),
      },
    },
    include: {
      filters: { select: { id: true } },
    },
  });
}

export async function deleteForwardTargetRow(id: number): Promise<void> {
  await db.forwardTarget.delete({ where: { id } });
}
