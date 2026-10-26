import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '@/auth/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BackIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { DevLogin } from '@/features/admin/DevLogin';
import { bindBackButton, isInTelegram } from '@/telegram/webapp';

// The backend refuses dev sign-in through proxies and tunnels; don't offer it there either.
function isLocalHost(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

/**
 * Admin shell. Visibility here is only a convenience: every admin API call is authorised
 * by the backend.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const atRoot = location.pathname === '/admin';
  const backTo = atRoot ? '/' : '/admin';

  useEffect(
    () =>
      bindBackButton(() => {
        void navigate(backTo);
      }),
    [navigate, backTo],
  );

  let content;
  if (status === 'loading') {
    content = (
      <div className="text-hint flex justify-center py-24">
        <Spinner />
      </div>
    );
  } else if (user?.is_admin) {
    content = <Outlet />;
  } else {
    content = (
      <div className="px-4 py-12 text-center">
        <p role="alert" className="text-lg">
          {t('admin.accessDenied')}
        </p>
        {!user && !isInTelegram() && (
          <p className="text-hint mt-2 text-sm">{t('admin.openInTelegram')}</p>
        )}
        {import.meta.env.DEV && !isInTelegram() && isLocalHost() && <DevLogin />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-bg z-10 flex items-center gap-2 px-3 pt-[calc(0.5rem+var(--safe-top))] pb-2 shadow-sm">
        {!isInTelegram() && (
          <Link
            to={backTo}
            aria-label={atRoot ? t('admin.backToCatalog') : t('common.back')}
            className="flex size-9 items-center justify-center rounded-full"
          >
            <BackIcon />
          </Link>
        )}
        <h1 className="flex-1 text-lg font-bold">{t('admin.title')}</h1>
        <LanguageSwitcher />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{content}</main>
    </div>
  );
}
