"""Train the lesion-pattern triage model on synthetic phantoms, with an RGB-vs-spectral ablation.

    uv run python -m scripts.train_triage_model

Writes app/processing/models/triage_v1.json and docs/evidence/triage_model_card.md.
Deterministic (fixed seeds). Synthetic data only; train and test lesions never share a shape.
"""

import json
import random
import subprocess
from datetime import UTC, datetime
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from sklearn.preprocessing import StandardScaler

from app.processing.pipeline import measure
from app.processing.triage_model import ABSTAIN_BELOW, CLASSES, MODEL_PATH, features, probabilities
from simulator.device import capture, factory_profile
from simulator.phantoms import TONE_FITZPATRICK, PhantomSpec, ground_truth

N_TRAIN, N_TEST = 900, 450
OOD_PERCENTILE = 99.5
TONES = ("light", "medium", "dark")
# Overlapping strength ranges per pattern, so weak mixed lesions look pigmented: real ambiguity.
PIGMENT = {"pigmented": (0.3, 2.0), "mixed": (0.2, 1.4)}
VASCULAR = {"vascular": (0.1, 0.9), "mixed": (0.03, 0.7)}
CARD = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "triage_model_card.md"


def random_spec(split: str, i: int) -> PhantomSpec:
    rng = random.Random(f"{split}-{i}")
    lesion = CLASSES[i % 3]
    tone = rng.choice(TONES)
    return PhantomSpec(
        id=f"triage_{split}_{i:04d}",
        lesion=lesion,
        tone=tone,
        acral=rng.random() < 0.2,
        area_mm2=rng.uniform(8, 40),
        pigment_amplitude=rng.uniform(*PIGMENT[lesion]) if lesion in PIGMENT else None,
        vascular_amplitude=rng.uniform(*VASCULAR[lesion]) if lesion in VASCULAR else None,
    )


def row(args: tuple[str, int]):
    spec = random_spec(*args)
    result = measure(capture(spec, ground_truth(spec)), factory_profile())
    if not result.qc.passed:
        return None
    refl = result.reflectance
    both = [
        features(refl, result.melanin, result.hemoglobin, result.mask, spectral=s)
        for s in (True, False)
    ]
    if both[0] is None:
        return None
    return both[0], both[1], spec.lesion, spec.tone


def dataset(split: str, n: int) -> list:
    with Pool() as pool:
        return [r for r in pool.map(row, [(split, i) for i in range(n)]) if r is not None]


def evaluate(scaler, model, x, y, tones) -> dict:
    w = export(scaler, model)
    p = np.array([probabilities(v, w) for v in x])
    pred = [CLASSES[k] for k in p.argmax(axis=1)]
    answered = p.max(axis=1) >= ABSTAIN_BELOW
    correct = np.array([a == b for a, b in zip(pred, y, strict=True)])

    def acc(sel):
        return round(float(correct[sel].mean()), 4) if sel.any() else None

    by_tone = {}
    for t in TONES:
        sel = np.array([v == t for v in tones])
        by_tone[f"{t} ({TONE_FITZPATRICK[t]})"] = {
            "n": int(sel.sum()),
            "accuracy": acc(sel),
            "coverage": round(float(answered[sel].mean()), 4),
            "accuracy_when_answered": acc(sel & answered),
        }
    return {
        "n": len(y),
        "accuracy": acc(np.ones(len(y), bool)),
        "coverage": round(float(answered.mean()), 4),
        "accuracy_when_answered": acc(answered),
        "by_tone": by_tone,
        "confusion": confusion_matrix(y, pred, labels=CLASSES).tolist(),
    }


def export(scaler, model) -> dict:
    order = [list(model.classes_).index(c) for c in CLASSES]
    return {
        "mean": scaler.mean_.round(8).tolist(),
        "scale": scaler.scale_.round(8).tolist(),
        "coef": model.coef_[order].round(8).tolist(),
        "intercept": model.intercept_[order].round(8).tolist(),
    }


def fit(x_train, y_train):
    scaler = StandardScaler().fit(x_train)
    return scaler, LogisticRegression(C=1.0, max_iter=5000).fit(scaler.transform(x_train), y_train)


def main() -> None:
    train, test = dataset("train", N_TRAIN), dataset("test", N_TEST)
    y_train, y_test = [r[2] for r in train], [r[2] for r in test]
    tones_train, tones_test = [r[3] for r in train], [r[3] for r in test]
    metrics, arms = {}, {}
    for name, col in (("spectral", 0), ("rgb_only", 1)):
        x_train = np.array([r[col] for r in train])
        x_test = np.array([r[col] for r in test])
        scaler, model = fit(x_train, y_train)
        arms[name] = (scaler, model)
        metrics[name] = {
            "n_features": x_train.shape[1],
            "train": evaluate(scaler, model, x_train, y_train, tones_train),
            "held_out": evaluate(scaler, model, x_test, y_test, tones_test),
        }

    # Out-of-distribution guard: a capture whose standardised features lie further from the
    # training centre than 99.5 % of training captures gets no suggestion.
    scaler = arms["spectral"][0]
    norms_train = np.linalg.norm(scaler.transform(np.array([r[0] for r in train])), axis=1)
    norms_test = np.linalg.norm(scaler.transform(np.array([r[0] for r in test])), axis=1)
    ood_norm = float(np.percentile(norms_train, OOD_PERCENTILE))
    metrics["spectral"]["held_out_ood_rate"] = round(float((norms_test > ood_norm).mean()), 4)

    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    weights = {
        "version": "triage_v1",
        "classes": list(CLASSES),
        **export(*arms["spectral"]),
        "ood_norm": round(ood_norm, 4),
        "trained_at": f"{datetime.now(UTC):%Y-%m-%d %H:%M} UTC",
        "trained_from_commit": commit,
        "data": "synthetic phantoms only; train and test lesions generated from disjoint seeds",
        "metrics": metrics,
    }
    MODEL_PATH.write_text(json.dumps(weights, indent=1) + "\n")
    CARD.write_text(card(weights, len(train), len(test)))
    for name, m in metrics.items():
        h = m["held_out"]
        print(
            name,
            "acc",
            h["accuracy"],
            "coverage",
            h["coverage"],
            "acc|answered",
            h["accuracy_when_answered"],
        )
        print("  by tone", {t: v["accuracy"] for t, v in h["by_tone"].items()})


def _tone_table(m: dict) -> str:
    lines = [
        "| Skin tone | n | Accuracy | Answered | Accuracy when answered |",
        "|---|---|---|---|---|",
    ]
    for t, v in m["by_tone"].items():
        lines.append(
            f"| {t} | {v['n']} | {v['accuracy']:.2f} | {v['coverage']:.0%} | "
            f"{v['accuracy_when_answered']:.2f} |"
        )
    return "\n".join(lines)


def _arm_row(name: str, arm: dict) -> str:
    h = arm["held_out"]
    return (
        f"| {name} | {arm['n_features']} | {h['accuracy']:.2f} | {h['coverage']:.0%} | "
        f"{h['accuracy_when_answered']:.2f} |"
    )


def card(w: dict, n_train: int, n_test: int) -> str:
    s = w["metrics"]["spectral"]["held_out"]
    conf = "\n".join(f"- {c}: {row}" for c, row in zip(CLASSES, s["confusion"], strict=True))
    return f"""# Model card: lesion-pattern triage model `triage_v1` (research mode)

Trained {w["trained_at"]} on top of commit `{w["trained_from_commit"]}` with
`uv run python -m scripts.train_triage_model` (deterministic).

## What it does
Suggests which chromophore pattern dominates a lesion: **pigment-dominant**, **vascular** or
**mixed**, or abstains ("uncertain, dermatologist decides") when its top probability is below
{ABSTAIN_BELOW:.0%}. Shown to the clinician and dermatologist as **triage support in research
mode**, beside the images. It is **not a diagnosis** and outputs **no malignancy probability or
risk score**: the synthetic training data has no such labels, so any such number would be
invented.

## Model
Multinomial logistic regression (scikit-learn, C = 1.0) on standardised lesion-vs-skin
statistics: log contrast and texture per band, plus the excess and focality of the melanin and
hemoglobin maps. Exported as JSON weights; the server runs inference with numpy only.

## Data (synthetic only)
{n_train} training and {n_test} held-out simulated lesions (equal thirds per pattern; random
light / medium / dark skin = Fitzpatrick III / IV / V; 20 % acral; 8–40 mm²; random pigment and
blood strength in overlapping ranges, so weak mixed lesions genuinely resemble pigmented ones).
Train and test lesions come from disjoint seeds: no shared shapes or textures. Captures that
fail the quality check are dropped. No real or public images.

## Held-out results (spectral model, used in the app)
Accuracy **{s["accuracy"]:.2f}** on all held-out lesions. With abstention it answers
{s["coverage"]:.0%} of lesions, with accuracy **{s["accuracy_when_answered"]:.2f}** on those.

{_tone_table(s)}

Confusion (rows = true, columns = predicted: pigmented, vascular, mixed):

{conf}

## Out-of-distribution guard
A capture whose standardised features lie further from the training centre than
{OOD_PERCENTILE} % of training captures (norm > {w["ood_norm"]:.2f}) gets no suggestion: "outside
the training range". {w["metrics"]["spectral"]["held_out_ood_rate"]:.1%} of held-out simulated
lesions were withheld this way. This is what should happen first when real-module images differ
from the simulator.

## Ablation: RGB bands only vs RGB + NIR + spectral maps (the optics kill test, on simulated data)
| Arm | Features | Held-out accuracy | Answered | Accuracy when answered |
|---|---|---|---|---|
{_arm_row("RGB bands only", w["metrics"]["rgb_only"])}
{_arm_row("RGB + NIR + maps", w["metrics"]["spectral"])}

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
"""


if __name__ == "__main__":
    main()
