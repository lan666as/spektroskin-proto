# Model card: image-quality classifier `quality_v1`

Trained 2026-10-24 17:30 UTC on top of commit `6f518a4` with
`uv run python -m scripts.train_quality_model` (deterministic).

## What it does
Classifies a raw multispectral capture as **good**, **blurry** or **glare** from 12 interpretable
image statistics (multi-scale sharpness, high-frequency energy, saturation, hotspot ratios,
reference-patch consistency). It is shown in the app as an **advisory second opinion** beside the
rule-based quality check; the rules still decide whether a capture is accepted. It looks at image
quality only and says nothing about the lesion.

## Model
Multinomial logistic regression (scikit-learn, C = 1.0) on standardised features. Exported as
plain JSON weights; the server runs inference with numpy only.

## Data (synthetic only)
Simulated captures of 12 phantoms (pigmented, vascular and mixed lesions on light / medium / dark
skin = Fitzpatrick III / IV / V, plus the acral growth series), 8 noise draws each, in three
versions: good, blurry (Gaussian blur, sigma 1.0–5.0 px) and glare (specular hotspot, amplitude
0.4–3.0, radius 8–22 px). Mild blur and weak glare are included on purpose, so the task is not
trivial. No real or public images.

**Split:** every capture of the *mixed* lesion type is held out
(72 captures, never seen in training); training uses the rest (216 captures).

## Held-out results
Accuracy **0.97** (rule-based check on the same captures:
0.90). By skin tone: light (III): 0.92, medium (IV): 1.00, dark (V): 1.00.

| Class | Precision | Recall | n |
|---|---|---|---|
| good | 0.92 | 1.00 | 24 |
| blurry | 1.00 | 0.96 | 24 |
| glare | 1.00 | 0.96 | 24 |

Confusion (rows = true, columns = predicted: good, blurry, glare):

- good: [24, 0, 0]
- blurry: [1, 23, 0]
- glare: [1, 0, 23]

Training-set accuracy: 0.99.

## Limits
- Trained and tested on synthetic phantoms from the same simulator: real optics, motion blur
  shapes and glare patterns will differ. Expect lower accuracy on real images until retrained on
  bench captures from the real module.
- Small held-out set (72 captures): one error moves accuracy by
  about 1.4 points.
- Three classes only; other failures (lesion out of frame, hair, gel bubbles) are not modelled.
- Not a medical device; never used to assess the lesion.
