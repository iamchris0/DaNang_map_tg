import { useQuery } from '@tanstack/react-query';

import { API_BASE_URL } from './client';

export type CheckState = 'ok' | 'error';

export interface Readiness {
  status: CheckState;
  database: CheckState;
  postgis: CheckState;
  storage: CheckState;
}

async function fetchReadiness(): Promise<Readiness> {
  const response = await fetch(`${API_BASE_URL}/api/health/ready`, {
    headers: { Accept: 'application/json' },
  });
  // 503 is an expected answer here and still carries the per-component breakdown.
  if (response.status !== 200 && response.status !== 503) {
    throw new Error(`Unexpected readiness status ${response.status}`);
  }
  return (await response.json()) as Readiness;
}

export function useReadiness() {
  return useQuery({ queryKey: ['health', 'ready'], queryFn: fetchReadiness, retry: false });
}
