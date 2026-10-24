/**
 * PLAN.md §6 demo script, end to end, as the smoke users (demo accounts stay untouched).
 * Set SCREENSHOT_DIR to save a judge's-eye screenshot of every step at 390 px and 1440 px.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

import { byId, login, password, uniquePatientCode } from './helpers';

const PHANTOMS = join(__dirname, '..', 'assets', 'phantoms');
const DAY_MS = 24 * 60 * 60 * 1000;
const shotDir = process.env.SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  const width = page.viewportSize()?.width ?? 0;
  await page.waitForTimeout(400); // let images finish painting
  await page.screenshot({ path: join(shotDir, `${name}-${width}.png`), fullPage: true });
}

async function apiToken(request: APIRequestContext) {
  const res = await request.post('/api/auth/token', {
    form: { username: 'smoke-clinician', password: password('smoke-clinician') },
  });
  return (await res.json()).access_token as string;
}

/** Day 01 and Day 14 visits uploaded through the API with their real past capture times. */
async function seedHistory(request: APIRequestContext, code: string) {
  const headers = { Authorization: `Bearer ${await apiToken(request)}` };
  const patient = await (
    await request.post('/api/patients', {
      headers,
      data: { code, age: 54, sex: 'female', fitzpatrick: 'V', research_consent: true },
    })
  ).json();
  const lesion = await (
    await request.post('/api/lesions', {
      headers,
      data: { patient_id: patient.id, body_site: 'sole', laterality: 'left' },
    })
  ).json();
  for (const [phantom, daysAgo] of [
    ['acral_dark_d01', 29],
    ['acral_dark_d14', 16],
  ] as const) {
    const frames = Object.fromEntries(
      ['blue', 'green', 'red', 'nir', 'dark'].map((band) => [
        band,
        { name: `${band}.png`, mimeType: 'image/png', buffer: readFileSync(join(PHANTOMS, phantom, `${band}.png`)) },
      ]),
    );
    const res = await request.post('/api/captures', {
      headers,
      multipart: {
        id: crypto.randomUUID(),
        lesion_id: lesion.id,
        captured_at: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
        device_id: 'virtual-001',
        phantom_id: phantom,
        ...frames,
      },
    });
    expect(res.status()).toBe(201);
  }
  return { patient, lesion };
}

test('PLAN §6 demo script: 60 s core + extended', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const code = await uniquePatientCode(request);
  await seedHistory(request, code);

  const clinicianContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const clinician = await clinicianContext.newPage();
  const reviewer = await reviewerContext.newPage();
  const started = Date.now();

  // Set-up: both windows logged in; the clinician on the demo lesion's capture screen.
  await login(clinician, 'smoke-clinician');
  await shot(clinician, '01-home');
  await byId(clinician, `patient-${code}`).click();
  await byId(clinician, 'lesion-sole').click();
  await expect(byId(clinician, 'history-strip')).toBeVisible();
  await shot(clinician, '02-lesion');
  await byId(clinician, 'new-capture').click();
  await expect(byId(clinician, 'simulated-badge')).toBeVisible();
  await shot(clinician, '03-capture-ready');
  await login(reviewer, 'smoke-dermatologist');
  await shot(reviewer, '04-queue-before');

  // 1–2: capture; QC passes.
  await byId(clinician, 'capture-button').click();
  await expect(byId(clinician, 'qc-passed')).toBeVisible({ timeout: 30_000 });
  await expect(byId(clinician, 'qc-second-opinion')).toContainText('agrees with the rules');
  await shot(clinician, '05-results');
  // 3: switch the three views; outline and area.
  for (const view of ['pigment', 'vascular', 'evidence', 'standard']) {
    await byId(clinician, `view-${view}`).click();
    await expect(byId(clinician, `view-image-${view}`)).toBeVisible();
  }
  await expect(byId(clinician, 'lesion-area')).toContainText('mm²');
  await expect(byId(clinician, 'triage-pattern')).toContainText('Pigment-dominant');
  await expect(byId(clinician, 'triage-support')).toContainText('not a diagnosis');
  await expect(byId(clinician, 'triage-drivers')).toContainText('melanin excess');
  await expect(byId(clinician, 'acral-pattern-result')).toContainText('furrows');
  await expect(byId(clinician, 'morph-border')).toContainText('since Day 01');
  await expect(byId(clinician, 'morphology')).not.toContainText(/score\s*[:=]?\s*\d/i);
  await expect(byId(clinician, 'triage-support')).not.toContainText(/malignan(cy|t) (probability|risk)|risk score/i);
  // 4: history Day 01 → Day 14 → Day 30 with area change.
  await expect(byId(clinician, 'visit-day-1')).toBeVisible();
  await expect(byId(clinician, 'visit-day-14')).toBeVisible();
  await expect(byId(clinician, 'visit-day-30')).toBeVisible();
  await expect(byId(clinician, 'compare-change')).toContainText('+');
  // 5: submit.
  await byId(clinician, 'submit-for-review').click();
  await byId(clinician, 'quick-question-0').click();
  await byId(clinician, 'submit-case').click();
  await expect(byId(clinician, 'awaiting-review')).toBeVisible();
  await shot(clinician, '06-submitted');

  // 6: dermatologist recommends biopsy, follow-up 14 days.
  const row = reviewer.getByTestId(/^queue-case-/).filter({ hasText: code }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Growing');
  await shot(reviewer, '07-queue-new-case');
  await row.click();
  await expect(byId(reviewer, 'history-strip')).toBeVisible();
  await expect(byId(reviewer, 'triage-pattern')).toContainText('Pigment-dominant');
  await expect(byId(reviewer, 'morph-asymmetry')).toBeVisible();
  await expect(byId(reviewer, 'attention-flags')).toContainText('since the first visit');
  await shot(reviewer, '08-review-case');
  await byId(reviewer, 'phrase-0').click();
  await byId(reviewer, 'action-biopsy').click();
  await byId(reviewer, 'follow-up-14').click();
  await byId(reviewer, 'pattern-read-pigmented').click();
  await byId(reviewer, 'send-review').click();
  await expect(byId(reviewer, 'review-sent')).toBeVisible();
  await expect(byId(reviewer, 'triage-agreement')).toContainText('model agrees');
  await shot(reviewer, '09-review-sent');

  // 7: the clinician sees the recommendation.
  await expect(byId(clinician, 'recommendation-action')).toContainText('Biopsy', { timeout: 15_000 });
  await expect(byId(clinician, 'recommendation')).toContainText('treating clinician decides');
  await shot(clinician, '10-answer-received');
  const coreSeconds = (Date.now() - started) / 1000;

  // Extended: close the loop. Biopsy taken, histopathology pending, then the result arrives.
  await byId(clinician, 'outcome-action-biopsied').click();
  await byId(clinician, 'save-outcome').click();
  await expect(byId(clinician, 'outcome-histopathology')).toContainText('Result pending');
  await byId(clinician, 'edit-outcome').click();
  await byId(clinician, 'histo-benign').click();
  await byId(clinician, 'outcome-notes').fill('Compound naevus, margins clear');
  await byId(clinician, 'save-outcome').click();
  await expect(byId(clinician, 'outcome-histopathology')).toContainText('Benign');
  await shot(clinician, '10b-outcome-recorded');
  await reviewer.reload();
  await expect(byId(reviewer, 'outcome-histopathology')).toContainText('Benign');
  await byId(reviewer, 'nav-ai').click();
  await expect(byId(reviewer, 'shadow-agreement')).toContainText('%');
  await expect(byId(reviewer, 'ablation')).toContainText('RGB bands only');
  await expect(byId(reviewer, 'validation-eligible')).toBeVisible();
  await shot(reviewer, '10c-ai-overview');

  // Extended: glare capture fails QC with retake guidance; validation panel on a retake.
  await byId(clinician, 'nav-patients').click();
  await byId(clinician, `patient-${code}`).click();
  await byId(clinician, 'lesion-sole').click();
  await byId(clinician, 'new-capture').click();
  await byId(clinician, 'dev-toggle').click();
  await byId(clinician, 'phantom-pigmented_dark_glare').click();
  await byId(clinician, 'capture-button').click();
  await expect(byId(clinician, 'qc-failed')).toContainText('Glare', { timeout: 30_000 });
  await expect(byId(clinician, 'qc-second-opinion')).toContainText('Looks glare');
  await shot(clinician, '11-qc-failed');
  await byId(clinician, 'retake').click();
  await byId(clinician, 'dev-toggle').click();
  await byId(clinician, 'phantom-acral_dark_d30').click();
  await byId(clinician, 'capture-button').click();
  await expect(byId(clinician, 'qc-passed')).toBeVisible({ timeout: 30_000 });
  await byId(clinician, 'show-validation').click();
  await expect(byId(clinician, 'validation-scope')).toContainText('simulated data only');
  await shot(clinician, '12-validation');

  test.info().annotations.push({ type: 'core-seconds', description: coreSeconds.toFixed(1) });
  await clinicianContext.close();
  await reviewerContext.close();
});
