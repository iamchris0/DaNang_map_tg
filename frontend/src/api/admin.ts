import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { ApiError, type ApiErrorBody, API_BASE_URL, apiFetch, buildQuery } from './client';
import { getSessionToken } from './session';
import type {
  AdminApartment,
  AdminListItem,
  ApartmentInput,
  ApartmentStatus,
  Dashboard,
  GeocodeResult,
  Image,
  Page,
  Publication,
  TelegramPreview,
} from './types';

const ADMIN_KEY = ['admin'] as const;
const PAGE_SIZE = 20;

export function useDashboard() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'dashboard'],
    queryFn: () => apiFetch<Dashboard>('/api/admin/dashboard'),
  });
}

export function useAdminApartments(query: string, status: ApartmentStatus | null) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_KEY, 'list', query, status],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<Page<AdminListItem>>(
        `/api/admin/apartments${buildQuery({ q: query, status, page: pageParam, page_size: PAGE_SIZE })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

export function adminApartmentKey(id: string) {
  return [...ADMIN_KEY, 'apartment', id] as const;
}

export function useAdminApartment(id: string | undefined) {
  return useQuery({
    queryKey: adminApartmentKey(id ?? ''),
    queryFn: () => apiFetch<AdminApartment>(`/api/admin/apartments/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

/** After any admin write: refresh admin views and the public catalog. */
function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return (apartment?: AdminApartment) => {
    if (apartment) queryClient.setQueryData(adminApartmentKey(apartment.id), apartment);
    void queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
    void queryClient.invalidateQueries({ queryKey: ['apartments'] });
  };
}

export function useSaveApartment(id: string | undefined) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: ApartmentInput) =>
      id
        ? apiFetch<AdminApartment>(`/api/admin/apartments/${id}`, { method: 'PATCH', json: input })
        : apiFetch<AdminApartment>('/api/admin/apartments', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useChangeStatus(id: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (status: ApartmentStatus) =>
      apiFetch<AdminApartment>(`/api/admin/apartments/${id}/status`, {
        method: 'PATCH',
        json: { status },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteApartment() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<undefined>(`/api/admin/apartments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
    },
  });
}

export function deleteImage(apartmentId: string, imageId: string): Promise<undefined> {
  return apiFetch<undefined>(`/api/admin/apartments/${apartmentId}/images/${imageId}`, {
    method: 'DELETE',
  });
}

/** Set the photo order; the first photo becomes the cover. */
export function reorderImages(apartmentId: string, imageIds: string[]): Promise<Image[]> {
  return apiFetch<Image[]>(`/api/admin/apartments/${apartmentId}/images/order`, {
    method: 'PATCH',
    json: { image_ids: imageIds },
  });
}

export function fetchAdminApartment(apartmentId: string): Promise<AdminApartment> {
  return apiFetch<AdminApartment>(`/api/admin/apartments/${apartmentId}`);
}

/** Refresh admin and public views after photo changes. */
export function useRefreshListing() {
  const queryClient = useQueryClient();
  return (apartment: AdminApartment) => {
    queryClient.setQueryData(adminApartmentKey(apartment.id), apartment);
    void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['apartments'] });
  };
}

/**
 * Upload one photo with progress reporting (fetch cannot report upload progress, so this
 * uses XMLHttpRequest).
 */
export function uploadImage(
  apartmentId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Image> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/admin/apartments/${apartmentId}/images`);
    const token = getSessionToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error body.
      }
      if (xhr.status === 201) {
        resolve(body as Image);
        return;
      }
      const error =
        body && typeof body === 'object' && 'error' in body
          ? (body as { error: ApiErrorBody }).error
          : { code: 'http_error', message: xhr.statusText };
      reject(new ApiError(xhr.status, error));
    };
    xhr.onerror = () => {
      reject(new ApiError(0, { code: 'network_error', message: 'Network error' }));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export function useGeocode(query: string, language: string) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'geocode', query, language],
    queryFn: ({ signal }) =>
      apiFetch<GeocodeResult[]>(`/api/admin/geocode${buildQuery({ q: query, lang: language })}`, {
        signal,
      }),
    enabled: query.trim().length >= 3,
    staleTime: Infinity,
    retry: false,
  });
}

// --- Telegram channel publishing -------------------------------------------------------------

function telegramKey(apartmentId: string) {
  return [...ADMIN_KEY, 'telegram', apartmentId] as const;
}

export function useTelegramPublications(apartmentId: string) {
  return useQuery({
    queryKey: [...telegramKey(apartmentId), 'history'],
    queryFn: () =>
      apiFetch<Publication[]>(`/api/admin/apartments/${apartmentId}/telegram-publications`),
  });
}

export function useTelegramPreview(apartmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...telegramKey(apartmentId), 'preview'],
    queryFn: () =>
      apiFetch<TelegramPreview>(`/api/admin/apartments/${apartmentId}/telegram-preview`),
    enabled,
    staleTime: 0,
  });
}

/** A fresh key per confirmed attempt; reuse it to retry the same attempt safely. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function usePublishToTelegram(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      apiFetch<Publication>(`/api/admin/apartments/${apartmentId}/publish-telegram`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: telegramKey(apartmentId) });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, 'list'] });
      void queryClient.invalidateQueries({ queryKey: adminApartmentKey(apartmentId) });
    },
  });
}

export function useResolvePublication(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      publicationId,
      wasPublished,
    }: {
      publicationId: string;
      wasPublished: boolean;
    }) =>
      apiFetch<Publication>(
        `/api/admin/apartments/${apartmentId}/telegram-publications/${publicationId}/resolve`,
        { method: 'POST', json: { was_published: wasPublished } },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: telegramKey(apartmentId) });
      void queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY, 'list'] });
    },
  });
}
