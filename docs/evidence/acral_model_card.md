# Model card: acral pattern model `acral_v1` (research mode)

Trained 2026-10-24 19:14 UTC on top of commit `8ab5fc8` with
`uv run python -m scripts.train_acral_model` (deterministic).

## What it does
For lesions on palms and soles, it says whether the pigment follows the **furrows** (parallel
furrow pattern) or the **ridges** (parallel ridge pattern) of the skin, or abstains below
75% confidence. Dermatology guidelines treat a parallel ridge pattern on acral
skin as a reason for prompt specialist review (Saida et al., Arch Dermatol 2004); acral lesions
matter in Indonesia, where acral lentiginous melanoma is the most common subtype reported in
Asian populations. The app shows it only for acral sites, in **research mode**. It describes a
pattern; it outputs no malignancy probability and is not a diagnosis.

## Model
Logistic regression (scikit-learn, C = 1.0) on 5 physics-derived features: correlation between the
band-passed melanin map and the band-independent shading term of the unmixing (the ridges), inside
the lesion and in the surrounding skin; pattern strength; ridge visibility; pigment excess.

## Data (synthetic only)
379 training and 230 held-out simulated acral lesions (half furrow, half ridge; random
light / medium / dark skin = Fitzpatrick III / IV / V; 8–35 mm²; pigment strength 0.6–1.8; pattern
modulation 0.005–0.35, so some patterns are deliberately faint). Disjoint seeds for train and test.

## Held-out results
Accuracy **0.99**; it answers 91% of lesions, with accuracy
**1.00** on those.

| Group | n | Accuracy | Answered | Accuracy when answered |
|---|---|---|---|---|
| light (III) | 76 | 1.00 | 92% | 1.00 |
| medium (IV) | 80 | 1.00 | 92% | 1.00 |
| dark (V) | 74 | 0.97 | 89% | 0.98 |
| faint pattern (modulation < 0.05) | 39 | 0.95 | 54% | 0.95 |
| clear pattern | 191 | 1.00 | 99% | 1.00 |

Confusion (rows = true, columns = predicted: furrow, ridge): [[117, 1], [1, 111]]

## Limits
- Simulated ridges and pigment from a simplified optical model; real dermatoglyphics, sweat pores,
  hyperkeratosis and pressure change the picture. Must be retrained and validated on real,
  consented acral captures before any clinical use.
- Not run when the lesion carries little extra pigment (melanin excess below
  0.3): there is no pigment pattern to read, e.g. on vascular lesions.
- Two patterns only; fibrillar, lattice-like and irregular patterns are not modelled.
- Not a medical device.
