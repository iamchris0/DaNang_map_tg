import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { newIdempotencyKey, usePublishToTelegram, useTelegramPreview } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { Publication } from '@/api/types';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { openExternal } from '@/telegram/webapp';

import { adminErrorMessage } from '../errors';
import { publicationErrorText } from './labels';
import { TelegramHtml } from './TelegramHtml';

interface Props {
  apartmentId: string;
  open: boolean;
  onClose: () => void;
}

/** True when the request may have reached the server but no answer came back. */
function isConnectionError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status === 0);
}

export function PublishSheet({ apartmentId, open, onClose }: Props) {
  const { t } = useTranslation();
  const preview = useTelegramPreview(apartmentId, open);
  const publish = usePublishToTelegram(apartmentId);
  // One key per confirmed attempt. Retrying after a lost connection reuses it, so the
  // server returns the original result instead of posting twice.
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [result, setResult] = useState<Publication | null>(null);

  const close = () => {
    setResult(null);
    publish.reset();
    setAttemptKey(newIdempotencyKey());
    onClose();
  };
  const submit = (key: string) => {
    publish.mutate(key, { onSuccess: setResult });
  };
  const startNewAttempt = () => {
    const key = newIdempotencyKey();
    setAttemptKey(key);
    setResult(null);
    publish.reset();
    submit(key);
  };

  let body;
  let footer;
  if (result?.status === 'succeeded') {
    body = (
      <div className="space-y-2 py-4 text-center">
        <p className="text-lg font-semibold text-emerald-600">{t('admin.telegram.successTitle')}</p>
        {result.post_url && (
          <button
            type="button"
            onClick={() => {
              openExternal(result.post_url ?? '');
            }}
            className="text-accent font-medium"
          >
            {t('admin.telegram.openPost')}
          </button>
        )}
      </div>
    );
    footer = (
      <button
        type="button"
        onClick={close}
        className="bg-accent text-accent-fg min-h-12 w-full rounded-xl font-semibold"
      >
        {t('admin.telegram.done')}
      </button>
    );
  } else if (result?.status === 'unknown') {
    body = (
      <div className="space-y-2 py-2" role="alert">
        <p className="text-lg font-semibold text-amber-600">{t('admin.telegram.unknownTitle')}</p>
        <p className="text-sm">{t('admin.telegram.unknownBody')}</p>
      </div>
    );
    footer = (
      <button
        type="button"
        onClick={close}
        className="bg-surface min-h-12 w-full rounded-xl font-semibold"
      >
        {t('admin.telegram.done')}
      </button>
    );
  } else if (result?.status === 'failed') {
    body = (
      <div className="space-y-2 py-2" role="alert">
        <p className="text-danger text-lg font-semibold">{t('admin.telegram.failedTitle')}</p>
        <p className="text-sm">{publicationErrorText(t, result.error_code)}</p>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={close}
          className="bg-surface min-h-12 flex-1 rounded-xl font-semibold"
        >
          {t('admin.telegram.cancel')}
        </button>
        <button
          type="button"
          onClick={startNewAttempt}
          disabled={publish.isPending}
          className="bg-accent text-accent-fg min-h-12 flex-1 rounded-xl font-semibold disabled:opacity-50"
        >
          {t('admin.telegram.tryAgain')}
        </button>
      </div>
    );
  } else if (preview.isPending) {
    body = (
      <div className="text-hint flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (preview.isError) {
    body = (
      <p role="alert" className="text-danger py-6 text-center">
        {adminErrorMessage(t, preview.error)}
      </p>
    );
  } else {
    const data = preview.data;
    const lostConnection = publish.isError && isConnectionError(publish.error);
    body = (
      <div className="space-y-3">
        <p className="text-hint text-sm">
          {t('admin.telegram.channel', { channel: data.channel_id || '—' })}
        </p>
        {/* After a lost connection the attempt itself shows up as "already published";
            the same-key retry below is the right action, so don't show that as a blocker. */}
        {data.blockers
          .filter((blocker) => !(lostConnection && blocker === 'already_published'))
          .map((blocker) => (
            <p key={blocker} role="alert" className="rounded-xl bg-amber-500/15 p-3 text-sm">
              {t(`admin.telegram.blockers.${blocker}`)}
            </p>
          ))}
        {data.caption_html && (
          <article
            className="bg-surface space-y-2 rounded-2xl p-3"
            aria-label={t('admin.telegram.previewTitle')}
          >
            {data.photo_urls.length > 0 && (
              <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-xl">
                {data.photo_urls.slice(0, 4).map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className={`aspect-square w-full object-cover ${index === 0 && data.photo_urls.length === 1 ? 'col-span-4 aspect-video' : ''}`}
                  />
                ))}
              </div>
            )}
            <TelegramHtml html={data.caption_html} />
          </article>
        )}
        <p className="text-hint text-xs">
          {t('admin.telegram.photos', { count: data.photo_urls.length })} ·{' '}
          {t('admin.telegram.length', { length: data.caption_length, limit: data.caption_limit })}
        </p>
        {lostConnection && (
          <p role="alert" className="rounded-xl bg-amber-500/15 p-3 text-sm">
            {t('admin.telegram.connectionLost')}
          </p>
        )}
        {publish.isError && !lostConnection && (
          <p role="alert" className="text-danger text-sm">
            {adminErrorMessage(t, publish.error)}
          </p>
        )}
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={close}
          className="bg-surface min-h-12 flex-1 rounded-xl font-semibold"
        >
          {t('admin.telegram.cancel')}
        </button>
        <button
          type="button"
          // A same-key retry is always safe: the server returns the stored result.
          disabled={!(data.can_publish || lostConnection) || publish.isPending}
          onClick={() => {
            submit(attemptKey);
          }}
          className="bg-accent text-accent-fg min-h-12 flex-1 rounded-xl font-semibold disabled:opacity-50"
        >
          {publish.isPending
            ? t('admin.telegram.publishing')
            : lostConnection
              ? t('admin.telegram.retrySame')
              : t('admin.telegram.confirm')}
        </button>
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={close} title={t('admin.telegram.previewTitle')} footer={footer}>
      {body}
    </Sheet>
  );
}
