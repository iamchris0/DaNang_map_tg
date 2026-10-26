import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/useAuth';

/** Browser sign-in for local development only (never rendered in production builds). */
export function DevLogin() {
  const { t } = useTranslation();
  const { devLogin } = useAuth();
  const [userId, setUserId] = useState('');
  const [failed, setFailed] = useState(false);

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFailed(false);
    devLogin(Number(userId)).catch(() => {
      setFailed(true);
    });
  };

  return (
    <form onSubmit={submit} className="bg-surface mx-auto mt-8 max-w-sm space-y-3 rounded-2xl p-4">
      <h2 className="font-semibold">{t('admin.devLogin.title')}</h2>
      <p className="text-hint text-sm">{t('admin.devLogin.hint')}</p>
      <label className="block space-y-1">
        <span className="text-sm">{t('admin.devLogin.userId')}</span>
        <input
          inputMode="numeric"
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value.replace(/\D/g, ''));
          }}
          className="border-hint/30 bg-bg min-h-11 w-full rounded-xl border px-3"
        />
      </label>
      {failed && (
        <p role="alert" className="text-danger text-sm">
          {t('admin.devLogin.failed')}
        </p>
      )}
      <button
        type="submit"
        disabled={!userId}
        className="bg-accent text-accent-fg min-h-11 w-full rounded-xl font-semibold disabled:opacity-50"
      >
        {t('admin.devLogin.submit')}
      </button>
    </form>
  );
}
