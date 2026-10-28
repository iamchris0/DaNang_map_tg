import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { installFakeApi } from '@/test/fakeApi';
import { maps } from '@/test/fakeMaplibre';
import { RIVER_2BR, SEA_VIEW, STUDIO } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { installTelegram } from '@/test/telegram';

async function markerButtons() {
  const map = await screen.findByRole('region', { name: 'Map of apartments in Da Nang' });
  return within(map).findAllByRole('button', { pressed: false });
}

describe('map view', () => {
  it('shows price markers for the viewport and the result count', async () => {
    const api = installFakeApi();
    renderApp('/');

    expect(await screen.findByText('3 apartments in this area')).toBeInTheDocument();
    const markers = await markerButtons();
    expect(markers.map((m) => m.textContent)).toEqual(['12M ₫', '16.5M ₫', '~7.5M ₫']);
    expect(markers[2]).toHaveAccessibleName('7.5M ₫, Studio, approximate location');
    // The map query carries the current viewport.
    expect(api.queries('/api/apartments/map')[0]?.get('bbox')).toBe('108,15.9,108.4,16.2');
  });

  it('loads the catalog as the signed-in Telegram user (landlords see their own)', async () => {
    const api = installFakeApi();
    installTelegram();
    renderApp('/');

    await markerButtons();
    const paths = api.requests.map((r) => r.url.pathname);
    const login = paths.indexOf('/api/auth/telegram');
    const firstCatalog = paths.findIndex((path) => path.startsWith('/api/apartments'));
    // Catalog requests wait for the sign-in, then carry the session.
    expect(login).toBeGreaterThanOrEqual(0);
    expect(firstCatalog).toBeGreaterThan(login);
    const catalog = api.requests.filter((r) => r.url.pathname.startsWith('/api/apartments'));
    expect(catalog.every((r) => r.headers.get('Authorization')?.startsWith('Bearer '))).toBe(true);
  });

  it('uses the language saved in the profile, e.g. picked in the bot', async () => {
    installFakeApi({ preferredLanguage: 'vi' });
    installTelegram();
    renderApp('/');
    expect(await screen.findByText('3 căn hộ trong khu vực này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens a preview sheet for the selected marker and then the details page', async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: /^12M ₫/ }));

    const sheet = await screen.findByRole('dialog', { name: SEA_VIEW.title });
    expect(within(sheet).getByText('12,000,000 ₫')).toBeInTheDocument();
    expect(within(sheet).getByText('1 bedroom · Sơn Trà')).toBeInTheDocument();
    expect(within(sheet).getByText('45 m²')).toBeInTheDocument();
    expect(within(sheet).getByText('1 bath')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^12M ₫/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(sheet).getByRole('link', { name: 'View details' }));
    expect(router.state.location.pathname).toBe(`/apartments/${SEA_VIEW.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: SEA_VIEW.title })).toBeVisible();
  });

  it('closes the preview when the map background is tapped', async () => {
    installFakeApi();
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /^12M ₫/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    act(() => {
      maps[0]?.fire('click', { originalEvent: { target: maps[0].canvasContainer } });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('filters', () => {
  it('category dropdowns update the URL and both map and list results', async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await screen.findByText('3 apartments in this area');

    // Phones: each category opens as a bottom sheet.
    await user.click(screen.getByRole('button', { name: 'Bedrooms' }));
    const rooms = await screen.findByRole('dialog', { name: 'Bedrooms' });
    await user.click(within(rooms).getByRole('button', { name: '2' }));
    await user.click(within(rooms).getByRole('button', { name: /^Show/ }));

    await user.click(screen.getByRole('button', { name: 'Price' }));
    const price = await screen.findByRole('dialog', { name: 'Price' });
    await user.type(within(price).getByLabelText('Max', { selector: 'input' }), '20');
    expect(
      await within(price).findByRole('button', { name: 'Show 1 apartment' }),
    ).toBeInTheDocument();
    await user.click(within(price).getByRole('button', { name: 'Show 1 apartment' }));

    expect(router.state.location.search).toBe('?bedrooms=2&max_price=20000000');
    // Triggers show the current selection.
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getByRole('button', { name: 'up to 20M ₫' })).toBeInTheDocument();

    expect(await screen.findByText('1 apartment in this area')).toBeInTheDocument();
    expect((await markerButtons()).map((m) => m.textContent)).toEqual(['16.5M ₫']);
    const lastMapQuery = api.queries('/api/apartments/map').at(-1);
    expect(lastMapQuery?.getAll('bedrooms')).toEqual(['2']);
    expect(lastMapQuery?.get('max_price')).toBe('20000000');

    // The list view shares the same filters.
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByText('1 apartment')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(RIVER_2BR.title) })).toBeInTheDocument();
    expect(screen.queryByText(SEA_VIEW.title)).not.toBeInTheDocument();

    // "Clear all" resets every category.
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(router.state.location.search).toBe('?view=list');
  });

  it('filters by amenities picked in the amenities dropdown', async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await screen.findByText('3 apartments in this area');

    await user.click(screen.getByRole('button', { name: 'Amenities' }));
    const sheet = await screen.findByRole('dialog', { name: 'Amenities' });
    expect(within(sheet).getByRole('group', { name: 'Building & services' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Air conditioning' }));
    expect(
      await within(sheet).findByRole('button', { name: 'Show 2 apartments' }),
    ).toBeInTheDocument();
    // Several amenities: listings must have all of them.
    await user.click(within(sheet).getByRole('checkbox', { name: 'Swimming pool' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Show 1 apartment' }));

    expect(router.state.location.search).toBe('?amenities=air_conditioning%2Cpool');
    expect(screen.getByRole('button', { name: 'Air conditioning +1' })).toBeInTheDocument();
    expect(await screen.findByText('1 apartment in this area')).toBeInTheDocument();
    expect((await markerButtons()).map((m) => m.textContent)).toEqual(['12M ₫']);
    expect(api.queries('/api/apartments/map').at(-1)?.getAll('amenities')).toEqual([
      'air_conditioning',
      'pool',
    ]);
  });

  it('debounces rapid filter edits into a single request', async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    renderApp('/?view=list');
    await screen.findByText('3 apartments');
    const before = api.queries('/api/apartments').filter((q) => q.get('page_size') === '20').length;

    await user.click(screen.getByRole('button', { name: 'Price' }));
    const price = await screen.findByRole('dialog', { name: 'Price' });
    await user.type(within(price).getByLabelText('Min', { selector: 'input' }), '12.5');
    await user.click(within(price).getByRole('button', { name: /^Show/ }));

    await screen.findByText('1 apartment');
    const listQueries = api
      .queries('/api/apartments')
      .filter((q) => q.get('page_size') === '20')
      .slice(before);
    expect(listQueries.map((q) => q.get('min_price'))).toEqual(['12500000']);
  });

  it('shows an empty state with a reset action', async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp('/?view=list&min_price=90000000');

    expect(await screen.findByText('No apartments match your filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(router.state.location.search).toBe('?view=list');
    expect(await screen.findByText('3 apartments')).toBeInTheDocument();
  });
});

describe('list view', () => {
  it('renders cards and loads further pages', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...STUDIO,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Listing ${i + 1}`,
    }));
    installFakeApi({ apartments: many });
    const user = userEvent.setup();
    renderApp('/?view=list');

    expect(await screen.findByText('25 apartments')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    const card = screen.getByRole('link', { name: /Listing 1\b/ });
    expect(within(card).getByText('Available')).toBeInTheDocument();
    expect(within(card).getByText('Studio · Sơn Trà')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Loading more…' }));
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(25);
    });
    expect(screen.getByText("That's everything.")).toBeInTheDocument();
  });

  it('changes sorting through the URL', async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp('/?view=list');
    await screen.findByText('3 apartments');

    await user.click(screen.getByRole('button', { name: 'Newest first' }));
    await user.click(await screen.findByRole('option', { name: 'Price: low to high' }));
    expect(router.state.location.search).toBe('?view=list&sort=price_asc');
    await waitFor(() => {
      expect(api.queries('/api/apartments').at(-1)?.get('sort')).toBe('price_asc');
    });
  });
});

describe('language', () => {
  it('switches the interface to Russian and remembers the choice', async () => {
    installFakeApi();
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByText('3 apartments in this area');

    await user.click(screen.getByRole('button', { name: 'Русский' }));

    expect(await screen.findByText('3 квартиры в этой области')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Список' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^12\sмлн ₫/ })).toBeInTheDocument();
    expect(localStorage.getItem('dna.language')).toBe('ru');
  });
});
