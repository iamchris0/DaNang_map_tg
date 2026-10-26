import { useTranslation } from 'react-i18next';

import { type CheckState, useReadiness } from '@/api/health';

function StatusRow({ label, state }: { label: string; state: CheckState | 'pending' }) {
  const { t } = useTranslation();
  const color = state === 'ok' ? 'bg-emerald-500' : state === 'error' ? 'bg-danger' : 'bg-hint';
  const text =
    state === 'ok' ? t('status.ok') : state === 'error' ? t('status.error') : t('status.checking');

  return (
    <li className="flex items-center justify-between py-2">
      <span>{label}</span>
      <span className="text-hint flex items-center gap-2 text-sm">
        <span aria-hidden className={`size-2 rounded-full ${color}`} />
        {text}
      </span>
    </li>
  );
}

export function SystemStatus() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch, isFetching } = useReadiness();

  const state = (value: CheckState | undefined): CheckState | 'pending' =>
    isPending ? 'pending' : isError ? 'error' : (value ?? 'error');

  return (
    <section aria-labelledby="status-title" className="bg-surface rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <h2 id="status-title" className="font-semibold">
          {t('status.title')}
        </h2>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="text-accent min-h-9 rounded-full px-3 text-sm font-medium disabled:opacity-50"
        >
          {t('status.retry')}
        </button>
      </div>
      {isError && (
        <p role="alert" className="text-danger mt-2 text-sm">
          {t('status.unreachable')}
        </p>
      )}
      <ul className="divide-hint/20 mt-2 divide-y">
        <StatusRow
          label={t('status.components.api')}
          state={isPending ? 'pending' : isError ? 'error' : 'ok'}
        />
        <StatusRow label={t('status.components.database')} state={state(data?.database)} />
        <StatusRow label={t('status.components.postgis')} state={state(data?.postgis)} />
        <StatusRow label={t('status.components.storage')} state={state(data?.storage)} />
      </ul>
    </section>
  );
}
