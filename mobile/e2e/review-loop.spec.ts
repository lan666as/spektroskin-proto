import { expect, test } from '@playwright/test';

import { byId, login, uniquePatientCode } from './helpers';

test('review loop: clinician submits → dermatologist reviews → clinician sees the answer', async ({
  browser,
}) => {
  const clinicianContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const clinician = await clinicianContext.newPage();
  const reviewer = await reviewerContext.newPage();

  await login(clinician, 'smoke-clinician');
  const code = await uniquePatientCode(clinician.request);
  await byId(clinician, 'new-patient').click();
  await byId(clinician, 'patient-code').fill(code);
  await byId(clinician, 'patient-age').fill('54');
  await byId(clinician, 'sex-female').click();
  await byId(clinician, 'fitzpatrick-V').click();
  await byId(clinician, 'consent-yes').click();
  await byId(clinician, 'create-patient').click();
  await byId(clinician, 'add-lesion').click();
  await byId(clinician, 'body-side-back').click();
  await byId(clinician, 'region-back-sole-left').click();
  await byId(clinician, 'create-lesion').click();
  await byId(clinician, 'capture-button').click();
  await expect(byId(clinician, 'qc-passed')).toBeVisible({ timeout: 30_000 });
  await byId(clinician, 'submit-for-review').click();
  const question = `E2E ${code}: biopsy or observe?`;
  await byId(clinician, 'case-question').fill(question);
  await byId(clinician, 'submit-case').click();
  await expect(byId(clinician, 'awaiting-review')).toBeVisible();

  await login(reviewer, 'smoke-dermatologist');
  const row = reviewer.getByTestId(/^queue-case-/).filter({ hasText: code }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(byId(reviewer, 'case-question-text')).toHaveText(question);
  await expect(byId(reviewer, 'history-strip')).toBeVisible();
  await expect(byId(reviewer, 'review-case-screen')).toContainText('Research consent');
  // Blind read: AI suggestions stay hidden until the recommendation is sent.
  await byId(reviewer, 'ai-hidden').click();
  await expect(byId(reviewer, 'triage-support')).toHaveCount(0);
  await expect(byId(reviewer, 'automated-analysis')).toHaveCount(0);
  await byId(reviewer, 'review-impression').fill('Irregular pigment on an acral site with growth over visits.');
  await byId(reviewer, 'pattern-read-unsure').click();
  await byId(reviewer, 'action-biopsy').click();
  await byId(reviewer, 'follow-up-14').click();
  await byId(reviewer, 'send-review').click();
  await expect(byId(reviewer, 'recommendation')).toBeVisible();
  await expect(byId(reviewer, 'review-sent')).toContainText('Smoke Test Clinician');
  await expect(byId(reviewer, 'triage-agreement')).toContainText('Your read: unsure');
  // Checked right away: the audit page lists the newest 50 events and polling adds more.
  await byId(reviewer, 'nav-audit').click();
  await expect(byId(reviewer, 'audit-screen')).toBeVisible();
  await expect(
    reviewer.getByTestId('audit-row').filter({ hasText: 'Smoke Test Dermatologist' }).filter({ hasText: 'review case' }).first(),
  ).toBeVisible();

  // The clinician's case page polls every 5 s.
  await expect(byId(clinician, 'recommendation-action')).toContainText('Biopsy', { timeout: 15_000 });
  await expect(byId(clinician, 'recommendation-arrived')).toBeVisible();
  await expect(byId(clinician, 'recommendation')).toContainText('treating clinician decides');

  await byId(clinician, 'open-summary').click();
  await expect(byId(clinician, 'summary-action')).toContainText('Biopsy');
  await expect(byId(clinician, 'summary-screen')).toContainText('AI suggestions (research mode');
  await expect(byId(clinician, 'summary-screen')).toContainText('Not a diagnosis');
  await expect(byId(clinician, 'summary-screen')).toContainText(code);
  await clinician.emulateMedia({ media: 'print' });
  await expect(clinician.getByTestId('print')).toBeHidden();
  const pdf = await clinician.pdf({ format: 'A4' });
  expect(pdf.byteLength).toBeGreaterThan(20_000);
  await clinician.emulateMedia({ media: 'screen' });


  await clinicianContext.close();
  await reviewerContext.close();
});
