import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title = 'Confirm Delete',
  message = 'Are you sure? This is irreversible!',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="photon-panel w-full max-w-sm space-y-3 p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-eve-border pb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-eve-danger">
            <AlertTriangle className="h-4 w-4" />
            {title}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-eve-muted hover:text-eve-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-eve-text">{message}</p>
        <div className="flex justify-end gap-2 border-t border-eve-border pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-eve-border bg-eve-panel px-3 py-1 text-xs text-eve-muted hover:text-eve-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="border border-eve-danger/60 bg-eve-danger/15 px-3 py-1 text-xs font-semibold text-eve-danger hover:bg-eve-danger/25"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

