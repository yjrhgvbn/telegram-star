import type { ForwardTarget, ForwardTargetCreateInput } from "@/types";

export const NEW_FORWARD_TARGET_ID = "new";

export type ForwardTargetDraft = ForwardTargetCreateInput & { id: 0 };
export type EditableForwardTarget = ForwardTarget | ForwardTargetDraft;

export function createDraftTarget(): ForwardTargetDraft {
  return {
    id: 0,
    name: "",
    appriseUrl: "",
    enabled: true,
    filterIds: [],
  };
}

export function isDraftTarget(target: EditableForwardTarget): target is ForwardTargetDraft {
  return target.id === 0;
}
