# AI evaluation: repeatability and stress (simulated data only)

Generated 2026-10-24 20:00 UTC on top of commit `965d7d9` with
`uv run python -m scripts.ai_evaluation` (deterministic). Models: quality_v1, triage_v1, acral_v1. Held-out accuracy
per model is in the model cards next to this file.

Everything here is measured on the simulator, which shares its optical model with the pipeline:
it shows that the software behaves consistently, not how it performs on skin.

## Repeatability: the same lesion captured again

Each phantom captured 10 times with fresh sensor noise, LED drift and hand motion. A
trustworthy assistant gives the same answer for the same lesion.

| Phantom | Captures passing QC | Same triage output | Triage right | Same acral output | Area CV | Border SD |
|---|---|---|---|---|---|---|
| pigmented_light | 10/10 | 100% | 100% | n/a | 0.1% | 0.003 |
| pigmented_medium | 10/10 | 100% | 100% | n/a | 0.1% | 0.006 |
| pigmented_dark | 10/10 | 100% | 100% | n/a | 0.0% | 0.002 |
| vascular_light | 10/10 | 100% | 100% | n/a | 0.0% | 0.001 |
| vascular_medium | 10/10 | 100% | 100% | n/a | 0.0% | 0.002 |
| vascular_dark | 10/10 | 100% | 100% | n/a | 0.1% | 0.004 |
| mixed_light | 10/10 | 100% | 100% | n/a | 0.0% | 0.004 |
| mixed_medium | 10/10 | 100% | 100% | n/a | 0.0% | 0.007 |
| mixed_dark | 10/10 | 100% | 100% | n/a | 0.1% | 0.004 |
| acral_dark_d01 | 10/10 | 100% | 100% | 100% | 0.1% | 0.006 |
| acral_dark_d30 | 10/10 | 100% | 100% | 100% | 0.1% | 0.004 |
| acral_ridge_dark | 10/10 | 100% | 100% | 100% | 0.0% | 0.003 |

Same triage output: share of captures giving the most common suggestion (an abstention counts as
an output). Area CV: coefficient of variation of the automated area.

## Stress: more sensor noise than the module is specified for

12 phantoms × 5 captures at each noise level (×1 = the simulated module).
What should happen as images degrade: quality checks reject more, the triage model abstains more,
and what it still answers stays right.

| Sensor noise | QC pass | Quality model says good | Triage answered | Triage right when answered | Out of range |
|---|---|---|---|---|---|
| ×1 | 100% | 100% | 100% | 100% | 0% |
| ×2 | 100% | 100% | 100% | 100% | 0% |
| ×4 | 0% | 100% | 0% | – | 0% |
| ×8 | 0% | 100% | 0% | – | 0% |

**Finding, and the fix it led to:** the first run of this report showed that neither the
rule-based quality check nor the learned quality model flagged heavy sensor noise (100 % of ×8
captures passed QC); only the triage model's abstention and out-of-distribution guard reacted.
A noise check on the gray reference patches was added to the quality gate (rejects above 0.02
relative pixel noise, about 3× the simulated module), which is what the QC column now shows:
noisy captures get retake guidance and never reach the triage model. The learned quality model
still says "good": it was never trained on noise, which is the next thing to retrain it on.
