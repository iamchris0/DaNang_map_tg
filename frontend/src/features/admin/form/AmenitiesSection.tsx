import { useState } from 'react';
import { type Control, useController } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { AmenityCheckboxes } from '@/features/amenities/AmenityCheckboxes';
import { CUSTOM_AMENITY_MAX_LENGTH, MAX_CUSTOM_AMENITIES } from '@/features/amenities/catalog';

import type { ApartmentFormValues } from './schema';

/** Amenities from the list, plus the landlord's own (free text, shown under "Other"). */
export function AmenitiesSection({ control }: { control: Control<ApartmentFormValues> }) {
  const { t } = useTranslation();
  const amenities = useController({ control, name: 'amenities' });
  const custom = useController({ control, name: 'custom_amenities' });
  const [draft, setDraft] = useState('');

  const own = custom.field.value;
  const text = draft.replace(/\s+/g, ' ').trim();
  const duplicate = own.some((item) => item.toLowerCase() === text.toLowerCase());
  const full = own.length >= MAX_CUSTOM_AMENITIES;
  const add = () => {
    if (!text || duplicate || full) return;
    custom.field.onChange([...own, text]);
    setDraft('');
  };

  return (
    <div className="space-y-6">
      <AmenityCheckboxes value={amenities.field.value} onChange={amenities.field.onChange} />

      <div className="space-y-2">
        <label htmlFor="custom-amenity" className="block text-sm font-semibold">
          {t('admin.form.customAmenities')}
        </label>
        <div className="flex gap-2">
          <input
            id="custom-amenity"
            value={draft}
            maxLength={CUSTOM_AMENITY_MAX_LENGTH}
            disabled={full}
            placeholder={t('admin.form.customAmenityPlaceholder')}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault(); // don't submit the form
                add();
              }
            }}
            className="border-line bg-bg focus:border-fg min-h-12 w-full rounded-xl border px-4 outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={add}
            disabled={!text || duplicate || full}
            className="bg-fg text-bg flex min-h-12 shrink-0 items-center gap-1 rounded-xl px-4 font-semibold disabled:opacity-40"
          >
            <PlusIcon width={18} height={18} />
            {t('admin.form.addAmenity')}
          </button>
        </div>
        <p className="text-hint text-sm">
          {t('admin.form.customAmenityHint', {
            max: MAX_CUSTOM_AMENITIES,
            length: CUSTOM_AMENITY_MAX_LENGTH,
          })}
        </p>
        {own.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t('amenities.other')}>
            {own.map((item) => (
              <li
                key={item}
                className="border-line bg-surface flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
              >
                {item}
                <button
                  type="button"
                  aria-label={t('admin.form.removeAmenity', { name: item })}
                  onClick={() => {
                    custom.field.onChange(own.filter((value) => value !== item));
                  }}
                  className="hover:bg-line flex size-7 items-center justify-center rounded-full"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
