import { useTranslation } from 'react-i18next';

import { CheckIcon } from '@/components/ui/icons';
import { groupAmenities } from '@/features/amenities/catalog';
import { amenityLabel, categoryLabel } from '@/features/amenities/labels';

/** A listing's amenities by category; the landlord's own ones under "Other". */
export function AmenityList({ amenities, custom }: { amenities: string[]; custom: string[] }) {
  const { t } = useTranslation();
  const groups = [
    ...groupAmenities(amenities).map(({ category, items }) => ({
      title: categoryLabel(t, category),
      labels: items.map((key) => amenityLabel(t, key)),
    })),
    ...(custom.length > 0 ? [{ title: t('amenities.other'), labels: custom }] : []),
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map(({ title, labels }) => (
        <div key={title}>
          <h3 className="text-hint mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
          <ul className="space-y-2">
            {labels.map((label) => (
              <li key={label} className="flex items-center gap-3">
                <CheckIcon width={18} height={18} className="text-success shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
