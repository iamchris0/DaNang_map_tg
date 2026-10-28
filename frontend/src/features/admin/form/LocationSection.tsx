import { lazy, type ReactNode, Suspense, useState } from 'react';
import { type Control, Controller, type UseFormRegister, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useGeocode } from '@/api/admin';
import type { GeocodeResult } from '@/api/types';
import { SearchIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { FormSection } from './fields';
import type { ApartmentFormValues } from './schema';

const LocationPickerMap = lazy(() => import('./LocationPickerMap'));

interface Props {
  control: Control<ApartmentFormValues>;
  /** Address / location description field, shown inside this tile. */
  address: ReactNode;
  register: UseFormRegister<ApartmentFormValues>;
  onPickResult: (result: GeocodeResult) => void;
  locationError: string | null;
  /** Grid placement in the form. */
  className?: string;
  precisionError: string | null;
}

function GeocodeSearch({ onPick }: { onPick: (result: GeocodeResult) => void }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(query.trim(), 500);
  const search = useGeocode(debounced, i18n.resolvedLanguage ?? 'en');
  const showResults = open && debounced.length >= 3;

  return (
    <div className="relative">
      <label className="border-hint/30 bg-bg flex items-center gap-2 rounded-xl border px-3">
        <SearchIcon className="text-hint" />
        <span className="sr-only">{t('admin.location.search')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('admin.location.search')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          className="min-h-11 flex-1 bg-transparent outline-none"
        />
        {search.isFetching && <Spinner className="size-4" />}
      </label>
      {showResults && !search.isFetching && (
        <ul className="bg-bg absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl shadow-lg">
          {search.isError ? (
            <li className="text-hint p-3 text-sm">{t('admin.location.searchFailed')}</li>
          ) : search.data?.length === 0 ? (
            <li className="text-hint p-3 text-sm">{t('admin.location.noResults')}</li>
          ) : (
            search.data?.map((result) => (
              <li key={`${result.latitude},${result.longitude}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(result);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="hover:bg-surface w-full px-3 py-2.5 text-left text-sm"
                >
                  {result.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function LocationSection({
  control,
  address,
  register,
  onPickResult,
  locationError,
  precisionError,
  className = '',
}: Props) {
  const { t } = useTranslation();
  const [fromSearch, setFromSearch] = useState(false);
  const precision = useWatch({ control, name: 'location_precision' });

  return (
    <FormSection title={t('admin.form.sections.location')} className={className}>
      {/* Phones: search, map, then precision and address. Desktop: map on the left. */}
      <div className="grid gap-4 lg:grid-cols-[7fr_5fr] lg:grid-rows-[auto_1fr] lg:gap-x-6">
        <div className="space-y-2 lg:col-start-2 lg:row-start-1">
          <GeocodeSearch
            onPick={(result) => {
              setFromSearch(true);
              onPickResult(result);
            }}
          />
          <p className="text-hint text-sm">{t('admin.location.hint')}</p>
          {fromSearch && <p className="text-sm text-amber-600">{t('admin.location.fromSearch')}</p>}
        </div>
        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <div className="space-y-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <Suspense fallback={<div className="bg-bg h-72 rounded-xl lg:h-96" />}>
                <LocationPickerMap
                  value={field.value}
                  onChange={(value) => {
                    setFromSearch(false);
                    field.onChange(value);
                  }}
                />
              </Suspense>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span data-testid="coordinates" className="text-hint">
                  {field.value
                    ? `${field.value.latitude.toFixed(5)}, ${field.value.longitude.toFixed(5)}`
                    : t('admin.location.noPin')}
                </span>
                {field.value && (
                  <button
                    type="button"
                    className="text-danger font-medium"
                    onClick={() => {
                      field.onChange(null);
                    }}
                  >
                    {t('admin.location.clear')}
                  </button>
                )}
              </div>
              {locationError && <p className="text-danger text-sm">{locationError}</p>}
            </div>
          )}
        />
        <div className="space-y-4 lg:col-start-2 lg:row-start-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">{t('admin.location.precision')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['exact', 'approximate'] as const).map((value) => (
                <label
                  key={value}
                  className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                    precision === value
                      ? 'border-fg shadow-[inset_0_0_0_1px_var(--app-text)]'
                      : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    value={value}
                    className="size-4 accent-[var(--app-text)]"
                    {...register('location_precision')}
                  />
                  {t(`admin.location.${value}`)}
                </label>
              ))}
            </div>
            {precision === 'approximate' && (
              <p className="text-hint text-sm">{t('admin.location.approximateHint')}</p>
            )}
            {precisionError && <p className="text-danger text-sm">{precisionError}</p>}
          </fieldset>
          {address}
        </div>
      </div>
    </FormSection>
  );
}
