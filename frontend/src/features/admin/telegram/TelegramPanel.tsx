import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useResolvePublication, useTelegramPublications } from '@/api/admin';
import type { ApartmentStatus, Publication } from '@/api/types';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toastContext';
import { formatDate } from '@/lib/format';
import { openExternal } from '@/telegram/webapp';

import { adminErrorMessage } from '../errors';
import { FormSection } from '../form/fields';
import { publicationErrorText } from './labels';
import { PublishSheet } from './PublishSheet';

const STATUS_STYLE: Record<Publication['status'], string> = {
  succeeded: 'bg-emerald-600 text-white',
  failed: 'bg-danger text-white',
  unknown: 'bg-amber-500 text-white',
  pending: 'bg-sky-600 text-white',
};

function PublicationRow({ publication }: { publication: Publication }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[publication.status]}`}
        >
          {t(`admin.telegram.status.${publication.status}`)}
        </span>
        <span className="text-hint">
          {formatDate(publication.published_at ?? publication.created_at, language)}
          {publication.published_by && ` · ${publication.published_by}`}
        </span>
      </div>
      {publication.status === 'failed' && (
        <p className="text-hint">{publicationErrorText(t, publication.error_code)}</p>
      )}
    </li>
  );
}

/** Channel publishing for one listing: status, explicit publish flow, recovery, history. */
export function TelegramPanel({
  apartmentId,
  status,
}: {
  apartmentId: string;
  status: ApartmentStatus;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const language = i18n.resolvedLanguage ?? 'en';
  const history = useTelegramPublications(apartmentId);
  const resolve = useResolvePublication(apartmentId);
  const [open, setOpen] = useState(false);

  const live = history.data?.find((p) => p.status !== 'failed') ?? null;
  const posted = live?.status === 'succeeded' ? live : null;
  const unconfirmed = live?.status === 'unknown' ? live : null;

  const resolveAs = (wasPublished: boolean) => {
    if (!unconfirmed) return;
    resolve.mutate(
      { publicationId: unconfirmed.id, wasPublished },
      {
        onError: (error) => {
          toast(adminErrorMessage(t, error), 'error');
        },
      },
    );
  };

  return (
    <FormSection title={t('admin.telegram.title')}>
      {history.isPending ? (
        <Spinner />
      ) : posted ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-emerald-600">
            {posted.published_by
              ? t('admin.telegram.postedBy', {
                  date: formatDate(posted.published_at ?? posted.created_at, language),
                  name: posted.published_by,
                })
              : t('admin.telegram.posted', {
                  date: formatDate(posted.published_at ?? posted.created_at, language),
                })}
          </p>
          {posted.post_url && (
            <button
              type="button"
              onClick={() => {
                openExternal(posted.post_url ?? '');
              }}
              className="text-accent font-medium"
            >
              {t('admin.telegram.openPost')}
            </button>
          )}
          <p className="bg-bg text-hint rounded-xl p-3 text-sm">{t('admin.telegram.editNotice')}</p>
        </div>
      ) : unconfirmed ? (
        <div className="space-y-2 rounded-xl bg-amber-500/15 p-3" role="alert">
          <p className="font-semibold">{t('admin.telegram.unknownTitle')}</p>
          <p className="text-sm">{t('admin.telegram.unknownBody')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={resolve.isPending}
              onClick={() => {
                resolveAs(true);
              }}
              className="bg-bg min-h-10 rounded-xl px-3 text-sm font-semibold"
            >
              {t('admin.telegram.wasPosted')}
            </button>
            <button
              type="button"
              disabled={resolve.isPending}
              onClick={() => {
                resolveAs(false);
              }}
              className="bg-bg min-h-10 rounded-xl px-3 text-sm font-semibold"
            >
              {t('admin.telegram.wasNotPosted')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-hint text-sm">{t('admin.telegram.notPosted')}</p>
          {status !== 'available' && (
            <p className="text-sm text-amber-600">{t('admin.telegram.makeAvailableFirst')}</p>
          )}
          <button
            type="button"
            disabled={status !== 'available'}
            onClick={() => {
              setOpen(true);
            }}
            className="bg-accent text-accent-fg min-h-11 w-full rounded-xl font-semibold disabled:opacity-50"
          >
            {t('admin.telegram.publish')}
          </button>
        </>
      )}

      {history.data && history.data.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('admin.telegram.history')}</summary>
          <ul className="divide-hint/15 divide-y">
            {history.data.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} />
            ))}
          </ul>
        </details>
      )}

      <PublishSheet
        apartmentId={apartmentId}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </FormSection>
  );
}
