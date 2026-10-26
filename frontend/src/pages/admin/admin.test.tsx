import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { blankInput, installFakeAdminApi, makeImage } from '@/test/fakeAdminApi';
import { installFakeApi } from '@/test/fakeApi';
import { markers } from '@/test/fakeMaplibre';
import { renderApp } from '@/test/render';

const COMPLETE = {
  ...blankInput(),
  title: 'Sea view 1BR',
  price_vnd: 12_000_000,
  district_id: 2,
  bedrooms: 1,
  latitude: 16.06,
  longitude: 108.24,
  location_precision: 'exact' as const,
};

describe('admin access', () => {
  it('shows the admin entry only to administrators', async () => {
    installFakeAdminApi();
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Admin panel' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('denies the admin area to regular users', async () => {
    installFakeAdminApi([], { isAdmin: false });
    renderApp('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This section is only available to administrators.',
    );
    expect(screen.queryByRole('link', { name: 'Add apartment' })).not.toBeInTheDocument();
  });

  it('offers a developer sign-in when not signed in (dev builds only)', async () => {
    installFakeApi();
    renderApp('/admin');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('shows counts, searches and filters listings', async () => {
    installFakeAdminApi([
      { ...COMPLETE, status: 'available', images: [makeImage('a')] },
      { ...blankInput(), title: 'Draft loft' },
      { ...COMPLETE, title: 'Rented house', status: 'rented' },
    ]);
    const user = userEvent.setup();
    renderApp('/admin');

    // One row of status filters with counts (no separate statistics block).
    expect(await screen.findByRole('button', { name: 'All 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draft 1' })).toBeInTheDocument();
    expect(await screen.findByText('Sea view 1BR')).toBeInTheDocument();
    expect(screen.getAllByText('12,000,000 ₫')).toHaveLength(2);

    await user.type(screen.getByRole('searchbox', { name: 'Search by title' }), 'loft');
    await waitFor(() => {
      expect(screen.queryByText('Sea view 1BR')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Draft loft')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Rented 1', pressed: false }));
    await waitFor(() => {
      expect(screen.queryByText('Draft loft')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Rented house')).toBeInTheDocument();
  });

  it('changes availability with confirmation', async () => {
    const api = installFakeAdminApi([
      { ...COMPLETE, status: 'available', images: [makeImage('a')] },
    ]);
    const user = userEvent.setup();
    renderApp('/admin');

    await user.click(await screen.findByRole('button', { name: 'Mark as rented' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark as rented?' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Status changed to “Rented”')).toBeInTheDocument();
    expect([...api.store.values()][0]?.status).toBe('rented');
    // A rented listing can be published again; it's the only text action on the tile.
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as rented' })).not.toBeInTheDocument();
  });

  it('deletes a listing from its tile after confirmation', async () => {
    const api = installFakeAdminApi([{ ...blankInput(), title: 'Old draft' }]);
    const user = userEvent.setup();
    renderApp('/admin');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this listing?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByText('Listing deleted')).toBeInTheDocument();
    expect(api.store.size).toBe(0);
  });
});

describe('listing form', () => {
  it('creates a draft with a location from search and opens it for editing', async () => {
    const api = installFakeAdminApi();
    const user = userEvent.setup();
    const { router } = renderApp('/admin/apartments/new');

    await user.type(await screen.findByLabelText('Title'), 'Garden 2BR');
    await user.type(screen.getByLabelText('Monthly rent, ₫'), '13,500,000');
    expect(screen.getByText('13,500,000 ₫')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('District'), 'Sơn Trà');
    await user.selectOptions(screen.getByLabelText('Bedrooms'), 'Studio');
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search address or landmark' }),
      'Han Market',
    );
    await user.click(await screen.findByRole('button', { name: /Han Market, Tran Phu/ }));
    expect(screen.getByTestId('coordinates')).toHaveTextContent('16.06840, 108.22450');
    // A searched place is never claimed to be an exact address.
    expect(screen.getByRole('radio', { name: 'Approximate area' })).toBeChecked();
    expect(screen.getByText(/Placed from search/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/admin\/apartments\/0{8}-/);
    });
    const created = api.requests.find(
      (r) => r.method === 'POST' && r.path === '/api/admin/apartments',
    );
    expect(created?.body).toEqual({
      ...blankInput(),
      title: 'Garden 2BR',
      price_vnd: 13_500_000,
      district_id: 2,
      bedrooms: 0,
      latitude: 16.0684,
      longitude: 108.2245,
      location_precision: 'approximate',
    });
    expect(await screen.findByText('Draft created')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Edit apartment' })).toBeInTheDocument();
    expect(screen.getByText('To publish, add: a photo')).toBeInTheDocument();
  });

  it('places and drags the pin on the map', async () => {
    installFakeAdminApi([{ ...blankInput(), title: 'Pin test' }]);
    renderApp('/admin/apartments/00000000-0000-4000-8000-000000000001');
    expect(await screen.findByText('No location yet')).toBeInTheDocument();
    await screen.findByTestId('location-picker');
    await waitFor(() => {
      expect(
        screen.getByTestId('location-picker').querySelector('.maplibregl-canvas-container'),
      ).not.toBeNull();
    });

    const { maps } = await import('@/test/fakeMaplibre');
    const picker = maps.at(-1)!;
    act(() => {
      picker.fire('click', { lngLat: { lat: 16.05, lng: 108.21 }, originalEvent: {} });
    });
    expect(await screen.findByText('16.05000, 108.21000')).toBeInTheDocument();
    // The pin is created once the map has initialised (next animation frame).
    await waitFor(() => {
      expect(markers.at(-1)?.options.draggable).toBe(true);
    });

    act(() => {
      markers.at(-1)!.dragTo(108.215, 16.055);
    });
    expect(await screen.findByText('16.05500, 108.21500')).toBeInTheDocument();
  });

  it('edits an existing listing and protects unsaved changes', async () => {
    const api = installFakeAdminApi([
      { ...COMPLETE, status: 'available', images: [makeImage('a')] },
    ]);
    const user = userEvent.setup();
    const { router } = renderApp('/admin');
    await user.click(await screen.findByRole('link', { name: 'Edit' }));

    const title = await screen.findByLabelText('Title');
    await waitFor(() => {
      expect(title).toHaveValue('Sea view 1BR');
    });
    expect(screen.getByLabelText('Monthly rent, ₫')).toHaveValue('12000000');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Monthly rent, ₫'));
    await user.type(screen.getByLabelText('Monthly rent, ₫'), '15000000');

    // Leaving with unsaved changes asks first.
    await user.click(screen.getByRole('link', { name: 'Back' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toMatch(/^\/admin\/apartments\//);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    const patch = api.requests.find((r) => r.method === 'PATCH' && !r.path.endsWith('/status'));
    expect((patch?.body as { price_vnd: number }).price_vnd).toBe(15_000_000);

    // Saved: leaving no longer asks.
    await user.click(screen.getByRole('link', { name: 'Back' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
  });

  it('validates fields before sending', async () => {
    const api = installFakeAdminApi();
    const user = userEvent.setup();
    renderApp('/admin/apartments/new');

    await user.selectOptions(await screen.findByLabelText('Contact type'), 'Telegram username');
    await user.type(screen.getByLabelText('Contact'), 'no spaces allowed');
    await user.type(screen.getByLabelText('Area, m²'), '45.25');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('5–32 letters, digits or _')).toBeInTheDocument();
    expect(screen.getByText('At most one decimal place')).toBeInTheDocument();
    expect(api.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('explains why a listing cannot be published yet', async () => {
    installFakeAdminApi([{ ...COMPLETE, images: [] }]);
    const user = userEvent.setup();
    renderApp('/admin/apartments/00000000-0000-4000-8000-000000000001');

    expect(await screen.findByText('To publish, add: a photo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make available' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Missing required fields: a photo');
  });

  it('treats photo changes as unsaved edits and applies them on save', async () => {
    const api = installFakeAdminApi([
      { ...COMPLETE, images: [makeImage('first'), makeImage('second')] },
    ]);
    const user = userEvent.setup({ applyAccept: false });
    const { router } = renderApp('/admin/apartments/00000000-0000-4000-8000-000000000001');
    await screen.findByText('2/15', { exact: false });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    const files = [
      new File(['x'], 'balcony.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'notes.pdf', { type: 'application/pdf' }),
    ];
    await user.upload(screen.getByTestId('photo-input'), files);
    expect(await screen.findByText('notes.pdf: not a JPEG, PNG or WebP image')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo 3' })).toBeInTheDocument();
    // Only a photo changed, and that alone makes the listing savable.
    expect(save).toBeEnabled();

    // Make the new photo the cover and drop "second"; nothing is sent yet.
    const covers = screen.getAllByRole('button', { name: 'Make cover' });
    await user.click(covers.at(-1)!);
    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[2]!);
    expect(screen.getAllByRole('img', { name: /^Photo \d$/ })).toHaveLength(2);
    const isImageRequest = (r: { path: string }) => r.path.includes('/images');
    expect(api.requests.filter(isImageRequest)).toEqual([]);

    // Leaving with only photo changes still asks first.
    await user.click(screen.getByRole('link', { name: 'Back' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole(
        'button',
        { name: 'Keep editing' },
      ),
    );
    expect(router.state.location.pathname).toMatch(/^\/admin\/apartments\//);

    await user.click(save);
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    expect(screen.getByText('1 photo uploaded')).toBeInTheDocument();
    const imageRequests = api.requests.filter(isImageRequest);
    expect(imageRequests.map((r) => [r.method, r.body ?? null])).toEqual([
      ['POST', 'balcony.jpg'],
      ['DELETE', null],
      ['PATCH', { image_ids: ['img-balcony.jpg', 'first'] }],
    ]);
    expect(imageRequests[1]?.path).toMatch(/\/images\/second$/);
    // The listing fields were unchanged, so they were not re-sent.
    expect(api.requests.some((r) => r.method === 'PATCH' && !isImageRequest(r))).toBe(false);
    await waitFor(() => {
      expect(save).toBeDisabled();
    });
    expect(screen.getAllByRole('img', { name: /^Photo \d$/ })).toHaveLength(2);
  });

  it('uploads photos picked before a new listing is first saved', async () => {
    const api = installFakeAdminApi();
    const user = userEvent.setup();
    const { router } = renderApp('/admin/apartments/new');
    await user.type(await screen.findByLabelText('Title'), 'Garden 2BR');
    await user.upload(
      screen.getByTestId('photo-input'),
      new File(['x'], 'garden.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('1 photo uploaded')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/admin\/apartments\/0{8}-/);
    });
    expect(api.requests.find((r) => r.method === 'POST' && r.path.endsWith('/images'))?.body).toBe(
      'garden.jpg',
    );
    expect(await screen.findByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('deletes a listing after confirmation', async () => {
    const api = installFakeAdminApi([{ ...blankInput(), title: 'Old draft' }]);
    const user = userEvent.setup();
    const { router } = renderApp('/admin/apartments/00000000-0000-4000-8000-000000000001');

    await user.click(await screen.findByRole('button', { name: 'Delete listing' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this listing?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
    expect(api.store.size).toBe(0);
    expect(await screen.findByText('Listing deleted')).toBeInTheDocument();
  });

  it('is fully translated into Russian', async () => {
    installFakeAdminApi();
    localStorage.setItem('dna.language', 'ru');
    const { default: i18n } = await import('@/i18n');
    await i18n.changeLanguage('ru');
    renderApp('/admin/apartments/new');
    expect(await screen.findByRole('heading', { name: 'Новая квартира' })).toBeInTheDocument();
    expect(screen.getByLabelText('Аренда в месяц, ₫')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить черновик' })).toBeInTheDocument();
  });
});
