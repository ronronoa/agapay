import { Dialog, DialogDescription, DialogFooter, DialogTitle } from './dialog';
import { Button } from './Button';
import { Spinner } from './spinner';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  pendingLabel?: string;
}

// One confirmation shell for irreversible or session-ending actions, so no
// screen invents its own wording or button order.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  pending = false,
  pendingLabel = 'Working…',
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogFooter>
        <Button type="button" variant="accent" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" disabled={pending} aria-busy={pending} onClick={onConfirm}>
          {pending && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
