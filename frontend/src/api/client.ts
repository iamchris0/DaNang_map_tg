import { getSessionToken, setSessionToken } from './session';

/** Mirrors the backend error envelope: {"error": {"code", "message", "details"}}. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

function isErrorEnvelope(value: unknown): value is { error: ApiErrorBody } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

export type QueryValue = string | number | readonly (string | number)[] | null | undefined;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  let body: BodyInit | null = null;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers, body });
  if (response.status === 401 && token) setSessionToken(null);
  if (response.status === 204) return undefined as T;
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorEnvelope(parsed)) throw new ApiError(response.status, parsed.error);
    throw new ApiError(response.status, { code: 'http_error', message: response.statusText });
  }
  return parsed as T;
}
