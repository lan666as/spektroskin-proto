# ITERATION_BACKLOG — overnight iteration loop (25 Oct 2026, until 08:00 WIB)

## Summary (written 25 Oct, 05:50 WIB)

### How to test it right now

- **Web (demo):** https://spektroskin.zidan.dev. Logins: `clinician` / `clinician2026` and
  `dermatologist` / `derma2026` (also in the Mac Keychain as `spektroskin-demo-clinician` /
  `spektroskin-demo-dermatologist`). Use a narrow Chrome window (about 390 px) for the clinician
  and a wide one for the dermatologist.
- **Phone (Expo Go, same Wi-Fi as the Mac):** open `exp://192.168.68.143:8081` in Expo Go. The
  Metro dev server is running on the Mac and serves the latest code. It talks to the live API.
- **Live state:** tag `live-35` (`5e00339`) is deployed. Gate green (91 unit and API tests, ruff,
  tsc, web export). Live smoke and all 6 Playwright specs, including the full §6 demo script,
  passed against the live site after every deploy. Tags `live-1` … `live-35` mark each verified
  deploy. `pre-iteration` is the state before tonight.

### Do these before the rehearsal (they need you)

1. **Seeded demo history has no AI outputs yet.** PT-0007's and PT-0009's Day 01/14 visits,
   PT-0003 and PT-0005 were processed before the models existed. Two ways to add them:
   - open each seeded visit (or the reviewer case) and press **Run AI on this capture**;
   - or run `docker compose exec api python -m scripts.reprocess_captures` on the VPS: a dry run
     first, then `--apply`.

   Either way only missing outputs are added, and stored measurements never change. New captures
   always have the AI. I did not backfill production myself.
2. **PT-0007 research consent:** open PT-0007 and set Research consent to **Yes**. Then the
   extended demo's outcome (Biopsy → Benign) makes the case validation-eligible on the AI page.
3. **My mistake on your PT-0011:** the batch-25 seed reused the code PT-0011 and attached 4 demo
   lesions (one capture each) to your own test patient (31 F, VI). Nothing of yours was changed or
   deleted. The seed now uses PT-0091 and refuses codes held by a different patient. If you want
   them removed:
   - lesions b8b27005-f046-5d95-be70-a42f8dda3d00, 1a5ae85a-0f71-5384-aa7d-47d41a4c105b,
     b7b42ec0-1206-5bdd-b132-5fddfe49328a, 08375ce7-c6fc-540d-8b52-a7e1b036c2f0;
   - captures 9979d285-be2f-5d79-84d5-9f0a1fc113f0, 9101ba4e-76d2-50cb-8108-3e697358dcdb,
     e18c0e31-be4a-563f-9669-08d373b5aaa3, 85996485-5f4f-546f-b13e-f14241a0a5e9.

   This is a production delete, so I left it to you. PT-0010 and PT-0012 were not touched.

4. **Security advisories (new tonight, 05:02 WIB), reported, not patched:** GitHub Dependabot
   lists two high-severity npm advisories in `mobile/package-lock.json`. Both come only from the
   Expo developer CLI (`expo` → `@expo/cli`), which runs on the Mac. They are not in the deployed
   web bundle (checked: no matches in `dist/`) and not in the backend.
   - `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, memory exhaustion; fixed in 4.6.6). Forcing zod 4 into
     the Expo CLI could break the build and the dev server.
   - `node-forge` 1.4.0 (GHSA-86w9-cpqp-85rv, RSA signature check; no fix released). It is used
     for Expo code signing, which this project does not use.

   Recommendation: after the competition, upgrade Expo when a release pulls in fixed versions. If
   you want it closed before submission, an npm `overrides` entry for zod is the option, followed
   by a full gate run. Your call.

### What changed tonight (35 verified deploys)

Before / after screenshots:
- before: `docs/screenshots/20261025-0009-audit-before/`;
- audits: `…-0212-audit-2/`, `…-0359-audit-3/`;
- after: `docs/screenshots/20261025-0535-final/`, which adds `results-full-ridge-390.png`,
  `ai-page-full-1440.png` and `ai-roadmap-390.png`.

Compare `05-results-390.png`, `08-review-case-1440.png` and the new `10c-ai-overview-1440.png`.

**AI-assisted diagnosis support.** Real models, trained and tested on simulated data, research
mode, never a diagnosis:
- **Three models with model cards** in `docs/evidence/`. All accuracies are on held-out
  simulated data:
  - image quality `quality_v2`: 0.96 vs 0.88 for the rules;
  - lesion-pattern triage `triage_v1`: 0.98; 0.96 on Fitzpatrick V; calibration error 0.034;
    abstains when unsure; withholds out-of-range captures; explains its top reasons;
  - acral furrow/ridge pattern `acral_v1`: 0.99; abstains on faint patterns.
- **RGB-vs-spectral ablation (the optics kill test):** 0.95 → 0.98, with the biggest gain on dark
  skin (0.93 → 0.96).
- **Neural-network experiment:** 0.93, worse than the explainable model, so it was not deployed.
- **In the app:**
  - an AI assist strip at the top of the results screen;
  - the triage card with "why this suggestion";
  - an acral pattern card (a ridge pattern prompts review);
  - an **AI evidence** view and a **Change since Day 01** view (registered outlines,
    mm² new / receded);
  - dermoscopy-style measurements (asymmetry, border, colour, evolution; never a score);
  - an ugly-duckling flag;
  - an area trend chart;
  - attention flags in the dermatologist queue;
  - similar reviewed lesions with their outcomes;
  - measured-findings drafts for the question and the impression.
- **AI & validation page (dermatologist):**
  - per-model, per-skin-tone results, calibration and the ablation;
  - live monitoring and a learning queue;
  - shadow mode with blind reads;
  - the reviewed → consented → histopathology-confirmed funnel, with a privacy-minimised export.
- **Evidence:**
  - `docs/evidence/assumptions_tested.md`: 12 assumptions, including two that failed or partly
    failed;
  - `ai_evaluation.md`: repeatability 100 %, and a noise stress test whose finding led to a new
    QC check and the quality model's v2;
  - `experiment_mlp_vs_features.md`.

**Care lifecycle:**
- outcome and histopathology entry, with follow-up due dates;
- a clinician to-do list and "worth a second look";
- the referral summary with outcome, measurements and AI suggestions;
- research consent can be changed later.

**Simulation:** each capture is a new simulated frame set from the server-side virtual module:
- stable lesion identity, pattern and growth;
- skin tone from the patient's Fitzpatrick type;
- about 1 in 10 captures blurred or with glare;
- offline it falls back to the bundled phantoms.

**Credibility and safety fixes:**
- per-object authorization on every single-record read and write (before, any signed-in user could
  read a capture by id);
- the acral read is only stored for acral sites;
- the "no AI" statements were corrected;
- the honesty labels (Simulated, research mode, not a diagnosis) are on every AI output.

### NEEDS PHONE CHECK (Expo Go)

1. **New capture on a fresh lesion.** The capture should cycle through the bands with server-made
   previews and upload, and the results should show the AI assist strip. Frames are attached by
   URL, which React Native downloads itself; this was not tested on a device.
2. **Airplane mode, then capture.** It should fall back to the bundled phantom and say "saved on
   this phone". Turn the network back on and it should upload.
3. **Results screen at phone width:** check that the AI cards' badges wrap, the AI evidence and
   Change views open full screen, and the measurements card sits below Submit.
4. **Answered case:** record an outcome (Biopsy taken → Benign) and check the to-do list updates.
5. **Patient page:** the consent Yes/No control saves.

### Updated demo script (PLAN.md §6 has the full version)

**Core, 60 s:**
1. Capture: QC passes and the learned second opinion agrees.
2. The **AI assist** strip (pattern, acral furrows, mm² new since Day 01); tap **AI evidence**,
   then **Change since Day 01**.
3. Submit.
4. Dermatologist: the queue shows the **Growing** flag. Open the case and point at "why this
   suggestion" and the similar lesions. Insert measured findings, choose read Pigment-dominant,
   Biopsy, send. The card says "model agrees".
5. Clinician sees the answer.
6. **AI** tab: per-tone results, the ablation, monitoring, the validation funnel.

**Extended:**
- outcome → validation-eligible → export;
- `acral_ridge_dark` → ridge pattern → prompt review;
- glare retake;
- the evidence docs.

### Deck and Q&A lines: describing the AI honestly

- "The AI in SpektroSkin is real code you can see running: three small models with model cards.
  They are trained and tested only on simulated data, because we have no patient images yet, and
  we say so on every screen."
- "It assists; it does not diagnose. It suggests a pigment or vascular pattern and an acral ridge
  pattern, explains why, and abstains when unsure or when an image is unlike anything it was trained
  on. There is no cancer probability anywhere: our data has no histopathology labels, so any such
  number would be invented."
- "We tested our own assumptions overnight:
  - the spectral bands beat RGB on the same model, by most on dark skin;
  - a neural network did not beat the explainable model, so we didn't ship it;
  - our quality gate missed heavy noise, so we fixed it and retrained."
- "Every number is reported per Fitzpatrick type. Our pattern models are weakest on the darkest
  simulated skin; closing that gap with Indonesian data is the first job of the pilot."
- "How it becomes clinical: dermatologists record their own reads, blind if they choose, and
  biopsy results close the loop. Only consented, histopathology-confirmed cases count as
  validation data, exported without identities. The model moves past research mode only after
  shadow-mode results per skin tone, under ethics approval."
- If asked "is 98 % real?": "Real measurement, simulated lesions. It shows the method works on the
  physics we modelled, not on skin. The next number that matters comes from bench captures with the
  physical module."

### Known limits (say them before a judge does)

- All images are simulated, and the simulator and the pipeline share one simplified optical model.
- Model metrics are on simulated data. The shadow-mode agreement shown so far comes from test
  accounts.
- Processing runs on the server; the target architecture runs it on the device.

## Audit 1 — 00:10 WIB, live site, PLAN.md §6 demo script

Screenshots: `docs/screenshots/20261025-0009-audit-before/` (390 px clinician, 1440 px dermatologist).
Demo script (core + extended) passes against https://spektroskin.zidan.dev in 32 s of automation.

Critique against the GENOHACK criteria (docs/context/chat-handoff.md §1):

- **Prototype strength and evidence:** the loop works end to end; spectral signature and the
  validation panel are real computed outputs. Missing: no learned component at all, and the
  evidence lives on a secondary screen.
- **Real vs simulated clarity:** good. Every image and the device card carry the Simulated badge;
  About page has the table. Keep.
- **Clinical credibility:** results show area but no diameter (clinicians think in mm across); the
  key number (area change since Day 01) is below the fold; the reviewer's case card lacks the
  change; the flow ends at "Biopsy" with no outcome, follow-up date or histopathology, so the tool
  looks like a one-off photo app rather than part of care.
- **Customer value / workflow:** no follow-ups due, no closing of the loop, no view of how reviewed
  cases become future validation data (the data-strategy story in the deck).
- **AI (judges will ask):** the automated analysis that exists (QC, outline, change tracking) is not
  framed as automated assistance; there is no ML; there is no roadmap view.
- **Polish:** flat white screens; device card verbose; long results page.
- **Reliability:** green (gate, smoke, e2e, live demo script).

Pre-hackathon Figma mockups (`docs/figma`, kept out of git: they contain photo-like lesion images
and malignancy percentages, which CLAUDE.md §2 bans) used as layout inspiration only: analysis
checklist, lesion timeline with a trend chart, greeting home with device card and stat tiles,
filter pills with counts, soft-card visual style. Not borrowed: risk scores, diagnoses, photos.

## Ranked backlog

Score = judge impact (1–5) × 2 − risk (1–5) − effort (S=1, M=2, L=3). Demo-path items first.

| # | Item | Impact | Risk | Effort | Score | Status |
|---|---|---|---|---|---|---|
| 1 | Lesion measurements: longest diameter and width (mm) beside area; results summary header "Day 30 · 28.7 mm² · 7.1 × 5.6 mm · +56 % since Day 01" above the fold | 4 | 1 | S | 6 | done (batch 1) |
| 2 | "Automated analysis" card (results + reviewer): quality check, outline, change since first visit, each labelled automated assistance with its limits; a greyed "Triage support: not active" row | 5 | 1 | M | 7 | done (batch 1) |
| 3 | Train a small image-quality classifier (scikit-learn) on synthetic phantoms; real held-out metrics; integrate as an advisory second opinion beside the rule-based QC; model card | 5 | 3 | M | 5 | done (batch 2: 0.97 held-out vs rules 0.90) |
| 4 | In-app "AI roadmap" view: tiers active / shadow mode / not active, RGB-vs-spectral ablation as the optics kill test | 4 | 1 | S | 6 | done (batch 1) |
| 5 | Care lifecycle: follow-up date and outcome entry (action taken, biopsy date, histopathology result) closing the loop on the recommendation; dermatologist sees the outcome | 5 | 3 | L | 4 | done (batch 4) |
| 6 | "Follow-ups due" and "needs outcome" on the clinician home | 4 | 2 | S | 5 | done (batch 4) |
| 7 | "Data for validation" page: how consented, reviewed, histopathology-confirmed cases would feed the future validation set (counts, eligibility rules) | 4 | 2 | M | 4 | done (batch 8, AI & validation page) |
| 8 | Visual refresh: light-gray canvas with white cards, initials avatars, compact device card | 3 | 2 | M | 2 | done (batch 16: canvas, cards; device card unchanged) |
| 9 | Referral summary: add measurements, automated-analysis notes and the outcome | 3 | 1 | S | 4 | done (batch 13) |
| 10 | Reviewer case card: change since Day 01 and diameter next to area | 3 | 1 | S | 4 | done (batch 1) |

## Audit 2 — 02:12 WIB, live site, after batches 2–11

Screenshots: `docs/screenshots/20261025-0212-audit-2/` (demo script against live, 390 px and 1440 px).

What changed since audit 1: three working models (image quality, lesion-pattern triage, acral
pattern) with model cards and held-out metrics, the RGB-vs-spectral ablation, explanations ("why
this suggestion", AI evidence view), dermoscopy-style measurements, the care lifecycle (outcome,
histopathology, to-do list), shadow-mode validation with blind reads, an AI & validation page,
attention flags in the queue, similar-case retrieval, and per-capture simulation.

Findings and fixes:

- **Wrong output (fixed, batch 12):** the acral card read "pigment follows the furrows" on a
  vascular lesion with no pigment. The model now only runs when the lesion has extra pigment.
- **Layout (fixed, batch 12):** the badges on the AI cards were clipped at 390 px; the results page
  pushed the submit button below four cards. The badges now wrap, and the measurements card sits
  below the submit button.
- **Seeded demo data has no AI outputs (needs the builder):** production captures from before
  batch 2 (the seeded PT-0003 / PT-0005 / PT-0007 history) lack triage, acral, morphology and the
  evidence view. `backend/scripts/reprocess_captures.py` adds them from the stored raw frames.
  - It is a dry run by default.
  - With `--apply` it only adds missing keys and never changes stored measurements.
  - It was verified on the local dev database: 195 captures updated, 0 skipped, and a second run
    found nothing left to do.
  - Running it on production is a data backfill, so it is left for the builder to decide.
- **Test-account queue is long:** many smoke cases are visible. This only affects the smoke
  account; demo accounts never see test data.

Re-ranked next items: referral summary with AI and outcome (9), visual refresh (8), demo-script
update in PLAN §6 for the AI moments.

## Audit 3 — 04:00 WIB, live site, after batches 13–23

Screenshots: `docs/screenshots/20261025-0359-audit-3/` (demo script against live; full AI page at
1440 px).

- **Wrong count (fixed, batch 24):** the AI page's monitoring tile counted acral ridge reads on
  non-acral lesions. The ingest now drops the acral read for non-acral sites, and monitoring counts
  acral sites only.
- **Numbers that look too good:** shadow-mode agreement shows 100 % on the smoke account, because
  smoke and e2e reads use the generating pattern. This is labelled live and simulated. In the pitch,
  say it shows the loop working, not model quality.
- **Quality model by tone:** quality_v2 is lowest on Fitzpatrick IV (0.94). The page's fairness
  note correctly speaks only about the pattern models.
- **AI story completeness:** the demo path now shows AI within the first 15 s on the phone (AI
  assist strip) and on the reviewer page (flags, triage card, similar lesions, findings draft).
  The AI page closes with evidence (per tone, calibration, ablation, monitoring, data funnel).
