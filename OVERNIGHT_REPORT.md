# OVERNIGHT_REPORT — Phase B (branch `overnight`)

Started 2026-10-24 21:57 WIB after `v-core` was deployed and verified.
Rules (CLAUDE.md §12): no commits to `main`, no deploys, no VPS / compose / Caddyfile / .env changes;
full gate before every commit; revert an item that isn't green after 2 attempts or ~45 min.

## Summary

(filled in at the end)

## Item 1 — Validation

Plan:
- Simulator: optional capture seed so one phantom can be captured many times with different noise,
  gain drift and hand motion.
- `GET /api/validation/{capture_id}` (new endpoint, additive): re-runs the deterministic pipeline on
  the stored raw frames and compares the maps with the simulator's ground truth for that phantom.
  404 for captures without phantom ground truth; 422 for captures that failed QC. Audited.
- Results screen: a "Validation against simulated ground truth" panel (on demand).
- `backend/scripts/validation_report.py` → `docs/evidence/validation_report.md` plus figures:
  per tone (light/medium/dark = Fitzpatrick III/IV/V) × lesion type, N noise seeds each: map
  correlation, RMSE, mask Dice, area error; QC pass rate on clean captures and rejection rate of
  blur/glare variants per tone. States that it validates the processing math on simulated data only.
- Tests: endpoint-level logic via pytest (validation module), report generator smoke.

Result (22:01 WIB): **done**, commits `c55d991` (code) and the following report commit.
- `GET /api/validation/{capture_id}` re-runs the pipeline on the stored raw frames and compares with
  ground truth; 404 without phantom ground truth, 422 for failed QC; phantom ids pattern-checked
  before any file access; audited. Smoke checks added (200 with Dice > 0.9; 422 on failed QC).
- Results screen: "Validation vs simulated ground truth" panel (on demand), with the scope text.
- `docs/evidence/validation_report.md` + 3 figures: 90 clean captures (3 tones × 3 lesion types ×
  10 seeds): QC pass 90/90; melanin r mean 0.99 (worst 0.864, a vascular phantom with flat melanin),
  hemoglobin r ≥ 0.971, Dice ≥ 0.962, |area error| ≤ 7.8 % (small positive bias); blur and glare
  rejected 10/10 at every tone; growth series 18.4 / 22.6 / 28.7 mm² vs 18 / 22 / 28.
- Verified: gate green (pytest 40, smoke incl. validation, Playwright 4/4 incl. the panel).

## Item 3 — Offline capture queue (native)

Plan:
- `src/sync/queue.ts` (native): persist pending uploads (capture id, lesion, frame file references)
  in AsyncStorage; `flush()` uploads in order with the capture id as idempotency key; network
  errors stop the flush, 4xx marks the item failed (kept and shown, not retried forever).
- `src/sync/queue.web.ts`: no-op (web frames are Blobs; web keeps the current online-only flow).
- `SyncProvider`: flush on app start, on NetInfo reconnect, and every 30 s while items are pending;
  single in-flight flush (no concurrent writers).
- Capture screen: on a network error, queue the capture and tell the clinician it will upload
  automatically. Lesion screen: pending-upload banner.
- Verification: tsc + web export + existing e2e (web path unchanged). NEEDS PHONE CHECK for the
  offline path itself.

Result (22:04 WIB): **done (native path NEEDS PHONE CHECK)**, commit `4fa48fc`.
- Implemented as planned. Web behaviour unchanged (queue is a no-op there).
- Verified: gate green (pytest 40, smoke, Playwright 4/4 on web); `npx expo export -p android`
  compiles the native bundle (Hermes, 3.2 MB) including the native-only queue, frame loader and
  SecureStore token store. The offline path itself was **not** exercised (needs a phone).
- NEEDS PHONE CHECK (about 2 min, Expo Go, logged in as clinician):
  1. Open PT-0007 → Left sole → New capture. Turn on airplane mode. Tap Capture.
  2. Expect: after a few seconds, "Saved on this phone. It uploads automatically…".
  3. Go back to the lesion: "1 capture(s) saved on this phone, waiting for a connection."
  4. Turn airplane mode off. Within ~30 s (or tap "Try upload now") the banner disappears and the
     new visit appears in the history strip.

## Item 4 — Research-consent flag + audit log page

Plan:
- Alembic 0003 (additive): `patients.research_consent BOOLEAN NOT NULL DEFAULT false`. Existing rows
  read as "no consent". `PatientCreate.research_consent` optional (default false); `PatientOut` gains
  the field (additive).
- New patient form: explicit Yes/No choice. Shown on the patient screen and in the reviewer's case
  detail.
- `GET /api/audit?limit=&before=&entity_type=` (dermatologist only, newest first, cursor by time):
  actor, action, entity, time. Reviewer portal: "Audit log" page.
- Smoke: consent round-trip; audit visible to dermatologist, 403 for clinician.

Result (22:09 WIB): **done**, commit `cecb336`.
- Alembic 0003 adds `patients.research_consent` (NOT NULL, server default false). Additive: the
  deployed API keeps working; existing patients read "No". Its downgrade drops recorded answers
  (declared one-way for data; restore from backup).
- New patient form requires an explicit Yes/No; shown on the patient screen and the reviewer case.
- `GET /api/audit` (dermatologist only; newest first; `before` cursor; optional `entity_type`) and
  an "Audit log" page in the reviewer portal with "Load older".
- Verified: smoke (consent round-trip, audit 200 for dermatologist / 403 for clinician, cursor
  paging), Playwright 4/4 (consent chosen in both flows, consent visible to the reviewer, the
  review event visible in the audit log). Gate green.
- Morning merge note: deploy applies migration 0003 automatically on API start.

## Item 5 — Printable referral summary

Plan:
- Clinician route `/cases/[caseId]/summary` for answered cases: patient (pseudonymous), lesion site,
  visit timeline with areas, the three views of the reviewed capture, question, recommendation,
  reviewer and time, plus the simulation/no-diagnosis disclaimer.
- "Print / Save as PDF" on web uses `window.print()` (the browser's PDF is the "trivial PDF"); no new
  dependency. Print-only CSS is injected while the page is mounted (hides controls, lets the scroll
  container expand). On native the page renders without the print button.
- Entry: "Referral summary" button on the answered case page.
- Verify: Playwright opens the summary for an answered case and renders it with print media
  emulation (and `page.pdf()` produces a non-empty PDF).

Result (22:13 WIB): **done**, commit `193e315`.
- `/cases/[caseId]/summary` (clinician, answered cases): patient and lesion, question,
  recommendation ("the treating clinician decides"), visit timeline with areas, the three views of
  the reviewed capture, disclaimer. Opened from "Referral summary" on the answered case page.
- Web: "Print / Save as PDF" → `window.print()`; print CSS hides controls, expands the scroll
  container and keeps image backgrounds (RN Web draws images as CSS backgrounds). No dependency.
- Verified: Playwright opens the summary after a review, checks print media hides the button and
  `page.pdf()` is non-empty; the printed A4 page was inspected visually (one page, all three views).
  Native renders the page without the print button (NEEDS PHONE CHECK only for layout).

## Fix found during item 6 — automated-test traffic leaked into demo views

The UI review showed the dermatologist queue full of "Smoke Test Clinician" cases. Every deploy runs
smoke + e2e against production, and the dermatologist role sees all cases, so the demo
dermatologist would see test cases on stage (production already has one open e2e case).

Plan:
- Alembic 0004: `users.is_test BOOLEAN NOT NULL DEFAULT false`, data step flags the two smoke users.
- Dermatologist case list and patient list show only records created by users in the viewer's
  group (test vs real). Nothing is deleted; the audit log still shows everything.
- `create_user --test-user`; provision.sh marks the smoke users.
- Clinician e2e closes its own case through the API so test queues stay small.

Result (22:18 WIB): **done**, commit `9a7ed51`. **Must merge before the demo** (production queue
currently shows at least one automated e2e case to the demo dermatologist).
- Verified: new pytest (real vs test dermatologist see only their group's cases and patients);
  locally after migration 0004 the demo dermatologist's list is exactly PT-0005 (submitted) and
  PT-0003 (answered); smoke and e2e (smoke users) still pass. Gate green (pytest 41, e2e 4/4).

## Item 6 — UI polish

Plan: screenshot every screen (390 px clinician, 1280 px reviewer), fix what is visibly wrong.

Result (22:18 WIB): **done**, commit `da9bd49`.
- 390 px headers overlapped titles ("New patientPatients", "Case · PT-…" under the links): below
  700 px the navigation moves to a bottom bar (same test ids); wide screens keep header links.
- Patients list no longer repeats the code in the subtitle.
- Loading, empty and error states were already present on every screen (checked in screenshots:
  login error banner, empty lists, loading spinners); spacing and type come from one theme file.
- Verified: screenshots re-taken and inspected; gate green.

## Item 7 — README

Result (22:20 WIB): **done**, commit `4576b6d`. Architecture (Mermaid), pipeline, real-vs-simulated
table, before/during GENOHACK table, target-vs-prototype table (from docs/context/chat-handoff.md
§2, labeled as target design), run instructions, quality gate, repository map. Verified: the
documented seed command runs; gate green (docs only, e2e skipped).
