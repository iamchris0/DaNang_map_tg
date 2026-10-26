import { useTranslation } from 'react-i18next';

import type { CatalogSort } from '@/api/catalog';
import { Dropdown } from '@/components/ui/Dropdown';
import { CheckIcon, SortIcon } from '@/components/ui/icons';

const SORTS: CatalogSort[] = ['newest', 'price_asc', 'price_desc'];

/** Same pill + panel as the filters, so the controls line up. */
export function SortDropdown({
  sort,
  onChange,
}: {
  sort: CatalogSort;
  onChange: (sort: CatalogSort) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dropdown
      label={t(`catalog.sort.${sort}`)}
      title={t('catalog.sort.label')}
      icon={<SortIcon width={16} height={16} />}
      align="end"
      width="w-64"
    >
      {(close) => (
        <ul role="listbox" aria-label={t('catalog.sort.label')} className="-mx-2 space-y-1">
          {SORTS.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === sort}
                onClick={() => {
                  onChange(option);
                  close();
                }}
                className="hover:bg-surface flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left"
              >
                {t(`catalog.sort.${option}`)}
                {option === sort && <CheckIcon width={18} height={18} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}
