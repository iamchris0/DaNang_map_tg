import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { changeLanguage, resolveInitialLanguage } from '@/i18n';
import { renderRoute } from '@/test/render';

function mockReadiness(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('HomePage', () => {
  beforeEach(async () => {
    await changeLanguage('en');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows healthy backend components', async () => {
    const fetchMock = mockReadiness(200, {
      status: 'ok',
      database: 'ok',
      postgis: 'ok',
      storage: 'ok',
    });
    renderRoute('/');

    const status = await screen.findByRole('region', { name: 'System status' });
    expect(await within(status).findAllByText('Operational')).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith('/api/health/ready', expect.anything());
  });

  it('shows degraded components from a 503 response', async () => {
    mockReadiness(503, { status: 'error', database: 'ok', postgis: 'ok', storage: 'error' });
    renderRoute('/');

    const status = await screen.findByRole('region', { name: 'System status' });
    expect(await within(status).findAllByText('Operational')).toHaveLength(3);
    expect(within(status).getByText('Unavailable')).toBeInTheDocument();
  });

  it('reports an unreachable server', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderRoute('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('The server cannot be reached.');
  });

  it('switches language to Russian and remembers the choice', async () => {
    mockReadiness(200, { status: 'ok', database: 'ok', postgis: 'ok', storage: 'ok' });
    renderRoute('/');

    await userEvent.click(screen.getByRole('button', { name: /RU/ }));

    expect(await screen.findByRole('heading', { name: 'Квартиры в Дананге' })).toBeInTheDocument();
    expect(resolveInitialLanguage()).toBe('ru');
  });
});

describe('resolveInitialLanguage', () => {
  it('uses a supported hint and defaults to English otherwise', () => {
    expect(resolveInitialLanguage('ru-RU')).toBe('ru');
    expect(resolveInitialLanguage('vi')).toBe('en');
    expect(resolveInitialLanguage(null)).toBe('en');
  });
});

describe('routing', () => {
  it('renders not-found for unknown paths', async () => {
    mockReadiness(200, {});
    renderRoute('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
