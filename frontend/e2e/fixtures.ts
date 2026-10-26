import { test as base, type Page } from '@playwright/test';

import { ALL_APARTMENTS, DISTRICTS, toCard } from '../src/test/fixtures';

const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8eef3' } }],
};

/** Serve the public API from fixtures; filters on bedrooms and price like the backend. */
async function mockBackend(page: Page) {
  await page.route('https://telegram.org/**', (route) => route.fulfill({ body: '' }));
  await page.route('**/e2e/map-style.json', (route) => route.fulfill({ json: BLANK_STYLE }));
  await page.route('**/img/*.png', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#7aa"/></svg>',
    }),
  );
  // Only real API calls; Vite also serves source modules under /src/api/.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const url = new URL(route.request().url());
      const params = url.searchParams;
      const bedrooms = params.getAll('bedrooms').map(Number);
      const maxPrice = Number(params.get('max_price') ?? Infinity);
      const matching = ALL_APARTMENTS.filter(
        (a) =>
          a.price_vnd <= maxPrice &&
          (!bedrooms.length ||
            bedrooms.some((b) => (b === 3 ? a.bedrooms >= 3 : a.bedrooms === b))),
      );
      if (url.pathname === '/api/districts') return route.fulfill({ json: DISTRICTS });
      if (url.pathname === '/api/apartments/map') {
        return route.fulfill({
          json: { markers: matching, total: matching.length, truncated: false },
        });
      }
      if (url.pathname === '/api/apartments') {
        return route.fulfill({
          json: { items: matching.map(toCard), total: matching.length, page: 1, page_size: 20 },
        });
      }
      const id = url.pathname.split('/').at(-1);
      const found = ALL_APARTMENTS.find((a) => a.id === id);
      return found
        ? route.fulfill({ json: found })
        : route.fulfill({
            status: 404,
            json: { error: { code: 'listing_not_found', message: 'Not found' } },
          });
    },
  );
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    await mockBackend(page);
    await provide(page);
  },
});
export { expect } from '@playwright/test';
