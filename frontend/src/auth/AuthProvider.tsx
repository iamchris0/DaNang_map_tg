import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/api/client';
import { setSessionToken } from '@/api/session';
import type { Language, User } from '@/api/types';
import i18n, { hasStoredLanguage } from '@/i18n';
import { getInitData } from '@/telegram/webapp';

import { loginWithTelegram } from './login';

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  /** Persist a language choice to the profile (no-op when signed out). */
  saveLanguage: (language: Language) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState>({
  status: 'anonymous',
  user: null,
  saveLanguage: () => undefined,
});

/**
 * Inside Telegram, exchanges the signed initData for an API session. Browsing works without
 * it; admin features (Phase 4) require it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [initData] = useState(getInitData);
  const [status, setStatus] = useState<AuthState['status']>(initData ? 'loading' : 'anonymous');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;
    loginWithTelegram(initData)
      .then((response) => {
        setSessionToken(response.access_token);
        if (!hasStoredLanguage() && response.user.preferred_language) {
          void i18n.changeLanguage(response.user.preferred_language);
        }
        if (!cancelled) {
          setUser(response.user);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [initData]);

  const saveLanguage = useCallback(
    (language: Language) => {
      if (!user) return;
      apiFetch<User>('/api/auth/me', { method: 'PATCH', json: { preferred_language: language } })
        .then(setUser)
        .catch(() => undefined);
    },
    [user],
  );

  const value = useMemo(() => ({ status, user, saveLanguage }), [status, user, saveLanguage]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
