import { useTranslation } from 'react-i18next';

import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  title: string;
  body?: string | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="bg-surface min-h-12 flex-1 rounded-xl font-semibold"
          >
            {cancelLabel ?? t('admin.confirm.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-12 flex-1 rounded-xl font-semibold text-white ${
              destructive ? 'bg-danger' : 'bg-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {body && <p className="text-hint">{body}</p>}
    </Sheet>
  );
}
