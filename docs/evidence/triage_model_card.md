# Model card: lesion-pattern triage model `triage_v1` (research mode)

Trained 2026-10-24 17:42 UTC on top of commit `4465576` with
`uv run python -m scripts.train_triage_model` (deterministic).

## What it does
Suggests which chromophore pattern dominates a lesion: **pigment-dominant**, **vascular** or
**mixed**, or abstains ("uncertain, dermatologist decides") when its top probability is below
70%. Shown to the clinician and dermatologist as **triage support in research
mode**, beside the images. It is **not a diagnosis** and outputs **no malignancy probability or
risk score**: the synthetic training data has no such labels, so any such number would be
invented.

## Model
Multinomial logistic regression (scikit-learn, C = 1.0) on standardised lesion-vs-skin
statistics: log contrast and texture per band, plus the excess and focality of the melanin and
hemoglobin maps. Exported as JSON weights; the server runs inference with numpy only.

## Data (synthetic only)
891 training and 445 held-out simulated lesions (equal thirds per pattern; random
light / medium / dark skin = Fitzpatrick III / IV / V; 20 % acral; 8–40 mm²; random pigment and
blood strength in overlapping ranges, so weak mixed lesions genuinely resemble pigmented ones).
Train and test lesions come from disjoint seeds: no shared shapes or textures. Captures that
fail the quality check are dropped. No real or public images.

## Held-out results (spectral model, used in the app)
Accuracy **0.98** on all held-out lesions. With abstention it answers
96% of lesions, with accuracy **0.99** on those.

| Skin tone | n | Accuracy | Answered | Accuracy when answered |
|---|---|---|---|---|
| light (III) | 143 | 0.99 | 97% | 1.00 |
| medium (IV) | 150 | 0.98 | 96% | 1.00 |
| dark (V) | 152 | 0.96 | 96% | 0.98 |

Confusion (rows = true, columns = predicted: pigmented, vascular, mixed):

- pigmented: [148, 0, 0]
- vascular: [0, 147, 0]
- mixed: [10, 0, 140]

## Ablation: RGB bands only vs RGB + NIR + spectral maps (the optics kill test, on simulated data)
| Arm | Features | Held-out accuracy | Answered | Accuracy when answered |
|---|---|---|---|---|
| RGB bands only | 6 | 0.95 | 92% | 0.98 |
| RGB + NIR + maps | 12 | 0.98 | 96% | 0.99 |

Both arms use the same outline (from the full pipeline). The "RGB" arm uses the module's
narrow-band blue, green and red LEDs, which is closer to spectral imaging than a phone camera, so
this understates what a consumer RGB photo would lose. This tests the method on the simulator's
own physics; it says nothing yet about real skin.

## Limits
- Simulated lesions from a simplified optical model; the patterns are defined by the simulator,
  not by histopathology. Expect it to fail on real images until retrained on real, labelled,
  consented captures.
- Pattern only: it does not tell benign from malignant, and is never shown as such.
- Patient metadata (age, site, Fitzpatrick) is not used: in synthetic data it is unrelated to the
  label, so it could only add noise. The planned clinical model adds it.
- Not a medical device.
