import { useTranslation } from 'react-i18next';

import { AMENITY_CATEGORIES, sortAmenities } from './catalog';
import { amenityLabel, categoryLabel } from './labels';

interface Props {
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Two columns where there is room (the admin form); one in narrow dropdowns. */
  columns?: 1 | 2;
}

/** Amenities as checkboxes, one group per category. Several can be selected. */
export function AmenityCheckboxes({ value, onChange, columns = 2 }: Props) {
  const { t } = useTranslation();
  const selected = new Set(value);
  const toggle = (key: string) => {
    onChange(selected.has(key) ? value.filter((v) => v !== key) : sortAmenities([...value, key]));
  };

  return (
    <div className="space-y-5">
      {AMENITY_CATEGORIES.map(({ category, items }) => (
        <fieldset key={category} className="space-y-2">
          <legend className="text-hint mb-2 text-xs font-semibold tracking-wide uppercase">
            {categoryLabel(t, category)}
          </legend>
          <div className={`grid gap-x-4 gap-y-1 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
            {items.map((key) => (
              <label
                key={key}
                className="hover:bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => {
                    toggle(key);
                  }}
                  className="accent-fg size-5 shrink-0"
                />
                <span>{amenityLabel(t, key)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
