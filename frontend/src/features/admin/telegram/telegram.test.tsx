import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { blankInput, installFakeAdminApi, makeImage } from '@/test/fakeAdminApi';
import { renderApp } from '@/test/render';

import { TelegramHtml } from './TelegramHtml';

const LISTING = {
  ...blankInput(),
  title: 'Sea view 1BR',
  price_vnd: 12_000_000,
  district_id: 2,
  bedrooms: 1,
  latitude: 16.06,
  longitude: 108.24,
  location_precision: 'exact' as const,
  status: 'available' as const,
  images: [makeImage('a'), makeImage('b')],
};
const URL = '/admin/apartments/00000000-0000-4000-8000-000000000001';

function publishRequests(api: ReturnType<typeof installFakeAdminApi>) {
  return api.requests.filter((r) => r.path.endsWith('/publish-telegram'));
}

async function openPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Publish to Telegram channel' }));
  return screen.findByRole('dialog', { name: 'Post preview' });
}

describe('Telegram channel publishing', () => {
  it('previews, confirms and shows the published post', async () => {
    const api = installFakeAdminApi([LISTING]);
    const user = userEvent.setup();
    renderApp(URL);

    expect(await screen.findByText('Not posted to the channel yet.')).toBeInTheDocument();
    const sheet = await openPreview(user);
    // Nothing is sent until the administrator confirms.
    expect(publishRequests(api)).toHaveLength(0);

    const post = await within(sheet).findByRole('article', { name: 'Post preview' });
    expect(within(post).getByText('Sea view 1BR').tagName).toBe('STRONG');
    expect(within(post).getByRole('link', { name: 'View details and location' })).toHaveAttribute(
      'href',
      'https://t.me/DaNangAptBot/app?startapp=00000000-0000-4000-8000-000000000001',
    );
    expect(within(sheet).getByText('Channel: @danang_rent')).toBeInTheDocument();
    expect(within(sheet).getByText(/2 photos · 120 \/ 1024 characters/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Publish' }));
    expect(await within(sheet).findByText('Posted to the channel')).toBeInTheDocument();
    const [request] = publishRequests(api);
    expect(request?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);

    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/^Posted Oct 26, 2026 by Boss$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open post' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Editing this listing does not change the post that is already in the channel.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish to Telegram channel' }),
    ).not.toBeInTheDocument();
  });

  it('retries a lost connection with the same key, so no duplicate post is created', async () => {
    const api = installFakeAdminApi([LISTING]);
    api.telegram.outcomes.push('network');
    const user = userEvent.setup();
    renderApp(URL);

    const sheet = await openPreview(user);
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }));
    expect(await within(sheet).findByText(/Retrying is safe/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Retry' }));

    expect(await within(sheet).findByText('Posted to the channel')).toBeInTheDocument();
    const keys = publishRequests(api).map((r) => r.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(api.telegram.publications).toHaveLength(1);
  });

  it('explains a failure and starts a fresh attempt on "Try again"', async () => {
    const api = installFakeAdminApi([LISTING]);
    api.telegram.outcomes.push('failed');
    const user = userEvent.setup();
    renderApp(URL);

    const sheet = await openPreview(user);
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }));
    expect(await within(sheet).findByText('Not posted')).toBeInTheDocument();
    expect(
      within(sheet).getByText(/The bot is not an administrator of the channel/),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Try again' }));
    expect(await within(sheet).findByText('Posted to the channel')).toBeInTheDocument();
    const keys = publishRequests(api).map((r) => r.headers.get('Idempotency-Key'));
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('never re-sends an unconfirmed post and lets the admin resolve it', async () => {
    const api = installFakeAdminApi([LISTING]);
    api.telegram.outcomes.push('unknown');
    const user = userEvent.setup();
    renderApp(URL);

    const sheet = await openPreview(user);
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }));
    expect(await within(sheet).findByText('We could not confirm the post')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));

    const panel = await screen.findByRole('alert');
    expect(within(panel).getByText('We could not confirm the post')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish to Telegram channel' }),
    ).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'It was not posted' }));
    expect(
      await screen.findByRole('button', { name: 'Publish to Telegram channel' }),
    ).toBeEnabled();
    expect(publishRequests(api)).toHaveLength(1);
  });

  it('cannot publish a listing that is not available', async () => {
    installFakeAdminApi([{ ...LISTING, status: 'draft' }]);
    renderApp(URL);
    expect(
      await screen.findByRole('button', { name: 'Publish to Telegram channel' }),
    ).toBeDisabled();
    expect(screen.getByText('Make the listing available before posting it.')).toBeInTheDocument();
  });

  it('shows why publishing is blocked when the server is not configured', async () => {
    const api = installFakeAdminApi([LISTING]);
    api.telegram.configured = false;
    const user = userEvent.setup();
    renderApp(URL);
    const sheet = await openPreview(user);
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Channel posting is not configured on the server',
    );
    expect(within(sheet).getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('shows the attempt history', async () => {
    const api = installFakeAdminApi([LISTING]);
    api.telegram.outcomes.push('failed', 'succeeded');
    const user = userEvent.setup();
    renderApp(URL);
    const sheet = await openPreview(user);
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Try again' }));
    await user.click(await within(sheet).findByRole('button', { name: 'Done' }));

    await user.click(await screen.findByText('Publication history'));
    await waitFor(() => {
      expect(screen.getAllByText(/^(Posted|Failed)$/)).toHaveLength(2);
    });
  });
});

describe('TelegramHtml', () => {
  it('renders only the allowed formatting and safe links', () => {
    render(
      <TelegramHtml
        html={
          '<b>Bold</b> <img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">bad</a> <a href="https://t.me/x">good</a>'
        }
      />,
    );
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(document.querySelector('img, script')).toBeNull();
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'good' })).toHaveAttribute('href', 'https://t.me/x');
  });
});
