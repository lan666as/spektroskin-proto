import { expect, test } from '@playwright/test';

import { byId } from './helpers';

test('judges: one tap opens the clinician app, a link opens the review portal', async ({ browser }) => {
  const clinician = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await clinician.goto('/login');
  await byId(clinician, 'demo-clinician').click();
  await expect(byId(clinician, 'patients-screen')).toBeVisible();

  const reviewer = await browser.newPage();
  await reviewer.goto('/login?as=dermatologist');
  await expect(byId(reviewer, 'queue-screen')).toBeVisible();
});
