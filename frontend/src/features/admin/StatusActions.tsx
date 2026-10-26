import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChangeStatus } from '@/api/admin';
import type { ApartmentStatus } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toastContext';

import { adminErrorMessage } from './errors';
import { TRANSITIONS } from './status';

// Transitions that hide a listing from the public catalog, mapped to their dialog texts.
const NEEDS_CONFIRMATION: Partial<Record<ApartmentStatus, 'archive' | 'rented'>> = {
  archived: 'archive',
  rented: 'rented',
};

interface Props {
  apartmentId: string;
  status: ApartmentStatus;
  compact?: boolean;
}

/** Buttons for the allowed lifecycle transitions; hiding listings asks for confirmation. */
export function StatusActions({ apartmentId, status, compact = false }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useChangeStatus(apartmentId);
  const [pending, setPending] = useState<ApartmentStatus | null>(null);

  const apply = (target: ApartmentStatus) => {
    setPending(null);
    mutation.mutate(target, {
      onSuccess: () => {
        toast(t('admin.statusChanged', { status: t(`admin.status.${target}`) }));
      },
      onError: (error) => {
        toast(adminErrorMessage(t, error), 'error');
      },
    });
  };

  const confirmKind = pending ? NEEDS_CONFIRMATION[pending] : undefined;

  return (
    <>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {TRANSITIONS[status].map((target) => (
          <button
            key={target}
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (NEEDS_CONFIRMATION[target]) setPending(target);
              else apply(target);
            }}
            className={`rounded-xl font-semibold disabled:opacity-50 ${
              compact ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4'
            } ${target === 'available' ? 'bg-accent text-accent-fg' : 'bg-bg text-fg'}`}
          >
            {t(`admin.actions.${target}`)}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={confirmKind ? t(`admin.confirm.${confirmKind}Title`) : ''}
        body={confirmKind ? t(`admin.confirm.${confirmKind}Body`) : undefined}
        confirmLabel={t('admin.confirm.confirm')}
        onConfirm={() => {
          if (pending) apply(pending);
        }}
        onCancel={() => {
          setPending(null);
        }}
      />
    </>
  );
}
