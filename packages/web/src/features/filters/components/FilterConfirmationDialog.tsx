import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type FilterConfirmationKind = "delete" | "discard";

interface FilterConfirmationDialogProps {
  kind: FilterConfirmationKind | null;
  filterName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FilterConfirmationDialog({
  kind,
  filterName,
  onCancel,
  onConfirm,
}: FilterConfirmationDialogProps) {
  const deleting = kind === "delete";

  return (
    <AlertDialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleting ? `删除规则“${filterName}”？` : "放弃未保存的修改？"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleting
              ? "删除后无法恢复，这条规则也将立即停止监听。"
              : "返回上一页后，当前页面中的修改将不会保留。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant={deleting ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {deleting ? "删除规则" : "放弃修改"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
