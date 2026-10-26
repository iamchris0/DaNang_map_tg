import { useTranslation } from 'react-i18next';

import type { ApartmentStatus } from '@/api/types';

import { STATUS_STYLES } from './status';

export function StatusBadge({ status }: { status: ApartmentStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {t(`admin.status.${status}`)}
    </span>
  );
}
