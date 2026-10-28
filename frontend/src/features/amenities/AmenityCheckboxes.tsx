import { useTranslation } from 'react-i18next';

import { AMENITY_CATEGORIES, sortAmenities } from './catalog';
import { amenityLabel, categoryLabel } from './labels';

interface Props {
  value: readonly string[];
  onChange: (value: string[]) => void;
  /**
   * `form`: categories side by side on wide screens (one column of items each), two columns
   * of items on phones. `list`: one column, for narrow dropdowns.
   */
  layout?: 'form' | 'list';
}

/** Amenities as checkboxes, one group per category. Several can be selected. */
export function AmenityCheckboxes({ value, onChange, layout = 'form' }: Props) {
  const { t } = useTranslation();
  const selected = new Set(value);
  const toggle = (key: string) => {
    onChange(selected.has(key) ? value.filter((v) => v !== key) : sortAmenities([...value, key]));
  };

  return (
    <div
      className={
        layout === 'form'
          ? 'grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
          : 'space-y-5'
      }
    >
      {AMENITY_CATEGORIES.map(({ category, items }) => (
        <fieldset key={category}>
          <legend className="text-hint mb-2 text-xs font-semibold tracking-wide uppercase">
            {categoryLabel(t, category)}
          </legend>
          <div className={`grid gap-x-3 ${layout === 'form' ? 'grid-cols-2 sm:grid-cols-1' : ''}`}>
            {items.map((key) => (
              <label
                key={key}
                className="hover:bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm sm:text-base"
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
