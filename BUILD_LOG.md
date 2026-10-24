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

## Decisions made alone
- M1: Expo routes live in `mobile/src/app/` (SDK 58 template convention) instead of `mobile/app/`.
- M1: web export uses `web.output: "single"` (SPA) so Caddy can serve deep links via `try_files`.
- M1: `python-multipart` added: FastAPI needs it for the multipart `POST /captures` and OAuth2 form.
- M1: Alembic reads `DATABASE_URL` directly so migrations run without app secrets.
- M2: thresholds from measured phantom metrics: sharpness ≥ 5e-5 (clean 1.0–2.1e-4, blur 2.1e-5);
  saturated ≤ 0.2% (glare 2.9%); patch ratio 0.50/0.18 within ±20%; Otsu with hysteresis down to 0.5×.
- M2: unmixing adds a band-independent offset term (skin-line shading) beside melanin and hemoglobin.
- M2: phantoms are 256×256 px at 0.04 mm/px; the Docker build regenerates them from the same seeds.

## Deviations
- M2: pipeline order is QC → calibration → registration (spec says registration before calibration),
  because flat-field and the reference patches are fixed to the sensor while hand motion moves only
  the skin; flat-fielding after shifting would misalign the vignetting correction.
- M1: `openapi-typescript@7.13.0` declares a TypeScript 5 peer, but SDK 58 ships TypeScript 6. It runs
  pinned via `npx -y openapi-typescript@7.13.0` (npm script `gen:api`) instead of as a devDependency.
