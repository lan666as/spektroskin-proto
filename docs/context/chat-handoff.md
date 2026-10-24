# Handoff from the claude.ai planning chat (24 Oct 2026, evening)

Context gathered in the team's claude.ai chat, which Claude Code cannot read.
PLAN.md still wins on any conflict. This file adds context; it does not change D1–D19.

## 1. GENOHACK Participant Kit — essentials (Claude Code could not list the folder)

- Final submission: **Sunday 25 Oct, 10:00 WIB**, one per team. Deliverables:
  1. final pitch deck, 2. product / prototype / PoC (demonstrable output),
  3. supporting technical / scientific evidence, 4. link to repo / Colab / dashboard / prototype files.
- Track pitch Sun 10:00–12:00: 6 min pitch + live/product demo, 4 min Q&A.
  Top 3 per track go to the Grand Final (13:15): 7 min pitch + demo, 4 min Q&A.
- Judging criteria: urgency of the problem; innovation and technical feasibility;
  strength of the prototype and supporting evidence ("designs, simulations, mockups,
  and demos all count — the more advanced the better"; "assumptions tested during
  the hackathon"); customer value and adoption; commercialization; 12-month
  execution roadmap; team and pitch.
- Rules: existing work may be used, but teams must clearly distinguish what existed
  before the hackathon from what was built or validated during it. Not allowed:
  fabricating evidence, results, interviews, experiments or traction; unauthorized
  confidential data; violating ethics, privacy, IP or data-use requirements.
- Demo guidance: show the core user experience; demonstrate the main value
  proposition; make clear what is real today vs simulated / planned; understandable
  to a non-technical judge; use real outputs wherever possible; rehearsed and reliable.
- Prizes include Best Prototype and Best Impact.
- Tool reimbursement up to IDR 3,750,000 per team (Claude eligible); keep receipts
  plus a short note on how each tool was used.
- Team track: Precision Genomic Diagnostic. SpektroSkin is optical, not genomic;
  track fit is an open question for the organizers, not something to improvise.

## 2. Target architecture (for README "target vs prototype" section)

The prototype deliberately simplifies a fuller target architecture:

- **Optical module:** LED ring (white cross-polarized + ~470/550/660/850 nm),
  cross-polarizers, macro lens at ~10× (standard dermoscopy field; NOTE: the
  proposal's "50–100×" is likely wrong and should be corrected in team materials),
  contact spacer with built-in gray reference target, MCU + constant-current LED
  driver. Sensor: phone camera (Path A) or external USB mono sensor without IR-cut
  filter (Path B). The phone-NIR question is the first hardware go/no-go.
- **App (target):** offline-first, on-device QC, calibration, spectral maps and
  segmentation; encrypted local storage, wiped after sync.
- **Backend (target):** two zones — an identifiable clinical zone (Indonesia-hosted;
  FHIR-style records for later SATUSEHAT integration; consent registry; audit log)
  and a de-identified research zone, joined only by a consent-gated
  de-identification step. Design for Indonesia's personal data protection law
  (UU PDP 27/2022); verify specifics with a regulatory advisor.
- **AI (target, staged):** Tier 1 image quality → Tier 2 segmentation and change
  tracking → Tier 3 triage support (foundation encoder + spectral branch + metadata,
  late fusion, out-of-distribution abstention, explanations; research-only until
  locally validated, shadow mode first) → Tier 4 ablation: RGB vs RGB+spectral as
  the kill test for the optics. The prototype implements none of Tier 3/4 by design.
- **Data strategy (target):** public datasets for baselines (ISIC-style; DDI,
  Fitzpatrick17k, PAD-UFES-20, MIDAS for stress tests) → phantom/volunteer bench
  data for optics → ethics-approved prospective collection at referral hospitals
  ("collect where cases concentrate, deploy where the gap is") → teledermoscopy
  review loop as a data flywheel.

## 3. Deck fixes for the morning (in addition to PLAN.md's slide-6 wording)

- Slide 18 still contains the placeholder "Fill with actual code, tests, and
  revisions only" — replace with the real BUILD_LOG summary.
- Slide 6 has two conflicting source lines ("team Figma concept" vs "working
  prototype screenshots"); keep only the true one.
- DermLite prices are inconsistent between the deck ($395 / $474) and the Q&A doc
  (~$195); use one verified set.
- Slide 1 has duplicated tagline/source text.
- Correct "50–100× magnification" wherever it appears.

## 4. Review notes on PLAN.md (from the chat)

PLAN.md is confirmed in substance. Three overnight-stall risks to check before Phase A:

1. **Keychain prompts.** Scripts read demo passwords via the macOS `security` CLI.
   A GUI "allow access" dialog or a locked keychain would stall M3/M6 unattended.
   Pre-flight: run the exact read command for both items in a fresh terminal; if a
   dialog appears, choose "Always Allow".
2. **SSH through Cloudflare.** If `ssh elang.zidan.dev` goes through Cloudflare
   Access, its token can expire and trigger a browser login, stalling M6. Check how
   the alias authenticates and whether any token outlives the night; if unsure,
   have deploy.sh use the direct alias that doesn't depend on Access.
3. **Extended demo dependency.** The extended demo's validation panel comes from
   overnight queue item 1. If that item doesn't land, the extended demo stops after
   the QC retake step.
