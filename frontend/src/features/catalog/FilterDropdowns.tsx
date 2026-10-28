import { useTranslation } from 'react-i18next';

import { useApartmentCount, useDistricts } from '@/api/catalog';
import { Chip } from '@/components/ui/Chip';
import { Dropdown } from '@/components/ui/Dropdown';
import { AmenityCheckboxes } from '@/features/amenities/AmenityCheckboxes';
import { NumberInput } from '@/components/ui/NumberInput';
import {
  activeFilterCount,
  BEDROOM_OPTIONS,
  type CatalogFilters,
  EMPTY_FILTERS,
} from '@/features/filters/filters';
import { districtName } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import {
  amenitiesSummary,
  areaSummary,
  bedroomsSummary,
  districtSummary,
  priceSummary,
} from './filterSummary';

const MILLION = 1_000_000;
const toMillions = (vnd: number | null) => (vnd === null ? null : vnd / MILLION);
const fromMillions = (millions: number | null) =>
  millions === null ? null : Math.round(millions * MILLION);
const toggle = (values: number[], value: number) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value].sort();

interface Props {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
}

/** One dropdown per filter category; changes apply immediately (debounced fetching). */
export function FilterDropdowns({ filters, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const districts = useDistricts();
  const count = useApartmentCount(useDebouncedValue(filters, 300));
  const set = (patch: Partial<CatalogFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const total = count.data;
  const footer = (clear: Partial<CatalogFilters>) => (close: () => void) => (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => {
          set(clear);
        }}
        className="min-h-11 rounded-lg px-2 font-semibold underline"
      >
        {t('filters.clear')}
      </button>
      <button
        type="button"
        onClick={close}
        className="bg-fg text-bg min-h-11 rounded-xl px-5 font-semibold"
      >
        {total === undefined
          ? t('common.loading')
          : total === 0
            ? t('filters.showNone')
            : t('filters.show', { count: total })}
      </button>
    </div>
  );

  const price = priceSummary(t, filters, language);
  const rooms = bedroomsSummary(t, filters);
  const district = districtSummary(t, filters, districts.data, language);
  const area = areaSummary(filters);
  const amenities = amenitiesSummary(t, filters);

  return (
    <div className="flex items-center gap-2">
      <Dropdown
        label={price ?? t('filters.categories.price')}
        title={t('filters.categories.price')}
        active={price !== null}
        footer={footer({ minPrice: null, maxPrice: null })}
      >
        {() => (
          <fieldset className="space-y-3">
            <legend className="text-hint text-sm">{t('filters.priceHint')}</legend>
            <div className="flex gap-3">
              <NumberInput
                label={t('filters.min')}
                value={toMillions(filters.minPrice)}
                step={0.5}
                onChange={(value) => {
                  set({ minPrice: fromMillions(value) });
                }}
              />
              <NumberInput
                label={t('filters.max')}
                value={toMillions(filters.maxPrice)}
                step={0.5}
                onChange={(value) => {
                  set({ maxPrice: fromMillions(value) });
                }}
              />
            </div>
          </fieldset>
        )}
      </Dropdown>

      <Dropdown
        label={rooms ?? t('filters.categories.bedrooms')}
        title={t('filters.categories.bedrooms')}
        active={rooms !== null}
        footer={footer({ bedrooms: [] })}
      >
        {() => (
          <div className="grid grid-cols-2 gap-2">
            {BEDROOM_OPTIONS.map((option) => (
              <Chip
                key={option}
                selected={filters.bedrooms.includes(option)}
                onClick={() => {
                  set({ bedrooms: toggle(filters.bedrooms, option) });
                }}
              >
                {option === 0
                  ? t('apartment.studio')
                  : option === 3
                    ? t('filters.threePlus')
                    : option}
              </Chip>
            ))}
          </div>
        )}
      </Dropdown>

      <Dropdown
        label={district ?? t('filters.categories.district')}
        title={t('filters.categories.district')}
        active={district !== null}
        footer={footer({ districts: [] })}
      >
        {() => (
          <div className="flex flex-wrap gap-2">
            {districts.data?.map((d) => (
              <Chip
                key={d.id}
                selected={filters.districts.includes(d.id)}
                onClick={() => {
                  set({ districts: toggle(filters.districts, d.id) });
                }}
              >
                {districtName(d, language)}
              </Chip>
            ))}
          </div>
        )}
      </Dropdown>

      <Dropdown
        label={area ?? t('filters.categories.area')}
        title={t('filters.categories.area')}
        active={area !== null}
        footer={footer({ minArea: null, maxArea: null })}
      >
        {() => (
          <fieldset className="space-y-3">
            <legend className="text-hint text-sm">{t('filters.areaHint')}</legend>
            <div className="flex gap-3">
              <NumberInput
                label={t('filters.min')}
                value={filters.minArea}
                onChange={(value) => {
                  set({ minArea: value });
                }}
              />
              <NumberInput
                label={t('filters.max')}
                value={filters.maxArea}
                onChange={(value) => {
                  set({ maxArea: value });
                }}
              />
            </div>
          </fieldset>
        )}
      </Dropdown>

      <Dropdown
        label={amenities ?? t('filters.categories.amenities')}
        title={t('filters.categories.amenities')}
        active={amenities !== null}
        footer={footer({ amenities: [] })}
      >
        {() => (
          <div className="space-y-3">
            <p className="text-hint text-sm">{t('filters.amenitiesHint')}</p>
            <AmenityCheckboxes
              value={filters.amenities}
              columns={1}
              onChange={(value) => {
                set({ amenities: value });
              }}
            />
          </div>
        )}
      </Dropdown>

      {activeFilterCount(filters) > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_FILTERS);
          }}
          className="h-10 shrink-0 rounded-full px-3 text-sm font-semibold whitespace-nowrap underline"
        >
          {t('filters.clearAll')}
        </button>
      )}
    </div>
  );
}
