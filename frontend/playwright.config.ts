import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

/**
 * End-to-end tests in a real browser with the real MapLibre renderer. The API and map
 * style are mocked at the network layer (see e2e/fixtures.ts), so no backend is needed.
 */
export default defineConfig({
  testDir: './e2e',
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_MAP_STYLE_URL: '/e2e/map-style.json' },
  },
});
