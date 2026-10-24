# Model card: lesion-pattern triage model `triage_v1` (research mode)

Trained 2026-10-24 20:51 UTC on top of commit `95be3b6` with
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

## Out-of-distribution guard
A capture whose standardised features lie further from the training centre than
99.5 % of training captures (norm > 7.20) gets no suggestion: "outside
the training range". 0.9% of held-out simulated
lesions were withheld this way. This is what should happen first when real-module images differ
from the simulator.

## Calibration (held-out): does a stated confidence match how often it is right?
Expected calibration error **0.034** (0 = perfectly calibrated).

| Confidence | n | Mean confidence | Actually right |
|---|---|---|---|
| 0.00-0.50 | 1 | 0.47 | 1.00 |
| 0.50-0.70 | 15 | 0.61 | 0.53 |
| 0.70-0.90 | 51 | 0.85 | 0.94 |
| 0.90-0.97 | 112 | 0.94 | 1.00 |
| 0.97-1.00 | 266 | 0.99 | 1.00 |

Where "actually right" exceeds the mean confidence, the model is under-confident: it says less
than it knows, which is the safer direction for a triage aid.

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
