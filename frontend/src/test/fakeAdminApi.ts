import type {
  AdminApartment,
  AdminListItem,
  ApartmentInput,
  ApartmentStatus,
  GeocodeResult,
  Image,
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
    minimum_rental_months: null,
    rental_conditions: null,
    agent_contact_type: null,
    agent_contact_value: null,
  };
}

/**
 * Stateful in-memory admin API (signed-in administrator). Mirrors the backend's lifecycle
 * rules closely enough to exercise the UI; the backend has its own exhaustive tests.
 */
export function installFakeAdminApi(initial: Partial<Stored>[] = [], { isAdmin = true } = {}) {
  setSessionToken('test-session');
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

  const requests: { method: string; path: string; body: unknown }[] = [];

  const handle = (method: string, url: URL, body: unknown): Response => {
    const path = url.pathname;
    requests.push({ method, path, body });
    if (path === '/api/auth/me') {
      return json({
        id: 'admin-user',
        telegram_user_id: 1001,
        username: 'boss',
        display_name: 'Boss',
        preferred_language: null,
        is_admin: isAdmin,
      });
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
    return Promise.resolve(handle(init?.method ?? 'GET', url, body));
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
        requests.push({ method: 'POST', path: this.path, body: file.name });
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

  return { store, requests };
}
