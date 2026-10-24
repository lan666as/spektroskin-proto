# BUILD_LOG — SpektroSkin, GENOHACK 2026

Timestamped record of what was built during GENOHACK (Sat 24 – Sun 25 Oct 2026, WIB).

## Existed before GENOHACK (not built here)

- Proposal (15 and 23 Oct 2026), 12 customer-discovery interviews, Figma UI concept, pitch deck drafts.
- No code from this repository existed before 24 Oct 2026.

## Log

### 2026-10-24 20:30–21:00 WIB — Phase 0: planning
- Planning interview with the builder; decisions recorded in PLAN.md.
- Pre-flight: local toolchain verified; Playwright Chromium 1.64.1 installed; public GitHub repo
  `lan666as/spektroskin-proto` created; Cloudflare Tunnel DNS route `spektroskin.zidan.dev` added
  (VPS ports 80/443 belong to an existing Nginx Proxy Manager).
- No application code written.

### 2026-10-24 21:12 WIB — Phase 0: pre-flight closed
- Tunnel ingress for spektroskin.zidan.dev applied by the builder; verified (502 = no origin yet).
- Added docs/context/chat-handoff.md (context from the claude.ai planning chat); PLAN.md updated:
  deploy ssh fallback, extended-demo dependency, README target-vs-prototype section, pre-flight table.
- Overnight-stall risks checked: Keychain reads without prompts; SSH needs no expiring token.

### 2026-10-24 21:22 WIB — M1: skeleton (gate green)
- Compose stack (postgres:16, FastAPI api, caddy:2 on 127.0.0.1:8480), local override (db port,
  hot reload), Caddyfile (SPA + /api proxy), uv backend, `/api/health` with DB check, Alembic 0001 (users),
  Expo SDK 58 app shell (Expo Router, TanStack Query, SimulatedBadge, theme), Playwright shell test,
  `scripts/gate.sh`.
- Verified: `docker compose up` healthy; `/api/health` 200 via Caddy; `alembic current` = 0001 (head);
  `npx expo export -p web` OK; Playwright 2/2; pytest 2/2 against `spektroskin_test`.
- Dependencies added (all pinned via lockfiles): backend fastapi, uvicorn[standard], pydantic-settings,
  sqlalchemy, psycopg[binary], alembic, pyjwt, bcrypt, numpy, scipy, scikit-image, pillow,
  python-multipart; dev pytest, ruff (uv.lock). Mobile (create-expo-app 5.0.0, template default@sdk-58):
  @tanstack/react-query 5.104.5, expo-secure-store, @react-native-async-storage/async-storage,
  @react-native-community/netinfo (versions via `npx expo install`), dev @playwright/test 1.64.1
  (package-lock.json).

### 2026-10-24 21:30 WIB — M2: simulator + processing pipeline (gate green)
- `backend/simulator`: 14 deterministic phantoms (9 base: pigmented/vascular/mixed × light/medium/dark
  = Fitzpatrick III/IV/V; blur and glare bad captures; acral sole growth series d01/d14/d30 with
  18/22/28 mm² true area). Realism layers: skin-line furrows, acral dermatoglyphic ridges, irregular
  lobulated borders, reticular pigment network, dotted/linear vessels. Virtual device: per-band gain,
  LED vignetting, ambient + offset, shot/read noise, per-capture gain drift, hand-motion shifts of
  the skin only, spacer-fixed gray patches (0.18/0.50). Factory profile: flat-field + dark.
  Frames (16-bit PNG, never ground truth) bundled into `mobile/assets/phantoms` with a generated TS index.
- `backend/app/processing`: QC (Laplacian-variance sharpness, saturation %, reference patches) →
  calibration (dark, flat-field, gain drift from patches) → registration (phase correlation to green)
  → least-squares unmixing of -ln(R/R0) → Otsu + hysteresis segmentation → PNG views with outline.
- Verified (pytest, 32 passed): all 12 clean phantoms pass QC; melanin r ≥ 0.96, hemoglobin r ≥ 0.97,
  mask Dice ≥ 0.96, |area error| ≤ 7.6% (measured); registration error ≤ 0.25 px; blur and glare
  rejected with retake guidance; growth series monotonic and within 3% of truth. Simulated data only.

### 2026-10-24 21:38 WIB — M3: data model, API, demo auth, images, audit (gate green)
- Alembic 0002: patients, lesions, captures (client UUID, JSONB qc/result), cases (+ status index),
  case_captures, reviews (one per case), audit_events. CHECK constraints for every enum field.
- API under /api: auth (token, me), patients (list/create/get), lesions (create, get with history),
  captures (multipart upload → synchronous processing, idempotent on client id), cases (list/queue,
  create, get, review), images (signed short-lived URLs). Role checks server-side; clinicians see
  only their own patients and cases. Audit event on every read/write of patient data.
- `scripts/create_user` (password via stdin), `scripts/seed` (idempotent PLAN §7 data),
  `scripts/provision.sh` (Keychain → create_user → seed, local or over ssh), `scripts/smoke.py`.
- TS types generated from OpenAPI (`mobile/src/api/schema.d.ts`).
- Verified: smoke 32/32 checks against the local stack (incl. 401/403/409/422 paths, idempotent
  retry, QC failure, tampered image signature); seed re-run idempotent; gate green.

### 2026-10-24 21:48 WIB — M4: clinician flow + longitudinal history (gate green)
- Expo app (web + Android): demo login (autofill-friendly), patients (list/create with suggested
  pseudonymous code), patient → lesions, body-site picker (acral sites first), capture screen
  (device card "Virtual module connected · Simulated", band-by-band progress, hidden dev phantom
  picker, default `acral_dark_d30`), results (QC card with retake guidance, Standard / Pigment /
  Vascular tabs with outline and Simulated badge, area, Day 01/14/30 history strip with area change,
  footnote), submit for review, My cases (polls 5 s), case page with the recommendation.
- `CaptureDevice` interface + `VirtualCaptureDevice` (bundled phantom frames via expo-asset;
  platform files `frameSource.ts` / `frameSource.web.ts`); upload retries reuse the capture id.
- Verified: Playwright at 390 px — login → patient → lesion → glare capture fails QC → retake →
  three visits → three views → area change → submit → My cases.

### 2026-10-24 21:48 WIB — M5: reviewer portal + answer loop (gate green)
- Reviewer queue (submitted + in review, polls 5 s; recently answered), case detail (two columns on
  wide web: views + lesion history | patient metadata, question, review form), recommendation sent
  back to the clinician ("The dermatologist recommends; the treating clinician decides").
- Verified: Playwright with two browser contexts (390 px clinician, 1280 px dermatologist):
  clinician submits → dermatologist sees it in the queue and recommends Biopsy / 14 days →
  clinician page shows the recommendation via polling. Full gate: pytest 32, smoke 32/32, e2e 4/4.

### 2026-10-24 21:56 WIB — M6: deployed, tagged v-core
- `scripts/deploy.sh` (refuses unless clean `main` + green gate; pushes; VPS `git pull --ff-only`;
  ships the gate-tested web export; `docker compose -f docker-compose.yml up -d --build --wait`;
  provisions users from Keychain over ssh; seeds; verifies publicly).
- Verified against https://spektroskin.zidan.dev (commit 9c6872d): health 200, smoke 32/32,
  Playwright e2e 4/4 (clinician flow at 390 px, two-context review loop). Demo clinician sees seeded
  PT-0003 / PT-0005 / PT-0007; PT-0007 sole has Day 01 (18.4 mm²) and Day 14 (22.6 mm²) visits.

### 2026-10-24 21:57–22:22 WIB — Phase B: overnight queue (branch `overnight`, not deployed)
- Validation: `GET /api/validation/{capture_id}`, results-screen panel, skin-tone-stratified
  `docs/evidence/validation_report.md` (90 clean captures; QC 90/90; blur and glare rejected 10/10
  per tone; simulated data only, with the shared-model limitation stated).
- Offline capture queue with sync on reconnect (native; Android bundle compiles; needs phone check).
- Research-consent flag (Alembic 0003) and audit log page.
- Printable referral summary (browser print / save as PDF).
- Fix: automated-test records kept out of demo users' lists (Alembic 0004 `users.is_test`).
- UI polish (bottom navigation on narrow screens), README, rehearsal twin PT-0009.
- Every commit gated (pytest 41, smoke, Playwright 4/4). Details: OVERNIGHT_REPORT.md.

### 2026-10-24 22:26 WIB — Overnight work merged and deployed (builder's request)
- `overnight` fast-forwarded into `main`; `scripts/deploy.sh` deployed 86c6e33: gate green, Alembic
  0003 + 0004 applied, public smoke passed, Playwright e2e 4/4 against https://spektroskin.zidan.dev.
- Verified in production as the demo accounts: dermatologist sees only PT-0005 (submitted) and
  PT-0003 (answered); clinician sees PT-0003 / 0005 / 0007 / 0009; PT-0007 and PT-0009 each have
  Day 01 (18.4 mm²) and Day 14 (22.6 mm²) visits.

### 2026-10-24 23:18 WIB — Demo iteration with the builder (deployed after each step)
- Simple demo passwords (builder's request; provisioning resets them from Keychain).
- Visible multispectral capture: each LED band frame (470/550/660/850 nm + dark) appears as it fires.
- Day 01 vs latest visit compare (same view, same scale, area change); selectable visits on the
  lesion page; tap-to-enlarge images.
- Live-feel review loop: 2 s polling, "New" highlight in the queue, "Recommendation received just
  now" banner, "Sent to …" state for the reviewer.
- UX pass: quick-question chips, review phrase chips (picked by the human reviewer), role chips on
  login, lesion thumbnails, submit button earlier on the results screen, wrapping chips.
- Every step: gate green, deployed with scripts/deploy.sh, public smoke + Playwright 4/4.

### 2026-10-24 23:54 WIB — Phone upload fix and deeper iteration (deployed after each batch)
- Bug (reported by the builder from the phone): captures were always "saved offline". Cause: Expo
  SDK 58 replaces global fetch with expo/fetch on native, which rejects React Native file parts
  ({uri, name, type}) while building the body; the client classified any thrown fetch as a network
  error. Fix: multipart upload via XMLHttpRequest (RN networking), real errors surfaced, upload
  progress shown. Native path verified by Android bundle compile only; needs phone confirmation.
- Spectral signature (measured reflectance per band, lesion vs skin) computed by the pipeline and
  charted; quality and calibration details; case timeline with response time; clinician home
  (overview, latest recommendation, search, richer patient rows); About page for judges;
  pull-to-refresh; SpektroSkin icon set; body-map site picker; all-views side by side for
  reviewers; browser-tab badge; case filters; acral-site flag; spacer guide; offline banner and
  pending-upload strip; referral summary visit comparison.
- E2E flake fixed (random patient codes collided after many runs; now picks an unused code).

### 2026-10-25 00:16 WIB — Iteration loop, batch 1 (backlog items 1, 2, 4, 10)
- Lesion measurements: longest diameter (max Feret) and width (ellipse minor axis) in mm, computed
  by the pipeline; measurement summary above the fold on the results screen (area, size, change
  since the first visit); reviewer case card shows size and change.
- "Automated analysis" card on results and reviewer screens: quality check, outline and size,
  change across visits, pigment and blood maps, each with how it works and its limits; "Lesion
  assessment (triage support): Not active".
- In-app AI roadmap (tiers active / research / planned; the RGB-vs-spectral ablation as the optics
  kill test; "never shown" rules).
- Demo-script Playwright spec (PLAN §6 core + extended, smoke users, screenshots on demand) now part
  of every gate and every live verification; `scripts/ship.sh` tags each verified deploy live-N.

## Decisions made alone
- M1: Expo routes live in `mobile/src/app/` (SDK 58 template convention) instead of `mobile/app/`.
- M1: web export uses `web.output: "single"` (SPA) so Caddy can serve deep links via `try_files`.
- M1: `python-multipart` added: FastAPI needs it for the multipart `POST /captures` and OAuth2 form.
- M1: Alembic reads `DATABASE_URL` directly so migrations run without app secrets.
- M2: thresholds from measured phantom metrics: sharpness ≥ 5e-5 (clean 1.0–2.1e-4, blur 2.1e-5);
  saturated ≤ 0.2% (glare 2.9%); patch ratio 0.50/0.18 within ±20%; Otsu with hysteresis down to 0.5×.
- M2: unmixing adds a band-independent offset term (skin-line shading) beside melanin and hemoglobin.
- M2: phantoms are 256×256 px at 0.04 mm/px; the Docker build regenerates them from the same seeds.
- M3: images use short-lived signed URLs (JWT, 2 h, bound to capture, view and viewer) because
  `<img>` on web cannot send an Authorization header; each image fetch is audited for that viewer.
- M3: dedicated `smoke-clinician` / `smoke-dermatologist` users (Keychain items
  `spektroskin-smoke-*`) for smoke and e2e runs, so automated runs never touch demo-account data.
- M3: clinicians list only patients they registered; dermatologists see all (demo-friendly scoping).
- M3: added `GET /patients/{id}` (additive) for the patient → lesion screen.
- M3: dermatologist opening a submitted case moves it to `in_review`.
- M4: web session token in `sessionStorage` (per tab), not AsyncStorage/localStorage: the demo
  runs clinician and dermatologist windows side by side on one origin. Native uses SecureStore.
- M4: `expo-asset` (Expo SDK module, `npx expo install`, ~58.0.18) declared explicitly for loading
  bundled phantom frames; `typedRoutes` experiment disabled to keep `tsc` independent of codegen.
- M4: seed visit d14 at now − 16 d so the strip reads Day 01 / 14 / 30 (local dev DB keeps its
  earlier row; prod is seeded fresh).
- M6: first deploy reached production, but the public smoke failed with Cloudflare error 1010
  (Browser Integrity Check bans the default `Python-urllib` User-Agent). Browsers, curl and okhttp
  (Android) get 200. Fix: the smoke script sends `spektroskin-smoke/1.0 (+repo URL)`; no Cloudflare
  setting changed.

## Deviations
- M2: pipeline order is QC → calibration → registration (spec says registration before calibration),
  because flat-field and the reference patches are fixed to the sensor while hand motion moves only
  the skin; flat-fielding after shifting would misalign the vignetting correction.
- M1: `openapi-typescript@7.13.0` declares a TypeScript 5 peer, but SDK 58 ships TypeScript 6. It runs
  pinned via `npx -y openapi-typescript@7.13.0` (npm script `gen:api`) instead of as a devDependency.

## 2026-10-25 00:32 WIB — Iteration loop, batch 2: learned image-quality classifier (backlog item 3)

- scikit-learn (dev-only, pinned in uv.lock) trains a multinomial logistic regression on 12 image
  statistics from simulated captures with randomized blur and glare severities
  (`backend/scripts/train_quality_model.py`, deterministic). Held out: every capture of the mixed
  lesion type (72). Held-out accuracy 0.97 vs 0.90 for the rule-based check on the same captures.
  Model card: `docs/evidence/quality_model_card.md`.
- Production runs numpy inference over exported JSON weights (`app/processing/models/quality_v1.json`);
  the result carries `quality_model` as an advisory second opinion. The rules still gate.
- App: QC card shows the second opinion and whether it agrees with the rules; the automated analysis
  card has a "Learned quality model" row; AI roadmap Tier 1 and README updated.
- Builder override at 00:30 WIB: start a diagnosis-assist model. Agreed path: synthetic lesion-pattern
  triage model with real held-out metrics and an RGB-vs-spectral ablation, research mode, no
  malignancy probability (phantoms carry no such labels).

## 2026-10-25 00:47 WIB — Iteration loop, batch 3: research-mode triage model (builder override)

- `backend/scripts/train_triage_model.py`: 900 training and 450 held-out simulated lesions (disjoint
  seeds; random tone, size, acral site, and overlapping pigment/blood strengths so faint mixed lesions
  genuinely resemble pigmented ones). A first run with narrower ranges scored 100 % held-out, which
  meant the task was trivial; the ranges were widened before accepting any number.
- Multinomial logistic regression on lesion-vs-skin statistics (scikit-learn dev-only, numpy inference
  from `app/processing/models/triage_v1.json`). Abstains below 70 % top probability.
- Held-out: accuracy 0.98 (light 0.99, medium 0.98, dark 0.96); answers 96 %, 0.99 correct when it
  answers. Ablation, same outline: RGB bands only 0.95 (dark 0.93) vs RGB + NIR + maps 0.98.
  Model card: `docs/evidence/triage_model_card.md`.
- Pipeline split into `measure()` (deterministic, no ML) and `run()` (measure + advisory opinions),
  so training reuses the exact production measurements.
- App: "Triage support" card (results screen and reviewer case) with pattern, per-pattern bars, abstain
  state, held-out numbers and "Research mode · not a diagnosis · Simulated training data" badges; row in
  the automated analysis card; "Benign or malignant assessment: Not active" row kept; AI roadmap Tier 3
  split into 3 (pattern, research mode) and 3b (suspicion for biopsy, not active); Tier 4 shows the
  ablation. PLAN.md §0 amendment recorded. E2E demo script asserts the card and that no malignancy
  probability or risk score text appears.
- Seeded captures processed before this change carry no triage opinion (no backfill on production
  data); new captures do.

## 2026-10-25 00:57 WIB — Iteration loop, batch 4: care lifecycle (backlog items 5, 6)

- Migration 0005 `outcomes` (one per case, CHECK-constrained action and histopathology, FK indexes);
  `PUT /api/cases/{id}/outcome` (requesting clinician only, after the review, row-locked, idempotent
  upsert, audited). Histopathology only with a biopsy or excision (422 otherwise). Additive fields on
  cases: `follow_up_due`, `outcome_action`, `histopathology`, `outcome`.
- App: outcome form and summary on the clinician case (action, date, histopathology, report
  summary); the dermatologist sees the outcome on the case; the recommendation shows the follow-up
  due date; the clinician home gets a "To do" list (record outcome, histopathology pending,
  follow-up due or overdue).
- Tests: outcome ordering, ownership, idempotent replace, tissue rule; smoke covers the endpoint;
  the demo-script e2e records biopsy → pending → benign and checks the reviewer sees it.

## 2026-10-25 01:09 WIB — Iteration loop, batch 5: explainable triage and dermoscopy-style measurements

- Builder directive (01:35 WIB): prioritise the AI-assisted diagnosis story and features.
- Triage model output now carries its top 3 drivers ((coefficient − mean) × standardised value),
  shown as "Why this suggestion" (e.g. "High blood excess · supports").
- `segmentation.morphology()`: asymmetry (mirror overlap about the principal axes), border
  irregularity (perimeter²/4π·area), pigment variation (CV of melanin excess; null when barely
  pigmented), blood-spot focality. New "Dermoscopy-style measurements" card (results and reviewer)
  with change since Day 01; values are shown individually and never summed into a score.
- Tests: drivers name the expected chromophores; border irregularity rises across the acral growth
  series. E2E asserts the card, the drivers, and that no numeric score appears.

## 2026-10-25 01:20 WIB — Iteration loop, batch 6: every capture is a new simulated capture (builder request)

- `POST /api/simulator/captures` (server-side virtual module): returns a fresh frame set for a
  lesion. Each lesion keeps a stable simulated identity seeded from its id (pattern, size, shape,
  growth rate), tone from the patient's Fitzpatrick type, acral from the body site; growing lesions
  get larger with days since the first capture. Every call draws new noise and hand motion. About
  1 in 10 captures of a generated lesion is blurred or has glare (never twice in a row, never for
  automated test accounts, whose checks must stay deterministic). Lesions on a catalogue growth
  series continue the series (Day 01 → 14 → 30).
- Phantom ids `gen-<hash>-<tone><acral>-d<day>[-variant]` rebuild their ground truth, so
  `GET /validation` works on generated captures.
- App: VirtualCaptureDevice defaults to "auto" (asks the server simulator, then uploads through the
  normal capture path); offline it falls back to the bundled frame sets and the upload queue; the
  developer picker still selects a fixed phantom.
- Smoke: simulate → download frames → upload → processed with triage → validation.
- Phone: frames are attached by URL (React Native downloads them when sending the multipart
  request). NEEDS PHONE CHECK.

## 2026-10-25 01:33 WIB — Iteration loop, batch 7: acral pattern model (research mode)

- Simulator: acral lesions carry `acral_pattern` (furrow / ridge) and `acral_modulation`; new
  catalogue phantom `acral_ridge_dark` (bundled; existing phantoms byte-identical); generated acral
  lesions are ridge-patterned 35 % of the time.
- `app/processing/acral_model.py`: correlates the band-passed melanin map with the band-independent
  shading term of the unmixing (the ridges); logistic regression on 5 features, abstains below 75 %.
  Trained on 400 / held out 240 simulated acral lesions with pattern strength 0.005–0.35: held-out
  accuracy 0.99; answers 91 %, 1.00 correct when answering; on faint patterns (< 0.05) it answers
  only 54 %. Model card `docs/evidence/acral_model_card.md`.
- App: "Acral pattern" card (results, reviewer) only for palm, sole and nail sites; a ridge pattern
  shows the guideline line (Saida 2004: prompt dermatologist review). Analysis row and AI roadmap
  entry. E2E: demo lesion reads furrows; a ridge lesion is flagged.

## 2026-10-25 01:43 WIB — Iteration loop, batch 8: shadow-mode validation and the AI & validation page (backlog item 7)

- Migration 0006: `reviews.pattern_read` (dermatologist's own read of the dominant pattern) and
  `reviews.ai_hidden` (blind read). Review form: optional pattern read; reviewer case: "Hide AI until
  I send" toggle (hides triage, acral and automated-analysis cards); after sending, the triage card
  shows "Your read … · model agrees / differs / abstained".
- `GET /api/ai/summary` (dermatologists, group-scoped, audited): model cards with held-out metrics
  and the triage RGB-vs-spectral ablation; live shadow-mode agreement (all and blind); validation
  funnel (cases → reviewed → consented → outcome → histopathology-confirmed → eligible). Scope text
  states all captures are simulated.
- Reviewer "AI" page renders it. Tests: agreement and eligibility logic; smoke covers the endpoint
  and the 403 for clinicians; e2e covers the pattern read, the agreement line, the blind read and
  the AI page.

## 2026-10-25 01:51 WIB — Iteration loop, batch 9: explainable attention flags in the review queue

- `app/attention.py`: per case, named flags from the lesion's captures: `ridge_pattern` (acral site
  and the acral model reads ridges), `growing` (area +20 % since the first visit), `border_change`
  (border irregularity +0.05), `ai_unsure` (triage model abstained). Additive `attention_flags` on
  cases. Never a score; the queue order stays first come, first served.
- Queue: flag pills and an "All / With attention flags" filter; case page lists each flag with why
  it was raised. Tests for the flag rules; demo e2e asserts "Growing" on the demo lesion.

## 2026-10-25 01:59 WIB — Iteration loop, batch 10: AI evidence map, honesty text corrected

- New "AI evidence" view per capture (`render.evidence_view`): amber = melanin above the surrounding
  skin, red = blood above it (blended by share), pink = brightest blood spots, on a grey standard
  view with the outline. It shows where the evidence the triage model reads sits. Added to the image
  whitelist and to the view checks in tests, smoke and e2e.
- Corrected statements that had become false: the app footnote and the About page said "no AI";
  they now say what the AI is (research-mode suggestions from models trained on simulated data) and
  still rule out diagnosis, cancer probability and risk scores. About's real-vs-simulated table lists
  the models (real code) and their accuracy numbers (simulated data).

## 2026-10-25 02:08 WIB — Iteration loop, batch 11: similar-case retrieval

- Triage output now stores its standardised feature vector (`embedding`). `GET /api/cases/{id}/similar`
  (dermatologists, group-scoped, audited): reviewed cases of other lesions nearest by Euclidean
  distance, with recommendation, dermatologist pattern read, outcome and histopathology.
- Reviewer case page: "Similar reviewed lesions" card (hidden during a blind read). Stated as
  retrieval for context, not a prediction. Captures processed before this batch have no embedding
  and are not retrieved (no production backfill).
- Tests: DB test for ranking and same-lesion exclusion; smoke covers the endpoint; demo e2e asserts
  the card.

## 2026-10-25 02:19 WIB — Iteration loop, batch 12: audit 2 fixes

- Audit 2 (docs/screenshots/20261025-0212-audit-2, critique in ITERATION_BACKLOG.md).
- The acral pattern model no longer runs without pigment to read (melanin excess < 0.3); this fixes
  a false "follows the furrows" on vascular acral lesions. Test added; model card notes it.
- AI card badges wrap at phone width; the measurements card moved below the submit button.
- `scripts/reprocess_captures.py` (dry run by default) adds the newer outputs to captures from
  before batch 2. Verified on the local dev database (195 updated, 0 skipped, idempotent). Not run
  on production: it is a backfill and needs the builder's go-ahead.

## 2026-10-25 02:30 WIB — Iteration loop, batch 13: referral summary and out-of-distribution guard

- Referral summary (printable) now carries the outcome and histopathology, automated measurements
  (area, size, asymmetry, border, pigment variation), attention flags, the AI suggestions labelled
  research mode with the dermatologist's own pattern read, and the evidence view (backlog item 9).
- Triage model out-of-distribution guard: captures whose standardised features lie beyond the
  99.5th percentile of training norms (> 7.20) get no suggestion ("outside the training range");
  0.9 % of held-out simulated lesions were withheld. Same weights (deterministic retrain); the
  model card documents the guard. Test: a 5× pigment shift is withheld.

## 2026-10-25 02:37 WIB — Iteration loop, batch 14: per-skin-tone results on the AI page

- `/api/ai/summary` model entries carry held-out accuracy per simulated tone, and per tone for both
  ablation arms of the triage model. The AI page shows a tone strip per model with the lowest tone
  outlined, and states the finding plainly: both pattern models are least accurate on Fitzpatrick V
  (triage 0.96, acral 0.97); the quality model is lowest on light skin (0.92).
