import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { installFakeApi } from '@/test/fakeApi';
import { SEA_VIEW, STUDIO } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { installTelegram } from '@/test/telegram';

describe('apartment details', () => {
  it('renders all listing information and both contacts', async () => {
    installFakeApi();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderApp(`/apartments/${SEA_VIEW.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: SEA_VIEW.title })).toBeVisible();
    // Rent and deposit are both 12,000,000 ₫ in the fixture.
    expect(screen.getAllByText('12,000,000 ₫')).toHaveLength(2);
    expect(screen.getByText(/An Thuong 2/)).toBeInTheDocument();
    const facts = screen.getByRole('heading', { name: 'Key facts' }).parentElement!;
    for (const text of ['45 m²', '1 bedroom', '6 months']) {
      expect(within(facts).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('Bright apartment near the beach.')).toBeInTheDocument();
    expect(screen.getByText('No smoking')).toBeInTheDocument();
    expect(screen.getByText('Updated Oct 20, 2026')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Exact location' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Contact agent' }));
    expect(open).toHaveBeenCalledWith('https://t.me/agent_minh', '_blank', 'noopener,noreferrer');
    await user.click(screen.getByRole('button', { name: 'Contact administrator' }));
    expect(open).toHaveBeenLastCalledWith(
      'https://t.me/danang_admin',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('hides missing optional fields and explains a missing agent contact', async () => {
    installFakeApi();
    renderApp(`/apartments/${STUDIO.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: STUDIO.title })).toBeVisible();
    for (const label of ['Area', 'Bathrooms', 'Deposit', 'Minimum rental', 'Description']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByText('Studio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact agent' })).toBeDisabled();
    expect(screen.getByText(/has not provided contact details/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact administrator' })).toBeEnabled();
    expect(await screen.findByRole('img', { name: /Approximate location/ })).toBeInTheDocument();
  });

  it.each([
    [410, 'listing_unavailable', 'This apartment is no longer available.'],
    [404, 'listing_not_found', 'This listing does not exist.'],
  ])('handles a %s response gracefully', async (status, code, message) => {
    installFakeApi({ detailErrors: { [SEA_VIEW.id]: [status, code] } });
    renderApp(`/apartments/${SEA_VIEW.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('link', { name: 'Browse apartments' })).toHaveAttribute('href', '/');
  });

  it('copies the share link in a regular browser', async () => {
    installFakeApi();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp(`/apartments/${SEA_VIEW.id}`);

    await user.click(await screen.findByRole('button', { name: 'Share' }));
    expect(writeText).toHaveBeenCalledWith(SEA_VIEW.share_url);
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('goes back to the catalog when opened directly', async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { router } = renderApp(`/apartments/${SEA_VIEW.id}`);
    await screen.findByRole('heading', { level: 1, name: SEA_VIEW.title });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('inside Telegram', () => {
  it('opens a deep-linked listing, logs in and uses Telegram navigation', async () => {
    const api = installFakeApi();
    const webApp = installTelegram({ startParam: SEA_VIEW.id });
    const user = userEvent.setup();
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: SEA_VIEW.title })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/apartments/${SEA_VIEW.id}`);
    expect(api.requests.find((r) => r.url.pathname === '/api/auth/telegram')?.body).toEqual({
      init_data: webApp.initData,
    });

    // Native back button replaces the in-page one.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(webApp.BackButton.show).toHaveBeenCalled();

    // Contacts and sharing go through Telegram.
    await user.click(screen.getByRole('button', { name: 'Contact agent' }));
    expect(webApp.openTelegramLink).toHaveBeenCalledWith('https://t.me/agent_minh');
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(webApp.openTelegramLink).toHaveBeenLastCalledWith(
      expect.stringMatching(/^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Ft\.me%2FDaNangAptBot/),
    );
  });

  it('ignores a start parameter that is not a listing id', async () => {
    installFakeApi();
    installTelegram({ startParam: 'promo-campaign' });
    const { router } = renderApp('/');
    await screen.findByText('3 apartments in this area');
    expect(router.state.location.pathname).toBe('/');
  });
});
