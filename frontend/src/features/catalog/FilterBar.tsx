import { useTranslation } from 'react-i18next';

import { useDistricts } from '@/api/catalog';
import { Chip } from '@/components/ui/Chip';
import { FilterIcon } from '@/components/ui/icons';
import { BEDROOM_OPTIONS, type CatalogFilters } from '@/features/filters/filters';
import { districtName } from '@/lib/format';

interface Props {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  activeFilters: number;
  onOpenFilters: () => void;
}

const toggle = (values: number[], value: number) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value].sort();

/** One-tap filters under the header: rooms and districts, plus the full filter sheet. */
export function FilterBar({ filters, onChange, activeFilters, onOpenFilters }: Props) {
  const { t, i18n } = useTranslation();
  const districts = useDistricts();
  const language = i18n.resolvedLanguage ?? 'en';

  return (
    <div
      role="group"
      aria-label={t('catalog.quickFilters')}
      className="no-scrollbar border-line bg-bg flex items-center gap-2 overflow-x-auto border-b px-4 py-3 lg:px-10"
    >
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={
          activeFilters
            ? t('catalog.filtersActive', { count: activeFilters })
            : t('catalog.filters')
        }
        className="border-line hover:border-fg flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
      >
        <FilterIcon width={16} height={16} />
        {t('catalog.filters')}
        {activeFilters > 0 && (
          <span className="bg-fg text-bg flex size-5 items-center justify-center rounded-full text-[11px]">
            {activeFilters}
          </span>
        )}
      </button>
      <span aria-hidden="true" className="bg-line h-6 w-px shrink-0" />
      {BEDROOM_OPTIONS.map((option) => (
        <Chip
          key={`bedrooms-${option}`}
          selected={filters.bedrooms.includes(option)}
          onClick={() => {
            onChange({ ...filters, bedrooms: toggle(filters.bedrooms, option) });
          }}
        >
          {option === 0
            ? t('apartment.studio')
            : option === 3
              ? `${t('filters.threePlus')} ${t('filters.bedrooms').toLowerCase()}`
              : t('apartment.bedrooms', { count: option })}
        </Chip>
      ))}
      {districts.data?.map((district) => (
        <Chip
          key={`district-${district.id}`}
          selected={filters.districts.includes(district.id)}
          onClick={() => {
            onChange({ ...filters, districts: toggle(filters.districts, district.id) });
          }}
        >
          {districtName(district, language)}
        </Chip>
      ))}
    </div>
  );
}
