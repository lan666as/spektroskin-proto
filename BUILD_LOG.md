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
