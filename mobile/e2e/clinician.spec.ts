import { expect, type Page, test } from '@playwright/test';

import { byId, closeCase, login, uniquePatientCode } from './helpers';

async function captureWith(page: Page, phantom: string) {
  await expect(byId(page, 'capture-screen')).toBeVisible();
  await expect(byId(page, 'simulated-badge').first()).toBeVisible();
  await byId(page, 'dev-toggle').click();
  await byId(page, `phantom-${phantom}`).click();
  await byId(page, 'capture-button').click();
  await expect(byId(page, 'results-screen')).toBeVisible({ timeout: 30_000 });
}

test('clinician: login → patient → lesion → capture → results with history → submit', async ({
  page,
  request,
}) => {
  await login(page, 'smoke-clinician');

  const code = await uniquePatientCode(request);
  await byId(page, 'new-patient').click();
  await byId(page, 'patient-code').fill(code);
  await byId(page, 'patient-age').fill('54');
  await byId(page, 'sex-female').click();
  await byId(page, 'fitzpatrick-V').click();
  await byId(page, 'consent-no').click();
  await byId(page, 'create-patient').click();
  await expect(byId(page, 'patient-screen')).toBeVisible();

  await byId(page, 'add-lesion').click();
  await byId(page, 'acral-sole-left').click();
  await byId(page, 'create-lesion').click();

  // A glare capture fails QC with retake guidance; retake goes back to the capture screen.
  await captureWith(page, 'pigmented_dark_glare');
  await expect(byId(page, 'qc-failed')).toContainText('Glare');
  await byId(page, 'retake').click();

  // Three visits of the growing acral lesion build the history strip.
  for (const phantom of ['acral_dark_d01', 'acral_dark_d14']) {
    await captureWith(page, phantom);
    await expect(byId(page, 'qc-passed')).toBeVisible();
    await byId(page, 'nav-patients').click();
    await byId(page, `patient-${code}`).click();
    await byId(page, 'lesion-sole').click();
    await byId(page, 'new-capture').click();
  }
  await captureWith(page, 'acral_dark_d30');
  await expect(byId(page, 'qc-passed')).toBeVisible();

  for (const view of ['pigment', 'vascular', 'standard']) {
    await byId(page, `view-${view}`).click();
    await expect(byId(page, `view-image-${view}`)).toBeVisible();
  }
  await expect(byId(page, 'lesion-area')).toContainText('mm²');
  const history = byId(page, 'history-strip');
  await expect(history).toBeVisible();
  await expect(history.getByText(/mm²/)).toHaveCount(4); // 3 visit areas + change line
  await expect(byId(page, 'area-change')).toContainText('+');
  await expect(byId(page, 'compare-change')).toContainText('+');
  await byId(page, 'show-validation').click();
  await expect(byId(page, 'validation-scope')).toContainText('simulated data only');

  await byId(page, 'submit-for-review').click();
  await byId(page, 'case-question').fill('E2E: pigmented macule on left sole, growing. Biopsy or observe?');
  await byId(page, 'submit-case').click();
  await expect(byId(page, 'clinician-case-screen')).toBeVisible();
  await expect(byId(page, 'awaiting-review')).toBeVisible();
  const caseId = new URL(page.url()).pathname.split('/').pop()!;

  await byId(page, 'nav-cases').click();
  await expect(byId(page, 'my-cases-screen')).toContainText(code);
  await closeCase(request, caseId);
});
