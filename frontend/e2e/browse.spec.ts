import { RIVER_2BR, SEA_VIEW } from '../src/test/fixtures';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/** Phones show the count on the map; desktop shows it above the list next to the map. */
async function expectAreaCount(page: Page, isMobile: boolean, count: number) {
  const text = isMobile
    ? `${count} apartments in this area`
    : `${count} apartments in this map area`;
  // First map render (lazy chunk + software WebGL) can be slow on CI machines.
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('browse the map, preview a listing and open its details', async ({ page, isMobile }) => {
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Map of apartments in Da Nang' });
  await expectAreaCount(page, isMobile, 3);
  // Real MapLibre canvas plus our HTML markers. The two beach listings are close
  // together, so at city zoom they form a cluster; tapping it zooms in and splits it.
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(map.getByRole('button', { name: /^16\.5M ₫/ })).toBeVisible();
  await map.getByRole('button', { name: '2 apartments, zoom in' }).click();
  await expect(map.getByRole('button', { name: /^12M ₫/ })).toBeVisible();
  await expect(map.getByRole('button', { name: /^7\.5M ₫, Studio, approximate/ })).toBeVisible();

  await map.getByRole('button', { name: /^12M ₫/ }).click();
  const preview = page.getByRole('dialog', { name: SEA_VIEW.title });
  await expect(preview).toBeVisible();
  await expect(preview.getByText('12,000,000 ₫')).toBeVisible();

  await preview.getByRole('link', { name: 'View details' }).click();
  await expect(page).toHaveURL(`/apartments/${SEA_VIEW.id}`);
  await expect(page.getByRole('heading', { level: 1, name: SEA_VIEW.title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contact agent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contact administrator' })).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL('/');
  await expect(map.getByRole('button', { name: /^12M ₫/ })).toBeVisible();
});

test('filters apply to both map and list views', async ({ page, isMobile }) => {
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Map of apartments in Da Nang' });
  await expectAreaCount(page, isMobile, 3);

  // Popover on desktop, bottom sheet on phones: both are dialogs named after the category.
  await page.getByRole('button', { name: 'Bedrooms', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Bedrooms' });
  await panel.getByRole('button', { name: '2', exact: true }).click();
  await panel.getByRole('button', { name: 'Show 1 apartment' }).click();

  await expect(page).toHaveURL('/?bedrooms=2');
  await expect(map.getByRole('button', { name: /M ₫/ })).toHaveCount(1);
  // The trigger now shows the selection.
  await expect(page.getByRole('button', { name: '2', exact: true })).toBeVisible();

  // Phones switch to the list; desktop shows it next to the map.
  if (isMobile) await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(RIVER_2BR.title) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(SEA_VIEW.title) })).toHaveCount(0);

  // Filters survive a reload because they live in the URL.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible();
});

test('deep links open the listing and unknown ids are handled', async ({ page }) => {
  await page.goto(`/?tgWebAppStartParam=${RIVER_2BR.id}`);
  await expect(page).toHaveURL(`/apartments/${RIVER_2BR.id}`);
  await expect(page.getByRole('heading', { level: 1, name: RIVER_2BR.title })).toBeVisible();

  await page.goto('/apartments/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toHaveText('This listing does not exist.');
  await page.getByRole('link', { name: 'Browse apartments' }).click();
  await expect(page).toHaveURL('/');
});

test('switching language translates the interface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Price' })).toBeVisible();
  await page.getByRole('button', { name: 'Русский' }).click();
  await expect(page.getByRole('button', { name: 'Цена' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Спальни' })).toBeVisible();
});
