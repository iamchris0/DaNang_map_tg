import { useTranslation } from 'react-i18next';

import { ListIcon, MapIcon } from '@/components/ui/icons';
import type { CatalogView } from '@/features/filters/useCatalogState';

/** Floating pill on phones that switches between the map and the list. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: CatalogView;
  onChange: (view: CatalogView) => void;
}) {
  const { t } = useTranslation();
  const next: CatalogView = view === 'map' ? 'list' : 'map';
  const Icon = next === 'map' ? MapIcon : ListIcon;
  return (
    <button
      type="button"
      onClick={() => {
        onChange(next);
      }}
      className="bg-ink text-ink-fg shadow-card absolute bottom-[calc(1.25rem+var(--safe-bottom))] left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform active:scale-95"
    >
      {next === 'map' ? t('catalog.showMap') : t('catalog.showList')}
      <Icon width={18} height={18} />
    </button>
  );
}
