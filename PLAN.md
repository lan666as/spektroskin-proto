# SpektroSkin prototype — PLAN

Agreed in the Phase 0 interview, Sat 24 Oct 2026, 20:30–21:30 WIB.
CLAUDE.md is the spec; this file records the decisions that refine or override it.
Where they disagree, **this file wins**. Re-read both after any context summary.

## 0. Context the build must serve

Taken from the team's Drive (proposal, rewritten deck, pitch strategy, GENOHACK guide):

- **Product framing:** "A second look shouldn't require a second hospital." SpektroSkin is a
  research-stage, smartphone-linked multispectral dermoscope concept for **smaller Indonesian
  hospitals (BPS class C/D, tier-2/3 cities)**: facilities that see suspicious lesions and can
  arrange biopsy or referral but lack dermoscopy or dermatologists.
- **Users:** a general physician or dermatology staff member captures the image (clinician app). A remote
  dermatologist gives the "second look" (reviewer portal) and *recommends* observe, biopsy or refer.
  **The treating clinician decides.** No AI, no risk score, no autonomous triage.
  *Amendment (25 Oct 2026, 00:15 WIB, builder's overnight brief):* automated assistance that really
  exists (image-quality check, lesion outline and measurements, change tracking across visits) is
  shown and labelled as automated assistance with its limits. One small model may be trained on the
  synthetic phantoms (an image-quality classifier, scikit-learn) and shown with its real held-out
  metrics as an advisory second opinion. An in-app AI roadmap shows planned tiers (triage support,
  shadow-mode validation, RGB-vs-spectral ablation) as not active. Still never: a diagnosis, a
  malignancy probability, a risk score or an invented performance number.
  *Amendment (25 Oct 2026, 00:30 WIB, builder override: "start the model to help diagnose, as
  promised in the proposal and deck"):* Tier 3 triage support starts now in **research mode**: a
  lesion-pattern model (pigment-dominant / vascular / mixed, abstains when unsure) trained on
  simulated lesions, with real held-out metrics per skin tone and an RGB-vs-spectral ablation
  (`docs/evidence/triage_model_card.md`), shown to clinician and dermatologist as "research mode ·
  not a diagnosis · simulated training data". Benign-vs-malignant stays off: the phantoms carry no
  such labels, so any such number would be fabricated.
- **Pitch:** 6 min pitch+demo, 4 min Q&A (track round, Sun 10:00–12:00); the Grand Final allows 7 min.
  The deck gives the demo **~60 s** (slide 6). Judges score prototype strength, "assumptions
  tested during the hackathon", and "real outputs wherever possible"; there is a Best Prototype prize.
- **Honesty:** the competition bans fabricated evidence. The team must separate pre-hackathon work
  (proposal, 12 interviews, Figma concept, deck) from what was built during GENOHACK (this repo,
  BUILD_LOG.md). Deck slide 6 (RealFigures v3) says "Only the spectral views are simulated", which is
  wrong for this build: the optical module and its frames are simulated too. Correct wording:
  *"Working app and processing pipeline, end to end. The optical module and its images are simulated."*
  Other morning deck fixes are listed in `docs/context/chat-handoff.md` §3.
- Deck judge Q6 (skin-tone bias) is answered with evidence by the skin-tone-stratified validation
  report: it validates the processing math on simulated data only.

## 1. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Public URL **https://spektroskin.zidan.dev** (not elang.zidan.dev). `elang.zidan.dev` stays the SSH alias / deploy host only. | Nginx Proxy Manager already owns 80/443 on the VPS, and elang.zidan.dev returns 525. |
| D2 | Ingress via the **existing Cloudflare Tunnel** `elang-ssh` (id 4b46d81e…): `spektroskin.zidan.dev → http://localhost:8480`. CNAME already created. Cloudflare terminates TLS. | No ACME, no NPM changes, and avoids the bad CBN↔Leaseweb route. |
| D3 | **Caddy serves plain HTTP** inside the stack, published only on `127.0.0.1:8480:80`, the same on the Mac and the VPS (`http://localhost:8480` locally). Site address `:80`; no automatic HTTPS. | Deviation from the spec's "automatic HTTPS": TLS is Cloudflare's job here. One compose file, no env-specific branches. |
| D4 | GitHub repo **lan666as/spektroskin-proto, public** from the start. | Commit history is the live "built during GENOHACK" evidence. The repo must never hold secrets or real images. |
| D5 | Expo **SDK 58** (`expo@58.0.19`, latest), matching the Play Store Expo Go. Node v26.12.1 (supported by expo 58). | Expo Go only runs the current SDK. |
| D6 | UI language **English only**. | Lowest risk; standard medical terms. |
| D7 | Visual style **clean clinical light**: white / very light gray surfaces, one teal accent (`#0F766E`), amber Simulated badges (`#B45309` on `#FEF3C7`), system font, ≥ 48 px touch targets. The pre-hackathon Figma concept is not used. | Keeps the before/during-GENOHACK boundary clean. |
| D8 | Autonomy: `scripts/deploy.sh` **may run unattended** at M6 (gated). After `v-core`, **continue into the overnight queue** on branch `overnight`. | Builder's choice. |
| D9 | Stuck > ~45 min: **simplest honest workaround, log under Deviations, continue.** M4/M5/M6 are never skipped; they are the core loop. Never loosen a check silently; report the real number. | Spec default. |
| D10 | **Credentials:** `.env` holds only `POSTGRES_PASSWORD` and `JWT_SECRET`. Demo users live in a `users` table (bcrypt hash). An idempotent CLI `python -m scripts.create_user --username U --role R --display-name N --password-stdin` creates the user or leaves it unchanged. Passwords are in **macOS Keychain** (`spektroskin-demo-clinician`, `spektroskin-demo-dermatologist`; account = username) and are piped to the CLI by scripts, never written to files, logs, or argv. | Builder: "passwords live in DB, keep .env clean; maintainable, scalable, reliable from the ground up." |
| D11 | Login is a **typed username/password form** with autofill attributes (`autoComplete="username"` / `"current-password"`), so Chrome's password manager fills it in one click on stage. No one-tap demo buttons. | Public site; passwords must not ship in the JS bundle. |
| D12 | Phantoms are **realistic procedural** (see §4): code-generated, exact ground truth, no real or public images. | Looks like skin on screen while staying honest and validatable. |
| D13 | Skin tones map **light / medium / dark → Fitzpatrick III / IV / V** (illustrative; melanin levels ordered, not literature-fitted). All demo patients are IV–V. | Indonesian population; dark skin is the hard case for optical imaging. |
| D14 | **Longitudinal history (Day 01 / 14 / 30, area change) moves into the Phase A core** (M4), because deck slide 6 promises it. | Promised on stage, so it can't be optional. |
| D15 | Demo: **60 s core script + 2 min extended** (§6). | Matches the deck's slide-6 budget and the Grand Final's extra minute. |
| D16 | Phone: Expo Go in **LAN mode** (phone and Mac on the same Wi-Fi/hotspot). The native app calls `https://spektroskin.zidan.dev/api`. No `--tunnel`, no new dependency. | Boring; phone checks are morning-only anyway. |
| D17 | VPS project dir `~/workspace/personal/spektroskin-proto`; compose project name `spektroskin`. | Fits the existing layout; isolated from other stacks. |
| D18 | **The web export is built and tested on the Mac, then shipped as-is** to the VPS (`deploy.sh` streams `mobile/dist` over ssh into `web-dist/`, bind-mounted read-only into Caddy). The API image is built on the VPS from the pushed commit (spec). | The spec keeps Node out of Docker. The tested web artifact is the promoted one (no rebuild). API trade-off named: the image is rebuilt from the same commit, not byte-identical. |
| D19 | The web build calls a relative `/api` (same origin through Caddy). Native reads `EXPO_PUBLIC_API_URL` (default `https://spektroskin.zidan.dev`). | One web artifact works locally and in prod with no CORS. |

## 2. Spec additions and overrides (data model, API)

- **New `users` table:** id (UUID), username (unique), display_name, role (`clinician` | `dermatologist`,
  CHECK), password_hash, created_at. JWT carries `sub` = user id and `role`; expiry 24 h.
- `reviews.reviewer_id` → FK users (instead of a free-text reviewer). `audit_events.actor_id` → FK users.
- `captures.status`: `processed` | `qc_failed` (CHECK). Failed-QC captures are stored (with QC
  JSON) but cannot be attached to a case.
- `captures.id` is client-generated. Re-POSTing the same id returns the existing capture (200) and does not
  re-process.
- `cases.status`: `submitted` → `in_review` (set when a dermatologist first opens it) → `answered`.
- `reviews.action`: `observe` | `biopsy` | `refer`. The portal and the app label it
  "Dermatologist recommendation"; the clinician app adds "Treating clinician decides."
- `lesions.body_site`: fixed list (CHECK): face, scalp, neck, chest, abdomen, upper back, lower back,
  upper arm, forearm, palm, hand dorsum, thigh, lower leg, sole, foot dorsum, fingernail, toenail, genital, other.
  Acral sites are palm, sole, fingernail and toenail.
- `GET /lesions/{id}` returns captures ordered by `captured_at` plus each one's `area_mm2`, which is
  enough for the history strip. The response stays additive.
- Seeded historical captures carry real past `captured_at` values (now − 29 d, now − 15 d) and are
  processed by the same pipeline at seed time.

## 3. Pinned versions

| Thing | Pin |
|---|---|
| Postgres | `postgres:16` (spec) |
| Caddy | `caddy:2` (spec) |
| Python base | `python:3.12-slim`; uv binary from `ghcr.io/astral-sh/uv:0.13.5` |
| Expo | `expo@58.0.19` via `create-expo-app` default TypeScript template (Expo Router) |
| Playwright | `@playwright/test@1.64.1` (Chromium already installed for 1.64.1) |
| openapi-typescript | `7.13.0` |
| TanStack Query | `@tanstack/react-query@5.104.5` |
| NetInfo | `@react-native-community/netinfo` (version Expo SDK 58 selects via `npx expo install`) |
| expo-secure-store, AsyncStorage | versions Expo SDK 58 selects via `npx expo install` |

Every add goes in through `uv add` / `npx expo install` / `npm i -E`, with the lockfile committed and the add
named in BUILD_LOG.md.

## 4. Simulator (realistic procedural phantoms)

- 256 × 256 px, 16-bit PNG, scale **0.04 mm/px** (10.24 mm field). Bands: blue 470, green 550,
  red 660, NIR 850 nm, plus a dark frame. The model, coefficients and gray patches (0.18 / 0.50) follow CLAUDE.md §5.
- Realism layers, all with exact ground truth: multi-scale skin texture (fine grain plus skin-line
  furrows); **parallel dermatoglyphic ridges on acral sites**; irregular, lobulated lesion borders
  (radius perturbed by low-frequency noise); uneven pigment density with a faint reticular network
  (pigmented); dotted and linear vessels (vascular); vignetting; small per-band shifts.
- Phantom set (`{type}_{tone}[_{variant}]`):
  - 9 base phantoms: {pigmented, vascular, mixed} × {light, medium, dark}.
  - Bad captures: `pigmented_dark_blur`, `pigmented_dark_glare`.
  - Growth series (acral sole, pigmented, dark): `acral_dark_d01`, `acral_dark_d14`,
    `acral_dark_d30`, with the lesion area growing by known amounts (≈ 18 → 22 → 28 mm²).
- Output: frames + `meta.json` + `ground_truth.npz` under `backend/simulator/out/`. The frame sets only
  (no ground truth) are copied to `mobile/assets/phantoms/`. The generator is deterministic (seeded).
- Every phantom-derived image in the UI carries the **Simulated** badge and the footnote "Synthetic phantom
  generated by code. Spectral views computed from a simulated module. Processing runs on the server
  in this prototype; the target architecture moves it on-device."
- Fallback if M2 runs long: smooth blobs, no network/ridges. Log under Deviations.

## 5. Milestones (Phase A, branch `main`)

The gate after every milestone is `scripts/gate.sh`: `uv run ruff check`, `uv run pytest` (against
`spektroskin_test`, migrated with Alembic), `npx tsc --noEmit`, `npx expo export -p web`, plus that
milestone's checks. Then commit, push, and append a timestamped entry to BUILD_LOG.md.

**M1: skeleton.** Compose (db + api + caddy, `127.0.0.1:8480`), override (db on `127.0.0.1:5432`,
api hot reload), uv backend, `/api/health`, first Alembic migration (users), Expo app shell (SDK 58,
Expo Router, `(clinician)` / `(reviewer)` groups, SimulatedBadge), Caddyfile serving `web-dist/`
plus a `/api` proxy, and `scripts/gate.sh`.
*Done when:* `docker compose up -d` healthy; `curl localhost:8480/api/health` → 200; `alembic current`
at head; `npx expo export -p web` OK; Playwright loads the shell from `localhost:8480`.

**M2: simulator + processing + tests.** §4 phantoms; `processing.run(frame_set, device_profile)`
covering QC → registration → calibration → unmixing → segmentation; PNG overlays + JSON.
*Done when:* pytest green, including recovery within tolerance on all 9 clean phantoms, area within
tolerance on the growth series, and QC rejecting blur and glare.

**M3: data model, API, auth, images.** All §7/§8 entities plus §2 above; role checks; audit events on every
patient-data read/write; `create_user` CLI; idempotent `scripts/seed.py` (§7 seed data);
`scripts/smoke.py` (reads credentials from Keychain); openapi-typescript types generated into `mobile/src/api`.
*Done when:* `uv run python -m scripts.smoke --base http://localhost:8480` exercises every endpoint.

**M4: clinician flow + history.** Login → patients (list/create) → lesion (body-site picker) →
capture (device card "Virtual module connected · Simulated", band progress, hidden dev phantom
picker defaulting to `acral_dark_d30`) → results (QC; Standard / Pigment / Vascular tabs, outline,
area; **history strip Day 01 / 14 / 30 with area change**) → submit question → My cases (polling every 5 s).
*Done when:* Playwright at 390 px runs login → patient → lesion → capture → results (3 visits in history) →
submit.

**M5: reviewer portal + answer loop.** Queue → case detail (patient metadata, image tabs, lesion
history, review form) → submit; the clinician sees the recommendation.
*Done when:* Playwright with two browser contexts: clinician submits → dermatologist reviews → clinician
sees "Dermatologist recommendation: Biopsy" within 10 s.

**M6: deploy.** `scripts/deploy.sh`: refuses unless on `main` with a clean tree and a green gate; pushes;
ssh (host `elang.zidan.dev`; if the connection itself fails, retry once via `elang-direct`) → `git pull --ff-only` → `docker compose up -d --build`; streams the tested `mobile/dist` to `web-dist/`;
pipes Keychain passwords into `create_user`; runs the seed; checks `https://spektroskin.zidan.dev/api/health`.
*Done when:* deploy succeeds; smoke + Playwright e2e pass against https://spektroskin.zidan.dev; tag
`v-core` pushed.

Should (Phase A if time allows): polished UI; QC retake guidance shown with the blur/glare phantoms (needed
for the extended demo).

## 6. Demo script

Set-up: two Chrome windows, both on https://spektroskin.zidan.dev, already logged in (Chrome
autofill). Left, ~390 px wide: clinician on lesion "PT-0007 · Left sole". Right: reviewer queue.

**Core, ~60 s (track round):**
1. (5 s) "This is the clinician's app. The optical module is simulated, the software is real."
   Point to the Simulated badge on the device card.
2. (10 s) Tap **Capture**: the bands cycle, and QC passes.
3. (15 s) Switch Standard → Pigment → Vascular: outline, area 28 mm².
4. (10 s) History strip: Day 01 18 mm² → Day 14 22 mm² → Day 30 28 mm².
5. (5 s) Submit: "Pigmented macule on left sole, growing over 30 days. Biopsy or observe?"
6. (10 s) Right window: case appears → open → Recommendation **Biopsy**, follow-up 14 days → Submit.
7. (5 s) Left window: the recommendation appears. "The dermatologist recommends; the treating clinician decides."

**Extended, +60 s (Grand Final / Q&A):** start with the `pigmented_dark_glare` capture → QC fails with
retake guidance → retake passes; then the validation panel: recovered maps vs ground truth by skin
tone (simulated data only). The validation panel comes from overnight item 1; if that item doesn't land,
the extended demo ends after the QC retake. Background cases: PT-0003 (answered, observe) in "My cases", PT-0005
(submitted) in the queue.

## 7. Seed data (synthetic, idempotent)

| Patient | Age/Sex | Fitz | Lesion | Captures | Case |
|---|---|---|---|---|---|
| PT-0003 | 41 M | IV | upper back | `mixed_medium` | answered: observe, follow-up 90 d |
| PT-0005 | 29 F | IV | forearm | `vascular_medium` | submitted (queue) |
| PT-0007 | 54 F | V | sole | `acral_dark_d01` (now − 29 d), `acral_dark_d14` (now − 16 d) | none; the live demo creates it |
| PT-0009 | 54 F | V | sole | same as PT-0007 (rehearsal twin, added overnight) | none; rehearse on this one |

Users: `clinician` ("dr. Demo Clinician", role clinician), `dermatologist` ("dr. Demo Dermatologist,
Sp.D.V.E.", role dermatologist). No real people or institutions appear in seed data.
Re-running the seed never duplicates and never deletes. Rehearsal leftovers (an extra PT-0007 capture or
case) are acceptable; the builder can create a fresh lesion for the live run.

## 8. Overnight queue (Phase B, branch `overnight`, revised)

1. Validation: `GET /validation/{capture_id}`, a results-screen panel, and the skin-tone-stratified
   `docs/evidence/validation_report.md` with figures. States clearly that it covers simulated data and
   processing math only.
2. Offline capture queue with sync on reconnect (native). NEEDS PHONE CHECK.
3. Consent flag (research use yes/no) on patients, shown in the portal; audit log page.
4. Printable referral summary for answered cases (web view; PDF only if trivial).
5. UI polish: loading, empty and error states; consistent spacing and type.
6. README: architecture (Mermaid), run instructions, real-vs-simulated table, before/during-GENOHACK
   table, a "target vs prototype" section built from `docs/context/chat-handoff.md` §2 (described as
   target design, not as built), and a link to BUILD_LOG.md.

(Longitudinal history moved into M4.)

## 9. Decisions delegated to Claude

Claude may decide these alone (log each in BUILD_LOG.md "Decisions made alone"):
internal module layout, names and file splits; exact QC thresholds and test tolerances (real numbers
reported); phantom texture parameters; screen layout details within D7; retake-guidance wording; HTTP error
shapes; pagination (none unless needed); Alembic migration granularity; JWT expiry within 12–24 h;
Playwright test structure; extra dev-only dependencies already listed in CLAUDE.md §4.

Claude may **not** decide alone: new runtime dependencies outside §4/§3; changes to D1–D19; anything
touching the VPS outside `deploy.sh`; NPM or cloudflared config; deleting data.

## 10. Pre-flight status (Phase 0)

| Check | Status |
|---|---|
| Docker Desktop 29.5.3, Compose v5.3.1 | OK |
| uv 0.13.5, Node v26.12.1, npm/npx 11.20.0 | OK |
| Playwright Chromium for 1.64.1 | Installed |
| GitHub repo, remote, ssh push | Repo created; push checked by first commit |
| `ssh elang.zidan.dev` without a prompt (Cloudflare tunnel, key in agent) | OK |
| VPS Docker 29.1.3, Compose v5.0.1, user in `docker` group, 39 GB free | OK |
| VPS → GitHub ssh auth | OK |
| DNS `spektroskin.zidan.dev` → tunnel CNAME | OK |
| Tunnel ingress rule for spektroskin.zidan.dev | OK (applied 21:01 WIB; returns 502 until the stack runs; backup `/etc/cloudflared/config.yml.bak-20261024`) |
| VPS project dir cloned, VPS `.env` | OK (`.env` generated on the VPS, mode 600) |
| Local `.env` | OK (mode 600) |
| Demo passwords in Keychain | OK; login keychain `no-timeout`, no lock-on-sleep; `security` reads without a dialog |
| SSH unattended | OK: a fresh connection (no ControlMaster) works over the tunnel; no Cloudflare Access token on the Mac, so nothing expires overnight; `elang-direct` also works as a fallback |

## 11. How to start Phase A

In a fresh Claude Code session in this directory (or this one), say:

> Start Phase A. Follow PLAN.md from M1. Work autonomously until v-core is deployed, then continue
> into the overnight queue per CLAUDE.md §12.

Keep the Mac awake (`caffeinate -dimsu &`), Docker Desktop running, and ssh-agent loaded.
