import { useTranslation } from 'react-i18next';

import type { Contact } from '@/api/types';
import { ChatIcon } from '@/components/ui/icons';
import { openExternal } from '@/telegram/webapp';

interface Props {
  agent: Contact | null;
  admin: Contact | null;
}

export function ContactBar({ agent, admin }: Props) {
  const { t } = useTranslation();

  return (
    <div className="border-hint/15 bg-bg fixed inset-x-0 bottom-0 z-10 border-t px-3 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
      <div className="mx-auto max-w-3xl space-y-2">
        {!agent && <p className="text-hint text-center text-xs">{t('apartment.agentMissing')}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!agent}
            onClick={() => {
              if (agent) openExternal(agent.url);
            }}
            className="bg-accent text-accent-fg flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-40"
          >
            <ChatIcon width={18} height={18} />
            {t('apartment.contactAgent')}
          </button>
          {admin && (
            <button
              type="button"
              onClick={() => {
                openExternal(admin.url);
              }}
              className="bg-surface text-accent flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold"
            >
              {t('apartment.contactAdmin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
