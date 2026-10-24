# ITERATION_BACKLOG — overnight iteration loop (25 Oct 2026, until 08:00 WIB)

## Summary

(written at the end of the loop)

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
| 3 | Train a small image-quality classifier (scikit-learn) on synthetic phantoms; real held-out metrics; integrate as an advisory second opinion beside the rule-based QC; model card | 5 | 3 | M | 5 | done (batch 1) |
| 4 | In-app "AI roadmap" view: tiers active / shadow mode / not active, RGB-vs-spectral ablation as the optics kill test | 4 | 1 | S | 6 | todo |
| 5 | Care lifecycle: follow-up date and outcome entry (action taken, biopsy date, histopathology result) closing the loop on the recommendation; dermatologist sees the outcome | 5 | 3 | L | 4 | todo |
| 6 | "Follow-ups due" and "needs outcome" on the clinician home | 4 | 2 | S | 5 | todo |
| 7 | "Data for validation" page: how consented, reviewed, histopathology-confirmed cases would feed the future validation set (counts, eligibility rules) | 4 | 2 | M | 4 | todo |
| 8 | Visual refresh: light-gray canvas with white cards, initials avatars, compact device card | 3 | 2 | M | 2 | todo |
| 9 | Referral summary: add measurements, automated-analysis notes and the outcome | 3 | 1 | S | 4 | todo |
| 10 | Reviewer case card: change since Day 01 and diameter next to area | 3 | 1 | S | 4 | done (batch 1) |
