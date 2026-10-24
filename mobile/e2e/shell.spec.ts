import { expect, test } from '@playwright/test';

test('app shell loads through Caddy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('SpektroSkin').first()).toBeVisible();
  await expect(page.getByTestId('simulated-badge').first()).toBeVisible();
});

test('API health is proxied under /api', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
});
