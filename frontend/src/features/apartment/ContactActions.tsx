import { useTranslation } from 'react-i18next';

import type { Contact } from '@/api/types';
import { ChatIcon } from '@/components/ui/icons';
import { openExternal } from '@/telegram/webapp';

interface Props {
  agent: Contact | null;
  admin: Contact | null;
  /** "row": side by side (phone bar); "stack": full-width buttons (desktop card). */
  layout: 'row' | 'stack';
}

export function ContactActions({ agent, admin, layout }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className={layout === 'row' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
        <button
          type="button"
          disabled={!agent}
          onClick={() => {
            if (agent) openExternal(agent.url);
          }}
          className="bg-accent text-accent-fg flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 leading-tight font-semibold disabled:opacity-40"
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
            className="border-fg bg-bg text-fg flex min-h-12 items-center justify-center rounded-xl border px-3 leading-tight font-semibold"
          >
            {t('apartment.contactAdmin')}
          </button>
        )}
      </div>
      {!agent && <p className="text-hint text-center text-xs">{t('apartment.agentMissing')}</p>}
    </div>
  );
}
