import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useChangeStatus, useDeleteApartment } from '@/api/admin';
import type { AdminListItem, ApartmentStatus } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ArchiveIcon, KeyIcon, PencilIcon, SendIcon, TrashIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toastContext';
import { ApartmentPhoto } from '@/features/apartment/ApartmentPhoto';
import { districtName, formatDate, formatPriceFull } from '@/lib/format';

import { adminErrorMessage } from './errors';
import { TRANSITIONS } from './status';
import { StatusBadge } from './StatusBadge';

type Pending = 'rented' | 'archived' | 'delete';

const ICON_BUTTON =
  'flex size-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface disabled:opacity-40';

/** Admin listing tile: photo, essentials, "Publish" when possible, other actions as icons. */
export function ListingTile({ item }: { item: AdminListItem }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const changeStatus = useChangeStatus(item.id);
  const remove = useDeleteApartment();
  const [pending, setPending] = useState<Pending | null>(null);
  const title = item.title ?? t('admin.untitled');
  const allowed = TRANSITIONS[item.status];
  const busy = changeStatus.isPending || remove.isPending;

  const onError = (error: unknown) => {
    toast(adminErrorMessage(t, error), 'error');
  };
  const apply = (target: ApartmentStatus) => {
    changeStatus.mutate(target, {
      onSuccess: () => {
        toast(t('admin.statusChanged', { status: t(`admin.status.${target}`) }));
      },
      onError,
    });
  };
  const confirm = () => {
    const action = pending;
    setPending(null);
    if (action === 'delete') {
      remove.mutate(item.id, {
        onSuccess: () => {
          toast(t('admin.deleted'));
        },
        onError,
      });
    } else if (action) {
      apply(action);
    }
  };

  const dialog = {
    rented: ['admin.confirm.rentedTitle', 'admin.confirm.rentedBody', 'admin.confirm.confirm'],
    archived: ['admin.confirm.archiveTitle', 'admin.confirm.archiveBody', 'admin.confirm.confirm'],
    delete: ['admin.confirm.deleteTitle', 'admin.confirm.deleteBody', 'admin.confirm.delete'],
  } as const;

  return (
    <li className="border-line bg-bg flex flex-col overflow-hidden rounded-2xl border">
      <Link to={`/admin/apartments/${item.id}`} className="relative block">
        <ApartmentPhoto
          image={item.cover_image}
          alt={title}
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[4/3] w-full"
        />
        <span className="absolute top-3 left-3">
          <StatusBadge status={item.status} />
        </span>
        {item.publication_status === 'succeeded' && (
          <span
            title={t('admin.postedToChannel')}
            aria-label={t('admin.postedToChannel')}
            className="bg-bg/95 shadow-card absolute top-3 right-3 flex size-8 items-center justify-center rounded-full"
          >
            <SendIcon width={15} height={15} />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="truncate font-semibold">{title}</h3>
        <p className="truncate text-sm">
          {item.price_vnd !== null ? formatPriceFull(item.price_vnd, language) : t('admin.noPrice')}
          {item.district && (
            <span className="text-hint"> · {districtName(item.district, language)}</span>
          )}
        </p>
        <p className="text-hint text-xs">
          {t('admin.updated', { date: formatDate(item.updated_at, language) })}
        </p>

        <div className="mt-auto flex items-center gap-1 pt-3">
          {allowed.includes('available') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                apply('available');
              }}
              className="bg-accent text-accent-fg mr-auto h-10 rounded-full px-4 text-sm font-semibold disabled:opacity-50"
            >
              {t('admin.publish')}
            </button>
          )}
          <div className="ml-auto flex items-center">
            <Link
              to={`/admin/apartments/${item.id}`}
              aria-label={t('admin.iconActions.edit')}
              title={t('admin.iconActions.edit')}
              className={ICON_BUTTON}
            >
              <PencilIcon width={18} height={18} />
            </Link>
            {allowed.includes('rented') && (
              <button
                type="button"
                disabled={busy}
                aria-label={t('admin.iconActions.rented')}
                title={t('admin.iconActions.rented')}
                onClick={() => {
                  setPending('rented');
                }}
                className={ICON_BUTTON}
              >
                <KeyIcon width={18} height={18} />
              </button>
            )}
            {allowed.includes('archived') && (
              <button
                type="button"
                disabled={busy}
                aria-label={t('admin.iconActions.archived')}
                title={t('admin.iconActions.archived')}
                onClick={() => {
                  setPending('archived');
                }}
                className={ICON_BUTTON}
              >
                <ArchiveIcon width={18} height={18} />
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              aria-label={t('admin.iconActions.delete')}
              title={t('admin.iconActions.delete')}
              onClick={() => {
                setPending('delete');
              }}
              className={`${ICON_BUTTON} text-danger`}
            >
              <TrashIcon width={18} height={18} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(dialog[pending][0]) : ''}
        body={pending ? t(dialog[pending][1]) : undefined}
        confirmLabel={pending ? t(dialog[pending][2]) : ''}
        destructive={pending === 'delete'}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={confirm}
      />
    </li>
  );
}
