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

## 2026-10-25 02:45 WIB — Iteration loop, batch 15: change since Day 01 (registered outlines)

- `app/processing/change.py`: registers the lesion's first processed visit onto the new capture by
  skin texture (phase correlation), then compares outlines: new area, receded area, overlap. At
  ingest the new capture stores a "change" view (blue = Day 01 outline, teal = now, amber = new
  area) and `change_since_first` numbers (additive field).
- App: "Change since Day 01" view tab; the evolution row of the measurements card shows mm² new and
  receded. Tests: Day 01 → Day 30 shows 7–13 mm² of new area with the old outline still covered;
  two captures of the same lesion show < 1.5 mm² change. E2E cycles the change view.

## 2026-10-25 02:53 WIB — Iteration loop, batch 16: AI at a glance, visual refresh (backlog item 8)

- Results screen: "AI assist · research mode" strip right under the quality check (pattern, acral
  pattern on acral sites, new area since Day 01), so the AI shows within the first screen of the demo.
- Light-grey canvas with white, softly shadowed cards and list rows; white stat tiles on home.

## 2026-10-25 03:03 WIB — Iteration loop, batch 17: AI evaluation report, and the noise check it led to

- `scripts/ai_evaluation.py` → `docs/evidence/ai_evaluation.md` (deterministic):
  - Repeatability: 12 phantoms × 10 captures. Same triage output 100 %, triage right 100 %, same
    acral output 100 %, area CV ≤ 0.1 %, border SD ≤ 0.007.
  - Sensor-noise stress at ×1, ×2, ×4 and ×8.
- Finding: the first run showed every ×8-noise capture passed the quality check, and so did the
  learned quality model; only the triage model's abstention and out-of-distribution guard reacted
  (28 % withheld).
- Fix: a QC rule on high-passed pixel noise inside the gray reference patches (> 0.02, about 3×
  the simulated module), with retake guidance. ×1 and ×2 pass; ×4 and ×8 are rejected. Test added;
  the quality details panel shows the metric. The learned quality model still misses noise:
  documented as the next retraining target.
- Simulator `capture()` gained `noise_scale` (default 1.0: existing phantoms unchanged).

## 2026-10-25 03:11 WIB — Iteration loop, batch 18: quality model v2 learns noise

- `quality_v2` replaces v1: adds the noisy class (sensor noise ×2.5–10) and a patch-noise feature
  (13 features). Held-out (mixed lesions, 96 captures): accuracy 0.96 vs 0.88 for the rules; noisy
  recall 24/24. In the stress test it now calls ×4 and ×8 captures noisy and flags some ×2 captures
  the rules accept (shown in the app as a disagreement). Model card, AI roadmap and evaluation
  report updated; test added.

## 2026-10-25 03:21 WIB — Iteration loop, batch 19: measured-findings draft, live model monitoring

- Reviewer form: "Insert measured findings (edit before sending)" fills the impression with size,
  growth, asymmetry and border change and, unless the read is blind, the research-mode AI
  suggestions, labelled as such. The interpretation stays the dermatologist's. Demo e2e asserts it.
- `/api/ai/summary` `monitoring` over the group's captures in the last 30 days: QC pass, quality
  model vs rules disagreement, triage abstentions, out-of-range rate, suggested patterns, acral
  ridge reads. AI page "Monitoring" card with an out-of-range warning above 5 %. Test added.

## 2026-10-25 03:29 WIB — Iteration loop, batch 20: privacy-minimised validation-set export

- `GET /api/ai/validation-set` (dermatologists, group-scoped, audited with the record count):
  consented, reviewed, histopathology-confirmed cases only.
  - Kept: case and capture ids, a simulated flag, a 10-year age band, sex, Fitzpatrick type, body
    site, the dermatologist's action and pattern read, the histopathology category, and the model's
    suggestion.
  - Left out: names, patient codes, free text and exact age.
- AI page: "Download validation set (JSON)" on web. Tests: eligibility and minimum fields (unit);
  smoke covers the endpoint; demo e2e downloads it, finds the benign demo case and checks the
  patient code is absent.

## 2026-10-25 03:37 WIB — Iteration loop, batch 21: learning queue (active learning)

- `/api/ai/summary` `learning_queue`: newest reviewed cases where the dermatologist's pattern read
  differs from the model or the model abstained (an "unsure" read is skipped). AI page "Learn from
  these first" card, each case linking to its review. Unit test; demo e2e asserts the card.

## 2026-10-25 03:45 WIB — Iteration loop, batch 22: area trend on the lesion page; demo script revised

- Lesion page: "Area over visits" bar chart (zero-based, first and latest values labelled) with the AI
  pattern suggested at each visit underneath (Figma timeline idea, pre-hackathon inspiration only).
  Demo e2e asserts it.
- PLAN §6 demo script rewritten around the AI moments (AI assist strip, evidence and change views,
  flags, reasons, similar lesions, findings draft, AI page, outcome → validation export).

## 2026-10-25 03:54 WIB — Iteration loop, batch 23: triage calibration, README AI section

- Triage model card and metrics now include calibration on held-out data: expected calibration
  error 0.034, with reliability per confidence bin. The model is slightly under-confident at
  70–90 % (says 0.85, right 0.94), the safer direction. Same weights (deterministic retrain). The AI
  page shows the calibration error.
- README: "AI-assisted review" section (models, held-out numbers, cards, surrounding features,
  evaluation) and AI rows in the real-vs-simulated table.

## 2026-10-25 04:05 WIB — Iteration loop, batch 24: audit 3 fix

- Audit 3 (docs/screenshots/20261025-0359-audit-3). The monitoring tile counted acral ridge reads on
  non-acral lesions. Two fixes:
  - the capture ingest now stores no acral read for non-acral sites (root cause; smoke asserts it on
    a forearm lesion);
  - monitoring counts acral sites only (unit test).

## 2026-10-25 04:14 WIB — Iteration loop, batch 25: ugly-duckling sign

- `attention.looks_different`: with ≥ 3 measured lesions on a patient, a lesion whose mean
  distance to the others in the triage feature space is ≥ 1.6× the median of theirs and ≥ 2.5 is
  flagged as "looks different" (ugly duckling sign).
  - Shown on the patient page (pill and note).
  - Also a queue attention flag.
  - `LesionOut.looks_different` (additive).
- Seed: PT-0011 (47 F, IV) with three alike pigmented lesions and one mixed lesion on the lower
  back. Additive and idempotent: the seed gained a per-lesion key; existing ids are unchanged.
  PLAN §7 updated.
- Tests: unit (needs 3 lesions, flags only a clear outlier); new e2e spec builds such a patient as
  the smoke user and checks only the lower-back lesion is flagged.

## 2026-10-25 04:24 WIB — Iteration loop, batch 26: "Worth a second look" on the clinician home

- `GET /patients` items carry `lesion_flags` (growing ≥ 20 % since the first visit; looks different
  from the patient's other lesions). Clinician home lists up to five with the reason and links to
  the lesion. Unit test; the ugly-duckling e2e checks the card.

## 2026-10-25 04:33 WIB — Iteration loop, batch 27: seed collision fixed forward; consent can change

- **Mistake (batch 25), reported, not reverted:** production already had a patient PT-0011 (the
  builder's own test patient, 31 F, VI). The seed looked patients up by code, so the deploy
  attached four seeded lesions with one capture each to that patient. Nothing was deleted or
  overwritten.
  - Lesions: b8b27005-f046-5d95-be70-a42f8dda3d00, 1a5ae85a-0f71-5384-aa7d-47d41a4c105b,
    b7b42ec0-1206-5bdd-b132-5fddfe49328a, 08375ce7-c6fc-540d-8b52-a7e1b036c2f0.
  - Captures: 9979d285-be2f-5d79-84d5-9f0a1fc113f0, 9101ba4e-76d2-50cb-8108-3e697358dcdb,
    e18c0e31-be4a-563f-9669-08d373b5aaa3, 85996485-5f4f-546f-b13e-f14241a0a5e9.
  - Removing them is a production delete, so it is left for the builder.
- Fix forward:
  - the multi-lesion demo patient moves to PT-0091;
  - the seed now skips any code held by a patient with different age, sex or Fitzpatrick type
    (DB test added).
- `PUT /api/patients/{id}/consent` (registering clinician, idempotent, audited as given or
  withdrawn). The patient page has a Yes/No consent control. Withdrawal removes the cases from the
  validation set at once, because eligibility is computed live. Smoke and e2e cover it. PLAN §6:
  set PT-0007 consent to Yes before the demo.

## 2026-10-25 04:41 WIB — Iteration loop, batch 28: assumptions-tested evidence page

- `docs/evidence/assumptions_tested.md`: eleven assumptions with the test, the result, the verdict
  (including the two that failed or partly failed: the dark-skin gap and the noise QC gap) and the
  source file; plus what was deliberately not tested. Linked from the README. Correction before
  commit: the first draft overstated the worst-case map correlation; it now quotes the validation
  report exactly.
- About page evidence card: four AI rows (triage held-out, RGB-vs-spectral, repeatability, noise
  finding).

## 2026-10-25 04:50 WIB — Iteration loop, batch 29: "Run AI on this capture"

- `app.captures.add_newer_outputs` (shared by the reprocess script and a new endpoint): re-runs the
  deterministic pipeline on stored raw frames and adds only the missing outputs. It refuses if the
  stored area would change (409) and drops the acral read on non-acral sites.
- `POST /api/captures/{id}/ai`: allowed for the capturing clinician and for dermatologists of the
  same group (per-object check; 404 otherwise); idempotent and audited.
- App: results screen and reviewer case show "Run AI on this capture" on captures processed before
  the models existed, such as the seeded demo history. The builder can light up the AI on old demo
  data with one click; nothing is backfilled automatically.
- Tests: DB test (outputs added once, area unchanged, second run is "current"); smoke covers the
  endpoint.
- Finding (fixed in batch 30): `GET /captures/{id}` had no per-object check (any signed-in user
  can read any capture by id). Listed for the morning.

## 2026-10-25 04:58 WIB — Iteration loop, batch 30: per-object authorization everywhere

- `auth.authorize(session, user, owner_id)`: clinicians reach only records of patients they
  registered; dermatologists only their group's (real vs automated-test accounts); 404 otherwise.
- Applied to:
  - reads: `GET` patient, lesion, capture and validation;
  - creates: `POST` lesions (patient), captures (lesion, including the idempotent retry path) and
    cases (lesion);
  - case open and review;
  - the server simulator and run-AI.
- Before, any signed-in user could read a patient, lesion or capture by id.
- Test: owner and same-group access allowed; another clinician and an other-group dermatologist get
  404 for patient, lesion and case. Full gate green; the live smoke and e2e are the check after
  deploy.

## 2026-10-25 05:06 WIB — Iteration loop, batch 31: compare shows only views both visits have

- Read-only check on live as the demo clinician (PT-0007 seeded Day 14 visit): "Run AI on this
  capture" shows as intended. The visit compare card offered AI evidence / change views that the
  older visit lacks; it now lists only views both visits have.

## 2026-10-25 05:14 WIB — Iteration loop, batch 32: AI roadmap matches what runs

- Roadmap: Tier 2 lists the new measurements, registered change and ugly-duckling flag; Tier 3a
  shadow-mode validation and Tier 4 ablation are now marked "Research mode · simulated data"
  (both implemented tonight); Tier 3b (suspicion for biopsy) stays "Not active"; tiers in order.

## 2026-10-25 05:21 WIB — Iteration loop, batch 33: draft the question from the measurements

- Submit screen: "Draft the question from the measurements" fills the question with size, growth,
  asymmetry and border and the research-mode AI suggestions (labelled), ending "Biopsy, observe or
  refer?"; editable. Demo e2e asserts the draft.

## 2026-10-25 05:30 WIB — Iteration loop, batch 34: neural-network experiment (not deployed)

- `scripts/experiment_mlp.py` → `docs/evidence/experiment_mlp_vs_features.md`: scikit-learn MLP (64
  hidden units) on 2 × 32×32 pigment and blood map crops, same lesions and split as the triage
  model. Held-out 0.93 (dark skin 0.91) vs 0.98 (0.96) for the deployed explainable model, which
  stays. Added as assumption 12 in `assumptions_tested.md`.

## 2026-10-25 05:39 WIB — Iteration loop, batch 35: final audit fix

- Final screenshots: `docs/screenshots/20261025-0535-final/` (demo script on live, full results page,
  AI page, AI roadmap). The triage and acral card badges were still clipped at 390 px (the batch-12
  fix wrapped inside a row without a width); they now sit on their own wrapping line. Checked by a
  screenshot of the card at 390 px.

## 2026-10-25 05:45 WIB — Iteration loop: summary written

- ITERATION_BACKLOG.md summary covers:
  - how to test (web, phone);
  - decisions needed from the builder (run AI on seeded visits, PT-0007 consent, the PT-0011 seed
    mistake, the Dependabot advisories);
  - what changed, with screenshot folders;
  - phone checks, the updated demo script, deck and Q&A lines on the AI, and known limits.

## 2026-10-25 06:20 WIB — Builder requests: PT-0011 cleanup, motto, melanoma checklists

- **PT-0011 cleanup (builder-approved):** `scripts/remove_seed_leak.py`.
  - It removes exactly the 4 seeded lesions and their captures, rows and stored files, only if
    each lesion still belongs to PT-0011, has no case, and holds only the listed capture.
  - It ran through the deploy path, not raw ssh: a dry run on live-38 listed exactly the 4; the
    apply ran on live-39; it is a no-op on later deploys.
  - The builder's own PT-0011 lesions were untouched.
  - Storage gained `delete_prefix`.
- **Motto** now "A second look shouldn't require a second visit." (login, About, README, PLAN).
- **AI-assisted diagnosis support:** `app/processing/checklists.py` scores published melanoma
  checklists automatically:
  - the ABCD rule of dermoscopy (TDS = 1.3A + 0.1B + 0.5C + 0.5D; benign < 4.75, suspicious to 5.45,
    highly suspicious above);
  - BRAAFF for acral lesions (Lallas 2015; ≥ 1 suggests acral melanoma);
  - pigmented lesions only (vascular lesions are "not applicable");
  - BRAAFF is dropped on non-acral sites.
- **In the app:** a "Melanoma checklists" card (results, reviewer) with each item, the published
  thresholds, citations and a "consider review and biopsy" line when a threshold is met; a line in
  the AI assist strip; a queue flag "Checklist threshold met"; the referral summary line; an AI
  roadmap tier.
- No probability is shown. PLAN §0 amendment records the override of the no-risk-score rule for
  these published scores. Tests: formula, applicability, BRAAFF on the ridge phantom; e2e asserts
  the cards. Item thresholds were set on simulated phantoms; item detection is not clinically
  validated, and the card says so.

## 2026-10-25 06:30 WIB — UX batch 1: pinned submit, reviewer layout

- `Screen` gained a pinned `footer`. The results screen pins "Submit for dermatologist review" above
  the tab bar (it used to sit under about 10 cards).
- Reviewer case: triage, acral and checklist cards moved to the left column under the images. The
  right column is case info → blind-read toggle → review form (now on the first screen at
  1440 px) → similar lesions and timeline.

## 2026-10-25 06:40 WIB — UX batch 2: journey shortcuts

- Answered case with a follow-up interval: "Capture follow-up visit (due …)" goes straight to the
  capture screen for that lesion. Demo e2e asserts it.
- Dermatologist: after sending, "Next waiting case: PT-…" opens the oldest waiting case.
- Results: spectral signature, quality metrics and validation fold under "Technical details"; e2e
  opens it before the validation step.

## 2026-10-25 06:55 WIB — Live failure, revert, root cause, re-land (UX batch 2)

- **What failed:** after UX batch 2 deployed (live-41 → 9973d97), the live review-loop e2e failed:
  the audit row was not among the newest 50.
- **Revert:** 9973d97 was reverted and redeployed at once. That deploy failed live too, this time
  on the clinician spec (60 s test timeout, 1.3 min run).
- **Root cause:** environmental, not the change.
  - Right after `up --build` and provisioning the VPS was slow.
  - Live uploads take 0.8 s and the patient and case lists 0.35 s.
  - A calm re-run of the reverted state passed 6/6, so it was tagged live-42.
- **Fixes, no assertion weakened:**
  - the clinician spec declares a 120 s budget (it runs about 42 s against the 60 s default);
  - review-loop checks the audit row right after sending instead of at the end.
- UX batch 2 re-landed with these test fixes.

## 2026-10-25 07:15 WIB — Correction: the "live failures" were local; Mac memory

- On re-reading the ship logs, all three failures (06:43, 06:48, 06:59) happened in the local gate,
  before deploy (`e2e: playwright against http://localhost:8480`). Production stayed on live-41
  throughout and was never broken.
- The revert was therefore never deployed. The `live-42` tag I created (claiming f5c86fc was
  deployed) was wrong and has been deleted locally and on GitHub. The "calm re-run" I took as
  verification had tested live-41.
- **Root cause:** the Mac was out of memory, so the browser and the local Docker stack were too
  slow for the test timeouts.
  - 16 GB RAM with 20 of 21.5 GB swap in use.
  - The Rancher Desktop VM had 6 GB, with an unused Kubernetes cluster.
  - 16 orphaned codegraph MCP servers were left from old sessions.
- **With the builder's OK:** the orphaned codegraph servers were stopped (the builder approved it
  in this session); the builder turned off Rancher Kubernetes; the Docker build cache was pruned
  (417 MB).
- The next ship passed the local gate and live verification in 1.6 min: live-43 = UX batch 2 plus
  the test-budget fixes.

## 2026-10-25 07:35 WIB — align the app to the final pitch deck

The builder asked to align the app with `docs/SPEKTROSKIN_FINAL DECK.pdf` (the deck presented
today; kept out of git via the local `.git/info/exclude`, the builder decides whether to commit it).
- Device card names the deck's device: "SpektroSkin SK-2 (virtual)" with white light (polarized),
  NIR 850 nm and pigment contrast; it stays badged Simulated.
- View tabs use the deck's three views: White light, Pigment, Vessels (NIR).
- The AI card follows the deck's "Analyze" checklist: image quality, lesion segmentation, vascular
  & pigment pattern, and the malignancy risk estimate shown as **not active**.
- **Deviation from the deck, on purpose:** the deck's "78 % melanoma" screen is a design mock
  labelled "illustrative". The app shows no malignancy probability, because CLAUDE.md §2 forbids
  one and any number trained on simulated phantoms would be fabricated evidence. The slot is
  visible and says what it needs: histopathology-confirmed captures from the pilots.

## 2026-10-25 07:40 WIB — UX batch 3: home and capture follow the deck's app screens

- Home mirrors the deck's phone home and "Triage" screen:
  - the SK-2 device card (Simulated) and a "New scan" button;
  - tiles for flags to check, follow-ups due and cases waiting for review;
  - patient filter chips All / Needs attention / Follow-up / Recent, with each patient's flag
    badge.
- The deck's risk-% badges are replaced by the automated flag badges (growing, looks different,
  …), for the reason logged at 07:35.
- Capture shares the device card and shows the deck's modes: Multispectral is active; Photo and
  Video are marked "next" (they need the SK-2 hardware).
- The "AI evidence" view tab is renamed Heatmap, matching the deck's view tabs.
- Checked at 390 px with Playwright screenshots of home and the "Needs attention" filter.
