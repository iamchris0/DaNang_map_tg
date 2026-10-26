import { DISTRICTS } from '../src/test/fixtures';
import { expect, test } from './fixtures';

/** Small stateful admin backend for the browser (the real one has its own test suite). */
test.beforeEach(async ({ page }) => {
  const apartments = new Map<string, Record<string, unknown>>();
  let signedIn = false;
  const admin = {
    id: 'u1',
    telegram_user_id: 1001,
    username: 'boss',
    display_name: 'Boss',
    preferred_language: null,
    is_admin: true,
  };
  const detail = (a: Record<string, unknown>) => {
    const images = a.images as unknown[];
    const missing = ['price_vnd', 'district_id', 'bedrooms', 'latitude', 'location_precision']
      .filter((field) => a[field] === null)
      .concat(images.length ? [] : ['images']);
    return {
      ...a,
      district: DISTRICTS.find((d) => d.id === a.district_id) ?? null,
      created_at: '2026-10-26T00:00:00Z',
      updated_at: '2026-10-26T00:00:00Z',
      missing_fields: missing,
      latest_publication: null,
    };
  };

  await page.route(
    (url) => url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      if (path === '/api/auth/dev') {
        signedIn = true;
        return route.fulfill({
          json: {
            access_token: 't',
            token_type: 'bearer',
            expires_at: '2099-01-01T00:00:00Z',
            user: admin,
            start_param: null,
          },
        });
      }
      if (path === '/api/auth/me') {
        return signedIn
          ? route.fulfill({ json: admin })
          : route.fulfill({ status: 401, json: { error: { code: 'unauthorized', message: '' } } });
      }
      if (path === '/api/admin/dashboard') {
        const all = [...apartments.values()];
        const n = (s: string) => all.filter((a) => a.status === s).length;
        return route.fulfill({
          json: {
            total: all.length,
            available: n('available'),
            draft: n('draft'),
            rented: n('rented'),
            archived: n('archived'),
          },
        });
      }
      if (path === '/api/admin/geocode') {
        return route.fulfill({
          json: [
            {
              label: 'My Khe Beach, Son Tra',
              latitude: 16.0612,
              longitude: 108.2475,
              kind: 'beach',
            },
          ],
        });
      }
      if (path === '/api/admin/apartments' && method === 'GET') {
        const items = [...apartments.values()].map((a) => ({
          id: a.id,
          status: a.status,
          title: a.title,
          price_vnd: a.price_vnd,
          district: null,
          cover_image: (a.images as unknown[])[0] ?? null,
          updated_at: '2026-10-26T00:00:00Z',
          publication_status: null,
        }));
        return route.fulfill({ json: { items, total: items.length, page: 1, page_size: 20 } });
      }
      if (path === '/api/admin/apartments' && method === 'POST') {
        const id = '99999999-9999-4999-8999-999999999999';
        apartments.set(id, {
          ...(request.postDataJSON() as object),
          id,
          status: 'draft',
          images: [],
        });
        return route.fulfill({ status: 201, json: detail(apartments.get(id)!) });
      }
      const [, id, rest = ''] = /^\/api\/admin\/apartments\/([^/]+)(.*)$/.exec(path) ?? [];
      const apartment = id ? apartments.get(id) : undefined;
      if (!apartment)
        return route.fulfill({
          status: 404,
          json: { error: { code: 'listing_not_found', message: '' } },
        });
      if (rest === '/images' && method === 'POST') {
        expect(request.headers()['content-type']).toContain('multipart/form-data');
        const image = {
          id: 'img1',
          url: '/img/one.png',
          thumb_url: '/img/one-sm.png',
          width: 4,
          height: 3,
        };
        (apartment.images as unknown[]).push(image);
        return route.fulfill({ status: 201, json: image });
      }
      if (rest === '/status') {
        apartment.status = (request.postDataJSON() as { status: string }).status;
        return route.fulfill({ json: detail(apartment) });
      }
      return route.fulfill({ json: detail(apartment) });
    },
  );
});

test('an administrator creates, illustrates and publishes a listing', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Telegram user ID').fill('1001');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Add apartment' }).click();

  await page.getByLabel('Title').fill('E2E beach flat');
  await page.getByLabel('Monthly rent, ₫').fill('12000000');
  await page.getByLabel('District').selectOption({ label: 'Sơn Trà' });
  await page.getByLabel('Bedrooms').selectOption('1');
  await page.getByRole('searchbox', { name: 'Search address or landmark' }).fill('My Khe');
  await page.getByRole('button', { name: 'My Khe Beach, Son Tra' }).click();
  await expect(page.getByTestId('coordinates')).toHaveText('16.06120, 108.24750');
  await expect(page.getByRole('radio', { name: 'Approximate area' })).toBeChecked();
  // Real MapLibre picker with a draggable pin.
  await expect(page.getByTestId('location-picker').locator('.maplibregl-marker')).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/admin\/apartments\/9{8}-/);
  await expect(page.getByText('To publish, add: a photo')).toBeVisible();

  await page.getByTestId('photo-input').setInputFiles({
    name: 'living-room.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  });
  await expect(page.getByText('1 photo uploaded')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
  await expect(page.getByText('Cover', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Make available' }).click();
  await expect(page.getByText('Status changed to “Available”')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Status' }).getByText('Available')).toBeVisible();
});
