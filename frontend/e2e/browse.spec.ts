import { RIVER_2BR, SEA_VIEW } from '../src/test/fixtures';
import { expect, test } from './fixtures';

test('browse the map, preview a listing and open its details', async ({ page }) => {
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Map of apartments in Da Nang' });
  await expect(page.getByText('3 apartments in this area')).toBeVisible();
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

test('filters apply to both map and list views', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('3 apartments in this area')).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: '2', exact: true }).click();
  await sheet.getByRole('button', { name: 'Show 1 apartment' }).click();

  await expect(page).toHaveURL('/?bedrooms=2');
  await expect(page.getByText('1 apartment in this area')).toBeVisible();
  const map = page.getByRole('region', { name: 'Map of apartments in Da Nang' });
  await expect(map.getByRole('button', { name: /M ₫/ })).toHaveCount(1);

  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.getByText('1 apartment', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(RIVER_2BR.title) })).toBeVisible();

  // Filters survive a reload because they live in the URL.
  await page.reload();
  await expect(page.getByRole('link', { name: new RegExp(RIVER_2BR.title) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeVisible();
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
  await expect(page.getByText('3 apartments in this area')).toBeVisible();
  await page.getByRole('button', { name: 'Русский' }).click();
  await expect(page.getByText('3 квартиры в этой области')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Карта' })).toBeVisible();
});
