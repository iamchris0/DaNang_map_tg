import { useState } from 'react';

import { CatalogHeader } from '@/features/catalog/CatalogHeader';
import { ListPanel } from '@/features/catalog/ListPanel';
import { MapPanel } from '@/features/catalog/MapPanel';
import { activeFilterCount } from '@/features/filters/filters';
import { FiltersSheet } from '@/features/filters/FiltersSheet';
import { useCatalogState } from '@/features/filters/useCatalogState';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export function CatalogPage() {
  const { filters, setFilters, resetFilters, view, setView, sort, setSort } = useCatalogState();
  // Rapid edits (typing a price) settle before hitting the API.
  const queryFilters = useDebouncedValue(filters, 350);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapMounted, setMapMounted] = useState(view === 'map');
  if (view === 'map' && !mapMounted) setMapMounted(true);

  return (
    <div className="flex h-full flex-col">
      <CatalogHeader
        view={view}
        onViewChange={setView}
        activeFilters={activeFilterCount(filters)}
        onOpenFilters={() => {
          setFiltersOpen(true);
        }}
      />
      <main className="relative min-h-0 flex-1">
        {/* The map stays mounted once opened so switching views keeps its position. */}
        {mapMounted && (
          <div className={view === 'map' ? 'h-full' : 'hidden'}>
            <MapPanel filters={queryFilters} onReset={resetFilters} />
          </div>
        )}
        {view === 'list' && (
          <ListPanel
            filters={queryFilters}
            sort={sort}
            onSortChange={setSort}
            onReset={resetFilters}
          />
        )}
      </main>
      <FiltersSheet
        open={filtersOpen}
        onClose={() => {
          setFiltersOpen(false);
        }}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
      />
    </div>
  );
}
