import { execFileSync } from 'node:child_process';

import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';

/** Automated runs use the dedicated smoke users so demo accounts stay clean. */
export function password(user: 'smoke-clinician' | 'smoke-dermatologist'): string {
  const env = process.env[`${user.toUpperCase().replace('-', '_')}_PASSWORD`];
  if (env) return env;
  return execFileSync(
    'security',
    ['find-generic-password', '-a', user, '-s', `spektroskin-${user}`, '-w'],
    { encoding: 'utf8' },
  ).trim();
}

/** Stack navigators keep earlier screens mounted (hidden), so test ids repeat: use the visible one. */
export function byId(page: Page, id: string): Locator {
  return page.getByTestId(id).filter({ visible: true }).first();
}

export async function login(page: Page, user: 'smoke-clinician' | 'smoke-dermatologist') {
  await page.goto('/login');
  await byId(page, 'login-username').fill(user);
  await byId(page, 'login-password').fill(password(user));
  await byId(page, 'login-submit').click();
  await expect(byId(page, user === 'smoke-clinician' ? 'patients-screen' : 'queue-screen')).toBeVisible();
}

export function uniquePatientCode(): string {
  return `PT-${String(8000 + Math.floor(Math.random() * 1000)).padStart(4, '0')}`;
}

/** Answer a case as the smoke dermatologist through the API so test runs leave no open cases. */
export async function closeCase(request: APIRequestContext, caseId: string) {
  const token = await request.post('/api/auth/token', {
    form: { username: 'smoke-dermatologist', password: password('smoke-dermatologist') },
  });
  expect(token.ok()).toBeTruthy();
  const { access_token } = await token.json();
  const review = await request.post(`/api/cases/${caseId}/review`, {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { impression: 'Automated test: closing the case.', action: 'observe' },
  });
  expect(review.status()).toBe(201);
}
