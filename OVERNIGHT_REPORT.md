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

Result (22:04 WIB): **done (native path NEEDS PHONE CHECK)**, commit: see "Offline capture queue" below.
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
