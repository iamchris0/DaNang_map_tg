import type {
  AdminApartment,
  AdminListItem,
  ApartmentInput,
  ApartmentStatus,
  GeocodeResult,
  Image,
  Publication,
} from '@/api/types';
import { setSessionToken } from '@/api/session';

import { DISTRICTS } from './fixtures';

const REQUIRED: (keyof ApartmentInput)[] = [
  'title',
  'price_vnd',
  'district_id',
  'bedrooms',
  'latitude',
  'longitude',
  'location_precision',
];
const TRANSITIONS: Record<ApartmentStatus, ApartmentStatus[]> = {
  draft: ['available', 'archived'],
  available: ['rented', 'archived'],
  rented: ['available', 'archived'],
  archived: ['available'],
};

export const GEOCODE_RESULTS: GeocodeResult[] = [
  {
    label: 'Han Market, Tran Phu, Hai Chau',
    latitude: 16.0684,
    longitude: 108.2245,
    kind: 'marketplace',
  },
];

interface Stored extends ApartmentInput {
  id: string;
  status: ApartmentStatus;
  images: Image[];
  updated_at: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: string, details?: unknown): Response {
  return json({ error: { code, message: code, details } }, status);
}

export function makeImage(id: string): Image {
  return { id, url: `/img/${id}.webp`, thumb_url: `/img/${id}-sm.webp`, width: 4, height: 3 };
}

export function blankInput(): ApartmentInput {
  return {
    title: null,
    description: null,
    price_vnd: null,
    area_sqm: null,
    bedrooms: null,
    bathrooms: null,
    district_id: null,
    address: null,
    latitude: null,
    longitude: null,
    location_precision: null,
    deposit_vnd: null,
    deposit_months: null,
    minimum_rental_months: null,
    rental_conditions: null,
    amenities: [],
    custom_amenities: [],
    agent_contact_type: null,
    agent_contact_value: null,
  };
}

/**
 * Stateful in-memory admin API (signed-in administrator). Mirrors the backend's lifecycle
 * rules closely enough to exercise the UI; the backend has its own exhaustive tests.
 */
/** The only code the fake accepts on POST /api/auth/link (the bot's /login link). */
export const VALID_LINK_CODE = 'valid-one-time-code-0123456789';

export function installFakeAdminApi(
  initial: Partial<Stored>[] = [],
  {
    isAdmin = true,
    role = isAdmin ? 'admin' : 'user',
    signedIn = true,
  }: { isAdmin?: boolean; role?: 'user' | 'landlord' | 'admin'; signedIn?: boolean } = {},
) {
  if (signedIn) setSessionToken('test-session');
  const usedCodes = new Set<string>();
  const store = new Map<string, Stored>();
  let counter = 0;
  const add = (data: Partial<Stored>) => {
    counter += 1;
    const id = data.id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    const apartment: Stored = {
      ...blankInput(),
      status: 'draft',
      images: [],
      updated_at: '2026-10-20T10:00:00Z',
      ...data,
      id,
    };
    store.set(id, apartment);
    return apartment;
  };
  initial.forEach(add);

  const missing = (a: Stored) => [
    ...REQUIRED.filter((field) => a[field] === null),
    ...(a.images.length ? [] : ['images']),
  ];
  const toAdmin = (a: Stored): AdminApartment => ({
    ...a,
    district: DISTRICTS.find((d) => d.id === a.district_id) ?? null,
    created_at: a.updated_at,
    missing_fields: missing(a),
    latest_publication: null,
  });
  const toListItem = (a: Stored): AdminListItem => ({
    id: a.id,
    status: a.status,
    title: a.title,
    price_vnd: a.price_vnd,
    district: DISTRICTS.find((d) => d.id === a.district_id) ?? null,
    cover_image: a.images[0] ?? null,
    updated_at: a.updated_at,
    publication_status: null,
  });

  const requests: { method: string; path: string; body: unknown; headers: Headers }[] = [];

  // Telegram publishing: outcomes for the next publish calls ('network' = connection lost
  // after the server stored the result), publications per idempotency key.
  const telegram = {
    configured: true,
    outcomes: [] as ('succeeded' | 'failed' | 'unknown' | 'network')[],
    publications: [] as (Publication & { apartment_id: string })[],
    byKey: new Map<string, Publication & { apartment_id: string }>(),
  };
  const livePublication = (apartmentId: string) =>
    telegram.publications.find((p) => p.apartment_id === apartmentId && p.status !== 'failed') ??
    null;

  const handle = (method: string, url: URL, body: unknown, headers: Headers): Response => {
    const path = url.pathname;
    requests.push({ method, path, body, headers });
    const me = {
      id: 'admin-user',
      telegram_user_id: 1001,
      username: 'boss',
      display_name: 'Boss',
      preferred_language: null,
      is_admin: isAdmin,
      role,
    };
    if (path === '/api/auth/link' && method === 'POST') {
      const { code } = body as { code: string };
      if (code !== VALID_LINK_CODE || usedCodes.has(code)) {
        return error(401, 'invalid_login_link');
      }
      usedCodes.add(code);
      return json({
        access_token: 'link-session',
        token_type: 'bearer',
        expires_at: '2030-01-01T00:00:00Z',
        user: me,
        start_param: null,
      });
    }
    if (path === '/api/auth/me') {
      return json(me);
    }
    if (path === '/api/districts') return json(DISTRICTS);
    if (path === '/api/admin/geocode') return json(GEOCODE_RESULTS);
    if (path === '/api/admin/dashboard') {
      const all = [...store.values()];
      const count = (status: ApartmentStatus) => all.filter((a) => a.status === status).length;
      return json({
        total: all.length,
        available: count('available'),
        draft: count('draft'),
        rented: count('rented'),
        archived: count('archived'),
      });
    }
    if (path === '/api/admin/apartments' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() ?? '';
      const status = url.searchParams.get('status');
      const items = [...store.values()]
        .filter(
          (a) =>
            (!q || (a.title ?? '').toLowerCase().includes(q)) && (!status || a.status === status),
        )
        .map(toListItem);
      return json({ items, total: items.length, page: 1, page_size: 20 });
    }
    if (path === '/api/admin/apartments' && method === 'POST') {
      return json(toAdmin(add({ ...(body as ApartmentInput), status: 'draft' })), 201);
    }
    const match = /^\/api\/admin\/apartments\/([^/]+)(\/.*)?$/.exec(path);
    const apartment = match?.[1] ? store.get(match[1]) : undefined;
    if (!apartment) return error(404, 'listing_not_found');
    const rest = match?.[2] ?? '';

    if (rest === '' && method === 'GET') return json(toAdmin(apartment));
    if (rest === '' && method === 'PATCH') {
      Object.assign(apartment, body);
      if (apartment.status !== 'draft' && missing(apartment).length) {
        return error(422, 'listing_incomplete', { missing_fields: missing(apartment) });
      }
      return json(toAdmin(apartment));
    }
    if (rest === '' && method === 'DELETE') {
      store.delete(apartment.id);
      return json(null, 204);
    }
    if (rest === '/status') {
      const target = (body as { status: ApartmentStatus }).status;
      if (target !== apartment.status && !TRANSITIONS[apartment.status].includes(target)) {
        return error(409, 'invalid_status_transition');
      }
      if (target === 'available' && missing(apartment).length) {
        return error(422, 'listing_incomplete', { missing_fields: missing(apartment) });
      }
      apartment.status = target;
      return json(toAdmin(apartment));
    }
    if (rest === '/telegram-preview') {
      const blockers = [
        ...(telegram.configured ? [] : ['telegram_not_configured']),
        ...(apartment.status === 'available' ? [] : ['listing_not_available']),
        ...(livePublication(apartment.id) ? ['already_published'] : []),
      ];
      return json({
        caption_html: `🏠 <b>${apartment.title ?? ''}</b>\n\n💰 Rent: 12,000,000 VND/month\n\n📲 <a href="https://t.me/DaNangAptBot/app?startapp=${apartment.id}">View details and location</a>`,
        caption_length: 120,
        caption_limit: 1024,
        photo_urls: apartment.images.map((image) => image.thumb_url),
        channel_id: '@danang_rent',
        language: 'en',
        can_publish: blockers.length === 0,
        blockers,
        live_publication: livePublication(apartment.id),
      });
    }
    if (rest === '/telegram-publications') {
      return json(
        telegram.publications
          .filter((p) => p.apartment_id === apartment.id)
          .slice()
          .reverse(),
      );
    }
    if (rest === '/publish-telegram') {
      const key = headers.get('Idempotency-Key') ?? '';
      const replay = telegram.byKey.get(key);
      if (replay) return json(replay);
      if (livePublication(apartment.id)) return error(409, 'already_published');
      const outcome = telegram.outcomes.shift() ?? 'succeeded';
      const stored = outcome === 'network' ? 'succeeded' : outcome;
      const publication = {
        apartment_id: apartment.id,
        id: `pub-${telegram.publications.length + 1}`,
        status: stored,
        telegram_channel_id: '@danang_rent',
        telegram_message_id: stored === 'succeeded' ? 501 : null,
        post_url: stored === 'succeeded' ? 'https://t.me/danang_rent/501' : null,
        error_code:
          stored === 'failed' ? 'bot_not_admin' : stored === 'unknown' ? 'unconfirmed' : null,
        error_message: null,
        published_by: 'Boss',
        created_at: '2026-10-26T10:00:00Z',
        published_at: stored === 'succeeded' ? '2026-10-26T10:00:00Z' : null,
      } satisfies Publication & { apartment_id: string };
      telegram.publications.push(publication);
      telegram.byKey.set(key, publication);
      if (outcome === 'network') throw new TypeError('Failed to fetch');
      return json(publication);
    }
    const resolveMatch = /^\/telegram-publications\/(.+)\/resolve$/.exec(rest);
    if (resolveMatch) {
      const publication = telegram.publications.find((p) => p.id === resolveMatch[1]);
      if (!publication || publication.status !== 'unknown') {
        return error(409, 'publication_not_unconfirmed');
      }
      publication.status = (body as { was_published: boolean }).was_published
        ? 'succeeded'
        : 'failed';
      publication.error_code = publication.status === 'failed' ? 'not_published' : null;
      return json(publication);
    }
    if (rest === '/images/order') {
      const ids = (body as { image_ids: string[] }).image_ids;
      apartment.images = ids.map((id) => apartment.images.find((image) => image.id === id)!);
      return json(apartment.images);
    }
    const imageMatch = /^\/images\/(.+)$/.exec(rest);
    if (imageMatch && method === 'DELETE') {
      apartment.images = apartment.images.filter((image) => image.id !== imageMatch[1]);
      return json(null, 204);
    }
    return error(404, 'not_found');
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    try {
      return Promise.resolve(handle(init?.method ?? 'GET', url, body, new Headers(init?.headers)));
    } catch (failure) {
      return Promise.reject(failure instanceof Error ? failure : new Error(String(failure)));
    }
  });

  // Photo uploads use XMLHttpRequest (for progress events).
  class FakeXhr {
    status = 0;
    responseText = '';
    statusText = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private path = '';
    open(_method: string, path: string) {
      this.path = path;
    }
    setRequestHeader() {}
    send(form: FormData) {
      const file = form.get('file') as File;
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 } as ProgressEvent);
        const id = /apartments\/([^/]+)\/images/.exec(this.path)?.[1] ?? '';
        const apartment = store.get(id);
        requests.push({ method: 'POST', path: this.path, body: file.name, headers: new Headers() });
        if (!apartment) {
          this.status = 404;
          this.responseText = JSON.stringify({ error: { code: 'listing_not_found', message: '' } });
        } else {
          const image = makeImage(`img-${file.name}`);
          apartment.images.push(image);
          this.status = 201;
          this.responseText = JSON.stringify(image);
        }
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);

  return { store, requests, telegram };
}
