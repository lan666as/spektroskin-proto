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

async function token(request: APIRequestContext, user: 'smoke-clinician' | 'smoke-dermatologist') {
  const res = await request.post('/api/auth/token', { form: { username: user, password: password(user) } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

/** A PT-8xxx code not used yet by the smoke clinician (random picks collide after many runs). */
export async function uniquePatientCode(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/patients', {
    headers: { Authorization: `Bearer ${await token(request, 'smoke-clinician')}` },
  });
  const used = new Set(((await res.json()) as { code: string }[]).map((p) => p.code));
  const free = Array.from({ length: 1000 }, (_, i) => `PT-${8000 + i}`).filter((c) => !used.has(c));
  if (!free.length) throw new Error('No free PT-8xxx codes left for e2e patients');
  return free[Math.floor(Math.random() * free.length)];
}

/** Answer a case as the smoke dermatologist through the API so test runs leave no open cases. */
export async function closeCase(request: APIRequestContext, caseId: string) {
  const review = await request.post(`/api/cases/${caseId}/review`, {
    headers: { Authorization: `Bearer ${await token(request, 'smoke-dermatologist')}` },
    data: { impression: 'Automated test: closing the case.', action: 'observe' },
  });
  expect(review.status()).toBe(201);
}
