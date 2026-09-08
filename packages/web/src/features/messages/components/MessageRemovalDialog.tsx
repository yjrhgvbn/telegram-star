import { useId, useState } from "react";
import type { Message } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMessageFilterMatches } from "../utils/messageRemoval";
import "./MessageRemovalDialog.css";

export interface MessageRemovalSelection {
  filterId: number;
  filterName: string;
  ids: number[];
  blockBackfill: boolean;
}

interface Props {
  messages: Message[];
  initialFilter?: { id: number; name: string } | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (selection: MessageRemovalSelection) => void;
}

export function MessageRemovalDialog({ messages, initialFilter, pending, error, onClose, onSubmit }: Props) {
  const selectId = useId();
  const [originalChoices] = useState(() => new Map(messages.flatMap((message) => getMessageFilterMatches(message).map((match) => [match.filterId, match.filterName] as const))));
  const choices = new Map(originalChoices);
  for (const message of messages) {
    for (const match of getMessageFilterMatches(message)) choices.set(match.filterId, match.filterName);
  }
  if (initialFilter) choices.set(initialFilter.id, initialFilter.name);
  const [filterId, setFilterId] = useState<number | null>(() => initialFilter?.id ?? (choices.size === 1 ? choices.keys().next().value! : null));
  const [blockBackfill, setBlockBackfill] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const ids = messages.filter((message) => getMessageFilterMatches(message).some((match) => match.filterId === filterId)).map((message) => message.id);
  const filterName = filterId === null ? null : choices.get(filterId);
  const count = pending ? submittedCount : ids.length;

  return <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent className="message-theme message-removal-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{filterName ? `从“${filterName}”移除 ${count} 条消息？` : "选择要移除消息的规则"}</AlertDialogTitle>
        <AlertDialogDescription>移除后可通过手动补录历史重新收录。其他规则仍可收录，Telegram 原消息不受影响。</AlertDialogDescription>
      </AlertDialogHeader>
      {!initialFilter && choices.size > 1 && <div className="message-removal-rule">
        <label htmlFor={selectId}>目标规则</label>
        <Select value={filterId} onValueChange={(value) => setFilterId(value as number | null)} disabled={pending}>
          <SelectTrigger id={selectId} aria-label="目标规则"><SelectValue>{filterName ?? "请选择规则"}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{[...choices].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>}
      {!initialFilter && filterId !== null && ids.length < messages.length && <p className="message-removal-scope">已选 {messages.length} 条，其中 {count} 条属于此规则；本次仅移除这 {count} 条。</p>}
      {!choices.size && <p className="message-removal-scope">这些消息没有可移除的规则归属。</p>}
      <label className="message-removal-option"><input type="checkbox" checked={blockBackfill} onChange={(event) => setBlockBackfill(event.target.checked)} disabled={pending} /><span>此规则以后补录时也跳过</span></label>
      {error && <p className="message-removal-error" role="alert">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending || filterId === null || !ids.length || !filterName} onClick={() => {
          if (filterId === null || !filterName || !ids.length) return;
          setSubmittedCount(ids.length);
          onSubmit({ filterId, filterName, ids, blockBackfill });
        }}>{pending ? `正在移除 ${count} 条…` : `移除 ${count} 条`}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
