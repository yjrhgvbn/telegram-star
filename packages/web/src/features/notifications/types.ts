import type { ForwardTarget, ForwardTargetCreateInput } from "@/types";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
} from "@telegram-star/shared/contracts/forward-targets";

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
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
  };
}

export function isDraftTarget(target: EditableForwardTarget): target is ForwardTargetDraft {
  return target.id === 0;
}
