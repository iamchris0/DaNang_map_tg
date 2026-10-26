import { useState } from 'react';

import { CatalogHeader } from '@/features/catalog/CatalogHeader';
import { FilterBar } from '@/features/catalog/FilterBar';
import { ListPanel } from '@/features/catalog/ListPanel';
import { MapPanel } from '@/features/catalog/MapPanel';
import { ViewToggle } from '@/features/catalog/ViewToggle';
import { activeFilterCount } from '@/features/filters/filters';
import { FiltersSheet } from '@/features/filters/FiltersSheet';
import { useCatalogState } from '@/features/filters/useCatalogState';
import type { BBox } from '@/lib/geo';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

/**
 * Desktop: listings next to a sticky map, the list following the visible map area.
 * Phone: map or list, switched with a floating pill.
 */
export function CatalogPage() {
  const { filters, setFilters, resetFilters, view, setView, sort, setSort } = useCatalogState();
  // Rapid edits (typing a price) settle before hitting the API.
  const queryFilters = useDebouncedValue(filters, 350);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [mapBbox, setMapBbox] = useState<BBox | null>(null);
  const listBbox = useDebouncedValue(mapBbox, 300);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapMounted, setMapMounted] = useState(view === 'map');
  if (view === 'map' && !mapMounted) setMapMounted(true);
  const openFilters = () => {
    setFiltersOpen(true);
  };
  const active = activeFilterCount(filters);

  return (
    <div className="bg-bg flex h-full flex-col">
      <CatalogHeader filters={filters} onOpenFilters={openFilters} />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        activeFilters={active}
        onOpenFilters={openFilters}
      />
      <main className="relative min-h-0 flex-1">
        {isDesktop ? (
          <div className="flex h-full">
            <div className="h-full w-[58%] min-w-0">
              <ListPanel
                filters={queryFilters}
                bbox={listBbox}
                sort={sort}
                onSortChange={setSort}
                onReset={resetFilters}
              />
            </div>
            <div className="h-full flex-1 py-5 pr-10">
              <div className="h-full overflow-hidden rounded-2xl">
                <MapPanel
                  filters={queryFilters}
                  onReset={resetFilters}
                  onViewportChange={setMapBbox}
                  showCount={false}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
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
            <ViewToggle view={view} onChange={setView} />
          </>
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
