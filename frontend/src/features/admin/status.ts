import type { ApartmentStatus } from '@/api/types';

/** Mirrors backend ALLOWED_TRANSITIONS (the backend remains authoritative). */
export const TRANSITIONS: Record<ApartmentStatus, ApartmentStatus[]> = {
  draft: ['available', 'archived'],
  available: ['rented', 'archived'],
  rented: ['available', 'archived'],
  archived: ['available'],
};

export const STATUSES: ApartmentStatus[] = ['available', 'draft', 'rented', 'archived'];

export const STATUS_STYLES: Record<ApartmentStatus, string> = {
  available: 'bg-emerald-600 text-white',
  draft: 'bg-amber-500 text-white',
  rented: 'bg-sky-600 text-white',
  archived: 'bg-neutral-500 text-white',
};
