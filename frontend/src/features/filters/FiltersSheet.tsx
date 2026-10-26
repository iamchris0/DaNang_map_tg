import { useTranslation } from 'react-i18next';

import { useApartmentCount, useDistricts } from '@/api/catalog';
import { Chip } from '@/components/ui/Chip';
import { NumberInput } from '@/components/ui/NumberInput';
import { Sheet } from '@/components/ui/Sheet';
import { districtName } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { BEDROOM_OPTIONS, type CatalogFilters } from './filters';

const MILLION = 1_000_000;

interface Props {
  open: boolean;
  onClose: () => void;
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  onReset: () => void;
}

const toggle = (values: number[], value: number) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value].sort();

const toMillions = (vnd: number | null) => (vnd === null ? null : vnd / MILLION);
const fromMillions = (millions: number | null) =>
  millions === null ? null : Math.round(millions * MILLION);

export function FiltersSheet({ open, onClose, filters, onChange, onReset }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const districts = useDistricts();
  const count = useApartmentCount(useDebouncedValue(filters, 300));
  const set = (patch: Partial<CatalogFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const total = count.data;
  const showLabel =
    total === undefined
      ? t('common.loading')
      : total === 0
        ? t('filters.showNone')
        : t('filters.show', { count: total });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('filters.title')}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-accent min-h-12 rounded-xl px-4 font-medium"
          >
            {t('filters.reset')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-accent text-accent-fg min-h-12 flex-1 rounded-xl font-semibold"
          >
            {showLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-medium">{t('filters.price')}</legend>
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

        <fieldset>
          <legend className="mb-2 font-medium">{t('filters.bedrooms')}</legend>
          <div className="flex flex-wrap gap-2">
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
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-medium">{t('filters.district')}</legend>
          <div className="flex flex-wrap gap-2">
            {districts.data?.map((district) => (
              <Chip
                key={district.id}
                selected={filters.districts.includes(district.id)}
                onClick={() => {
                  set({ districts: toggle(filters.districts, district.id) });
                }}
              >
                {districtName(district, language)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-medium">{t('filters.area')}</legend>
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
      </div>
    </Sheet>
  );
}
