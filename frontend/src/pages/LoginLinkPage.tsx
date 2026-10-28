import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/useAuth';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Opened from the one-time link the bot sends for /login: exchanges the code for a session
 * and continues to the admin panel. The code is dropped from the address bar either way.
 */
export function LoginLinkPage() {
  const { t } = useTranslation();
  const { loginWithLink } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  // A code works once: never send it twice (React runs effects twice in development).
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const code = params.get('code');
    const fail = () => {
      setFailed(true);
      void navigate('/login', { replace: true });
    };
    if (!code) {
      fail();
      return;
    }
    loginWithLink(code).then(() => navigate('/admin', { replace: true }), fail);
  }, [params, loginWithLink, navigate]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      {failed ? (
        <>
          <h1 role="alert" className="text-xl font-semibold">
            {t('login.failed')}
          </h1>
          <p className="text-hint max-w-sm">{t('login.failedHint')}</p>
          <Link to="/" className="bg-accent text-accent-fg rounded-full px-5 py-3 font-medium">
            {t('login.toCatalog')}
          </Link>
        </>
      ) : (
        <>
          <Spinner />
          <p className="text-hint">{t('login.signingIn')}</p>
        </>
      )}
    </main>
  );
}
