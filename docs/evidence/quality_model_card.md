# Model card: image-quality classifier `quality_v2`

Trained 2026-10-24 20:08 UTC on top of commit `c1e8032` with
`uv run python -m scripts.train_quality_model` (deterministic).

## What it does
Classifies a raw multispectral capture as **good**, **blurry**, **glare** or **noisy** from 13
interpretable image statistics (multi-scale sharpness, high-frequency energy, saturation, hotspot
ratios, reference-patch consistency, pixel noise on the gray patches). v2 added the noisy class
after `ai_evaluation.md` showed v1 called heavily noisy captures good. It is shown in the app as
an **advisory second opinion** beside the
rule-based quality check; the rules still decide whether a capture is accepted. It looks at image
quality only and says nothing about the lesion.

## Model
Multinomial logistic regression (scikit-learn, C = 1.0) on standardised features. Exported as
plain JSON weights; the server runs inference with numpy only.

## Data (synthetic only)
Simulated captures of 12 phantoms (pigmented, vascular and mixed lesions on light / medium / dark
skin = Fitzpatrick III / IV / V, plus the acral growth series), 8 noise draws each, in four
versions: good, blurry (Gaussian blur, sigma 1.0–5.0 px), glare (specular hotspot, amplitude
0.4–3.0, radius 8–22 px) and noisy (sensor noise ×2.5–10). Mild blur, weak glare and moderate
noise are included on purpose, so the task is not trivial. No real or public images.

**Split:** every capture of the *mixed* lesion type is held out
(96 captures, never seen in training); training uses the rest (320 captures).

## Held-out results
Accuracy **0.96** (rule-based check on the same captures:
0.88). By skin tone: light (III): 0.97, medium (IV): 0.94, dark (V): 0.97.

| Class | Precision | Recall | n |
|---|---|---|---|
| good | 0.86 | 1.00 | 24 |
| blurry | 1.00 | 0.92 | 24 |
| glare | 1.00 | 0.92 | 24 |
| noisy | 1.00 | 1.00 | 24 |

Confusion (rows = true, columns = predicted: good, blurry, glare, noisy):

- good: [24, 0, 0, 0]
- blurry: [2, 22, 0, 0]
- glare: [2, 0, 22, 0]
- noisy: [0, 0, 0, 24]

Training-set accuracy: 0.99.

## Limits
- Trained and tested on synthetic phantoms from the same simulator: real optics, motion blur
  shapes and glare patterns will differ. Expect lower accuracy on real images until retrained on
  bench captures from the real module.
- Small held-out set (96 captures): one error moves accuracy by
  about 1.0 points.
- Four classes only; other failures (lesion out of frame, hair, gel bubbles) are not modelled.
- Not a medical device; never used to assess the lesion.
