/** A patient with three alike lesions and one different one: the odd one is flagged. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { byId, login, password, uniquePatientCode } from './helpers';

const PHANTOMS = join(__dirname, '..', 'assets', 'phantoms');

test('ugly duckling: the lesion unlike the others is flagged', async ({ page, request }) => {
  const token = (
    await (
      await request.post('/api/auth/token', {
        form: { username: 'smoke-clinician', password: password('smoke-clinician') },
      })
    ).json()
  ).access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const code = await uniquePatientCode(request);
  const patient = await (
    await request.post('/api/patients', { headers, data: { code, age: 47, sex: 'female', fitzpatrick: 'IV' } })
  ).json();
  for (const [site, laterality, phantom] of [
    ['upper_back', 'left', 'pigmented_medium'],
    ['upper_back', 'right', 'pigmented_light'],
    ['chest', 'midline', 'pigmented_dark'],
    ['lower_back', 'right', 'mixed_medium'],
  ] as const) {
    const lesion = await (
      await request.post('/api/lesions', { headers, data: { patient_id: patient.id, body_site: site, laterality } })
    ).json();
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
        captured_at: new Date().toISOString(),
        device_id: 'virtual-001',
        phantom_id: phantom,
        ...frames,
      },
    });
    expect(res.status()).toBe(201);
  }

  await login(page, 'smoke-clinician');
  await expect(byId(page, 'second-look')).toContainText(`${code} · Right lower back`);
  await byId(page, `patient-${code}`).click();
  await expect(byId(page, 'looks-different-lower_back')).toBeVisible();
  await expect(byId(page, 'looks-different-chest')).toHaveCount(0);
  await expect(byId(page, 'ugly-duckling-note')).toContainText('ugly duckling');
});
