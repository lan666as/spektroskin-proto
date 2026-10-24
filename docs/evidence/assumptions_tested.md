# Assumptions tested during GENOHACK (24–25 Oct 2026)

Each line names an assumption behind SpektroSkin, how it was tested tonight, and what came out,
with the file that holds the measurement. Everything ran on simulated data: these results test the
software and the method, not clinical performance. "Held out" means data the model never saw in
training.

| # | Assumption | Test | Result | Verdict | Source |
|---|---|---|---|---|---|
| 1 | Four LED bands plus calibration recover melanin and hemoglobin maps under noise, LED drift and hand motion | 90 simulated captures, 3 skin tones, compared with known ground truth | Mean map correlation ≥ 0.987 on every tone. The worst single capture is 0.864 (melanin in a vascular lesion, where there is little to correlate). Mask Dice ≥ 0.962; area error ≤ 7.8 %, with a small positive bias | Holds (simulated optics) | `validation_report.md` |
| 2 | The extra spectral bands add information over RGB (the optics kill test) | Same triage model trained on RGB bands only vs RGB + NIR + unmixed maps; 450 held-out lesions | 0.95 → 0.98 accuracy. The largest gain is on Fitzpatrick V (0.93 → 0.96), and it answers more often (92 % → 96 %) | Holds on simulated physics; must be repeated on real captures | `triage_model_card.md` |
| 3 | A small model can triage lesion patterns without overclaiming | Abstention below 70 %, an out-of-distribution guard, calibration check | 98 % held-out; 99 % when it answers; calibration error 0.034 (slightly under-confident); 0.9 % of held-out withheld as out of range | Holds | `triage_model_card.md` |
| 4 | Results are equally good on darker skin | Every model reported per Fitzpatrick tone | Both pattern models are lowest on Fitzpatrick V (triage 0.96, acral 0.97); the quality model is lowest on IV (0.94) | **Partly fails**: the dark-skin gap is visible and stated in the app | AI page, model cards |
| 5 | The acral ridge pattern (an acral melanoma sign) can be read from the spectral maps | Melanin map vs the ridge term of the unmixing; 230 held-out acral lesions, including faint patterns | 99 % held-out. On faint patterns it abstains about half the time instead of guessing | Holds; faint patterns are the limit | `acral_model_card.md` |
| 6 | The same lesion captured again gets the same answer | 12 phantoms × 10 captures | Same triage output 100 %, same acral output 100 %, area CV ≤ 0.1 % | Holds | `ai_evaluation.md` |
| 7 | The quality gate catches every bad capture | Stress test with sensor noise ×1–×8 | **Failed at first:** every ×8 capture passed QC. Fixed tonight with a patch-noise rule (×4 and ×8 now rejected), and the learned quality model was retrained with a noisy class | Falsified, then fixed | `ai_evaluation.md`, BUILD_LOG batches 17–18 |
| 8 | A learned quality check beats hand-set rules | Same held-out captures, rules vs logistic regression | 0.96 vs 0.88 | Holds; advisory only, the rules still decide | `quality_model_card.md` |
| 9 | Growth between visits can be measured, not just eyeballed | Day 01 → Day 30 registered outline comparison; repeat captures of a stable lesion | 7–13 mm² new area detected on the growth series; < 1.5 mm² on repeats | Holds | `backend/tests/test_change.py` |
| 10 | Dermatologist reads can validate a model before it is shown (shadow mode) | Pattern reads in the review form, blind reads, agreement on the AI page | The loop works end to end; agreement numbers so far come from test accounts only | Mechanism holds; no clinical data yet | AI page, `backend/tests/test_ai_summary.py` |
| 11 | Reviewed cases can become a validation set without leaking identity | Export of consented, histopathology-confirmed cases | No names, patient codes, free text or exact ages; withdrawal of consent removes a case at once | Holds | `/api/ai/validation-set`, e2e demo script |
| 12 | A neural network on the raw maps would beat engineered features | Same lesions and split; MLP on 2 × 32×32 map crops vs the deployed 12-feature model | 0.93 vs 0.98 (dark skin 0.91 vs 0.96) | Does not hold on simulated data: the explainable model stays; an image encoder waits for real images | `experiment_mlp_vs_features.md` |

## What we deliberately did not test, and why

- **Benign vs malignant.** That needs real, consented, histopathology-labelled captures. Simulated
  phantoms have no such labels, so any number would be fabricated. In the app it is marked
  "not active".
- **Real skin optics.** The simulator and the pipeline share one simplified optical model.
  Assumptions 1–9 must be re-run on bench captures from the physical module before anyone relies
  on them.
