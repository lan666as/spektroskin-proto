"""Train the image-quality classifier on synthetic phantoms and report held-out metrics.

    uv run python -m scripts.train_quality_model

Writes app/processing/models/quality_v1.json (weights for numpy inference) and
docs/evidence/quality_model_card.md. Deterministic (fixed seeds). Synthetic data only.
"""

import json
import random
import subprocess
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.preprocessing import StandardScaler

from app.processing.qc import run_qc
from app.processing.quality_model import CLASSES, FEATURE_NAMES, MODEL_PATH, features
from simulator.device import capture, factory_profile
from simulator.phantoms import TONE_FITZPATRICK, catalogue, ground_truth

REPEATS = 8
HELD_OUT_LESION = "mixed"  # every capture of this lesion type is kept out of training
CARD = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "quality_model_card.md"


def dataset():
    """(features, label, lesion, tone, rule_label) for good, blurry and glare captures."""
    profile = factory_profile()
    rng = random.Random(20261025)
    rows = []
    bases = [s for s in catalogue() if s.variant is None]
    for spec in bases:
        gt = ground_truth(spec)
        for k in range(REPEATS):
            variants = [
                ("good", spec, {}),
                ("blurry", replace(spec, variant="blur"), {"blur_sigma": rng.uniform(1.0, 5.0)}),
                (
                    "glare",
                    replace(spec, variant="glare"),
                    {"glare_amplitude": rng.uniform(0.4, 3.0), "glare_radius": rng.uniform(8, 22)},
                ),
            ]
            for label, variant_spec, params in variants:
                frame_set = capture(variant_spec, gt, repeat=k, **params)
                qc = run_qc(frame_set, profile)
                rule = "good" if qc.passed else ("glare" if not qc.checks["no_glare"] else "blurry")
                rows.append((features(frame_set, profile), label, spec.lesion, spec.tone, rule))
    return rows


def metrics(y_true, y_pred) -> dict:
    p, r, _, n = precision_recall_fscore_support(y_true, y_pred, labels=CLASSES, zero_division=0)
    return {
        "n": len(y_true),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "per_class": {
            c: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4), "n": int(n[i])}
            for i, c in enumerate(CLASSES)
        },
        "confusion": confusion_matrix(y_true, y_pred, labels=CLASSES).tolist(),
    }


def main() -> None:
    rows = dataset()
    train = [r for r in rows if r[2] != HELD_OUT_LESION]
    test = [r for r in rows if r[2] == HELD_OUT_LESION]
    x_train = np.array([r[0] for r in train])
    y_train = [r[1] for r in train]
    x_test = np.array([r[0] for r in test])
    y_test = [r[1] for r in test]

    scaler = StandardScaler().fit(x_train)
    model = LogisticRegression(C=1.0, max_iter=2000).fit(scaler.transform(x_train), y_train)
    order = [list(model.classes_).index(c) for c in CLASSES]
    pred_test = list(model.predict(scaler.transform(x_test)))

    report = {
        "train": metrics(y_train, list(model.predict(scaler.transform(x_train)))),
        "held_out": metrics(y_test, pred_test),
        "held_out_rules": metrics(y_test, [r[4] for r in test]),
        "held_out_by_tone": {
            f"{tone} ({TONE_FITZPATRICK[tone]})": round(
                float(
                    accuracy_score(
                        [r[1] for r in test if r[3] == tone],
                        [p for r, p in zip(test, pred_test, strict=True) if r[3] == tone],
                    )
                ),
                4,
            )
            for tone in ("light", "medium", "dark")
        },
    }
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    weights = {
        "version": "quality_v1",
        "classes": list(CLASSES),
        "feature_names": list(FEATURE_NAMES),
        "mean": scaler.mean_.round(8).tolist(),
        "scale": scaler.scale_.round(8).tolist(),
        "coef": model.coef_[order].round(8).tolist(),
        "intercept": model.intercept_[order].round(8).tolist(),
        "trained_at": f"{datetime.now(UTC):%Y-%m-%d %H:%M} UTC",
        "trained_from_commit": commit,
        "data": f"synthetic phantoms only; held-out lesion type: {HELD_OUT_LESION}",
        "metrics": report,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(weights, indent=1) + "\n")
    CARD.write_text(card(weights, len(train), len(test)))
    print(json.dumps(report["held_out"], indent=1))
    print("rules:", report["held_out_rules"]["accuracy"], "by tone:", report["held_out_by_tone"])


def _table(m: dict) -> str:
    lines = ["| Class | Precision | Recall | n |", "|---|---|---|---|"]
    for c, v in m["per_class"].items():
        lines.append(f"| {c} | {v['precision']:.2f} | {v['recall']:.2f} | {v['n']} |")
    conf = ["", "Confusion (rows = true, columns = predicted: good, blurry, glare):", ""]
    conf += [f"- {c}: {row}" for c, row in zip(CLASSES, m["confusion"], strict=True)]
    return "\n".join(lines + conf)


def card(w: dict, n_train: int, n_test: int) -> str:
    m = w["metrics"]
    tones = ", ".join(f"{t}: {a:.2f}" for t, a in m["held_out_by_tone"].items())
    return f"""# Model card: image-quality classifier `quality_v1`

Trained {w["trained_at"]} on top of commit `{w["trained_from_commit"]}` with
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
skin = Fitzpatrick III / IV / V, plus the acral growth series), {REPEATS} noise draws each, in three
versions: good, blurry (Gaussian blur, sigma 1.0–5.0 px) and glare (specular hotspot, amplitude
0.4–3.0, radius 8–22 px). Mild blur and weak glare are included on purpose, so the task is not
trivial. No real or public images.

**Split:** every capture of the *{w["data"].split(": ")[-1]}* lesion type is held out
({n_test} captures, never seen in training); training uses the rest ({n_train} captures).

## Held-out results
Accuracy **{m["held_out"]["accuracy"]:.2f}** (rule-based check on the same captures:
{m["held_out_rules"]["accuracy"]:.2f}). By skin tone: {tones}.

{_table(m["held_out"])}

Training-set accuracy: {m["train"]["accuracy"]:.2f}.

## Limits
- Trained and tested on synthetic phantoms from the same simulator: real optics, motion blur
  shapes and glare patterns will differ. Expect lower accuracy on real images until retrained on
  bench captures from the real module.
- Small held-out set ({n_test} captures): one error moves accuracy by
  about {100 / n_test:.1f} points.
- Three classes only; other failures (lesion out of frame, hair, gel bubbles) are not modelled.
- Not a medical device; never used to assess the lesion.
"""


if __name__ == "__main__":
    main()
