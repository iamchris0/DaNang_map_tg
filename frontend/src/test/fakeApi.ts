import type { ApartmentDetail } from '@/api/types';

import { ALL_APARTMENTS, DISTRICTS, toCard } from './fixtures';

interface FakeApiOptions {
  apartments?: ApartmentDetail[];
  /** Per-id error responses for the detail endpoint, e.g. { id: [410, 'listing_unavailable'] }. */
  detailErrors?: Record<string, [number, string]>;
  /** Language saved in the signed-in user's profile (e.g. picked in the bot). */
  preferredLanguage?: 'en' | 'ru' | 'vi' | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function matches(apartment: ApartmentDetail, params: URLSearchParams): boolean {
  const minPrice = params.get('min_price');
  const maxPrice = params.get('max_price');
  const bedrooms = params.getAll('bedrooms').map(Number);
  const districts = params.getAll('district').map(Number);
  if (minPrice && apartment.price_vnd < Number(minPrice)) return false;
  if (maxPrice && apartment.price_vnd > Number(maxPrice)) return false;
  if (
    bedrooms.length &&
    !bedrooms.some((b) => (b === 3 ? apartment.bedrooms >= 3 : apartment.bedrooms === b))
  ) {
    return false;
  }
  if (districts.length && !districts.includes(apartment.district.id)) return false;
  const amenities = params.getAll('amenities');
  if (amenities.some((key) => !apartment.amenities.includes(key))) return false;
  return true;
}

/** In-memory implementation of the public API with request logging. */
export function installFakeApi({
  apartments = ALL_APARTMENTS,
  detailErrors = {},
  preferredLanguage = null,
}: FakeApiOptions = {}) {
  const requests: { method: string; url: URL; body: unknown; headers: Headers }[] = [];

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    requests.push({ method, url, body, headers: new Headers(init?.headers) });
    const params = url.searchParams;
    const path = url.pathname;
    const matching = apartments.filter((a) => matches(a, params));

    if (path === '/api/districts') return Promise.resolve(json(DISTRICTS));
    if (path === '/api/apartments/map') {
      return Promise.resolve(
        json({
          markers: matching.map(
            ({ id, latitude, longitude, price_vnd, bedrooms, location_precision }) => ({
              id,
              latitude,
              longitude,
              price_vnd,
              bedrooms,
              location_precision,
            }),
          ),
          total: matching.length,
          truncated: false,
        }),
      );
    }
    if (path === '/api/apartments') {
      const page = Number(params.get('page') ?? 1);
      const pageSize = Number(params.get('page_size') ?? 20);
      const items = matching.slice((page - 1) * pageSize, page * pageSize).map(toCard);
      return Promise.resolve(json({ items, total: matching.length, page, page_size: pageSize }));
    }
    const detail = /^\/api\/apartments\/([^/]+)$/.exec(path);
    if (detail?.[1]) {
      const error = detailErrors[detail[1]];
      if (error)
        return Promise.resolve(json({ error: { code: error[1], message: 'x' } }, error[0]));
      const found = apartments.find((a) => a.id === detail[1]);
      return Promise.resolve(
        found ? json(found) : json({ error: { code: 'listing_not_found', message: 'x' } }, 404),
      );
    }
    if (path === '/api/auth/telegram' && method === 'POST') {
      return Promise.resolve(
        json({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_at: '2099-01-01T00:00:00Z',
          start_param: null,
          user: {
            id: 'u1',
            telegram_user_id: 42,
            username: 'tester',
            display_name: 'Tester',
            preferred_language: preferredLanguage,
            is_admin: false,
            role: 'user',
          },
        }),
      );
    }
    return Promise.resolve(json({ error: { code: 'not_found', message: 'Not Found' } }, 404));
  });

  return {
    fetchMock,
    requests,
    /** Query strings sent to a given path. */
    queries: (path: string) =>
      requests.filter((r) => r.url.pathname === path).map((r) => r.url.searchParams),
  };
}
