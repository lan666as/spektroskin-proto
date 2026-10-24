"""Train the acral pattern model (furrow vs ridge) on simulated acral lesions.

    uv run python -m scripts.train_acral_model

Writes app/processing/models/acral_v1.json and docs/evidence/acral_model_card.md. Deterministic.
Synthetic data only; train and test lesions come from disjoint seeds.
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

from app.processing.acral_model import ABSTAIN_BELOW, CLASSES, MODEL_PATH, features, probabilities
from app.processing.pipeline import measure
from simulator.device import capture, factory_profile
from simulator.phantoms import TONE_FITZPATRICK, PhantomSpec, ground_truth

N_TRAIN, N_TEST = 400, 240
TONES = ("light", "medium", "dark")
MODULATION = (0.005, 0.35)  # faint patterns included on purpose: real ambiguity
FAINT = 0.05
CARD = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "acral_model_card.md"


def random_spec(split: str, i: int) -> PhantomSpec:
    rng = random.Random(f"acral-{split}-{i}")
    return PhantomSpec(
        id=f"acral_{split}_{i:04d}",
        lesion=rng.choice(("pigmented", "pigmented", "mixed")),
        tone=rng.choice(TONES),
        acral=True,
        area_mm2=rng.uniform(8, 35),
        pigment_amplitude=rng.uniform(0.6, 1.8),
        acral_pattern=CLASSES[i % 2],
        acral_modulation=rng.uniform(*MODULATION),
    )


def row(args: tuple[str, int]):
    spec = random_spec(*args)
    result = measure(capture(spec, ground_truth(spec)), factory_profile())
    if not result.qc.passed:
        return None
    x = features(result.reflectance, result.melanin, result.mask)
    return None if x is None else (x, spec.acral_pattern, spec.tone, spec.acral_modulation)


def dataset(split: str, n: int) -> list:
    with Pool() as pool:
        return [r for r in pool.map(row, [(split, i) for i in range(n)]) if r is not None]


def evaluate(w: dict, rows: list) -> dict:
    p = np.array([probabilities(r[0], w) for r in rows])
    y = [r[1] for r in rows]
    pred = [CLASSES[k] for k in p.argmax(axis=1)]
    answered = p.max(axis=1) >= ABSTAIN_BELOW
    correct = np.array([a == b for a, b in zip(pred, y, strict=True)])

    def acc(sel):
        return round(float(correct[sel].mean()), 4) if sel.any() else None

    def group(sel):
        return {
            "n": int(sel.sum()),
            "accuracy": acc(sel),
            "coverage": round(float(answered[sel].mean()), 4),
            "accuracy_when_answered": acc(sel & answered),
        }

    faint = np.array([r[3] < FAINT for r in rows])
    return {
        **group(np.ones(len(rows), bool)),
        "by_tone": {
            f"{t} ({TONE_FITZPATRICK[t]})": group(np.array([r[2] == t for r in rows]))
            for t in TONES
        },
        "faint_pattern": group(faint),
        "clear_pattern": group(~faint),
        "confusion": confusion_matrix(y, pred, labels=CLASSES).tolist(),
    }


def main() -> None:
    train, test = dataset("train", N_TRAIN), dataset("test", N_TEST)
    x_train = np.array([r[0] for r in train])
    scaler = StandardScaler().fit(x_train)
    model = LogisticRegression(C=1.0, max_iter=2000).fit(
        scaler.transform(x_train), [r[1] for r in train]
    )
    sign = 1.0 if list(model.classes_) == list(CLASSES) else -1.0  # coef is for classes_[1]
    w = {
        "version": "acral_v1",
        "classes": list(CLASSES),
        "mean": scaler.mean_.round(8).tolist(),
        "scale": scaler.scale_.round(8).tolist(),
        "coef": (sign * model.coef_[0]).round(8).tolist(),
        "intercept": round(float(sign * model.intercept_[0]), 8),
    }
    w["metrics"] = {"train": evaluate(w, train), "held_out": evaluate(w, test)}
    w["trained_at"] = f"{datetime.now(UTC):%Y-%m-%d %H:%M} UTC"
    w["trained_from_commit"] = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    MODEL_PATH.write_text(json.dumps(w, indent=1) + "\n")
    CARD.write_text(card(w, len(train), len(test)))
    h = w["metrics"]["held_out"]
    print("held-out", h["accuracy"], h["coverage"], h["accuracy_when_answered"])
    print("faint", h["faint_pattern"], "\nclear", h["clear_pattern"])
    print({t: v["accuracy"] for t, v in h["by_tone"].items()})


def _row(name: str, g: dict) -> str:
    return (
        f"| {name} | {g['n']} | {g['accuracy']:.2f} | {g['coverage']:.0%} | "
        f"{g['accuracy_when_answered']:.2f} |"
    )


def card(w: dict, n_train: int, n_test: int) -> str:
    h = w["metrics"]["held_out"]
    rows = [_row(t, g) for t, g in h["by_tone"].items()]
    rows += [_row(f"faint pattern (modulation < {FAINT})", h["faint_pattern"])]
    rows += [_row("clear pattern", h["clear_pattern"])]
    table = "\n".join(rows)
    return f"""# Model card: acral pattern model `acral_v1` (research mode)

Trained {w["trained_at"]} on top of commit `{w["trained_from_commit"]}` with
`uv run python -m scripts.train_acral_model` (deterministic).

## What it does
For lesions on palms and soles, it says whether the pigment follows the **furrows** (parallel
furrow pattern) or the **ridges** (parallel ridge pattern) of the skin, or abstains below
{ABSTAIN_BELOW:.0%} confidence. Dermatology guidelines treat a parallel ridge pattern on acral
skin as a reason for prompt specialist review (Saida et al., Arch Dermatol 2004); acral lesions
matter in Indonesia, where acral lentiginous melanoma is the most common subtype reported in
Asian populations. The app shows it only for acral sites, in **research mode**. It describes a
pattern; it outputs no malignancy probability and is not a diagnosis.

## Model
Logistic regression (scikit-learn, C = 1.0) on 5 physics-derived features: correlation between the
band-passed melanin map and the band-independent shading term of the unmixing (the ridges), inside
the lesion and in the surrounding skin; pattern strength; ridge visibility; pigment excess.

## Data (synthetic only)
{n_train} training and {n_test} held-out simulated acral lesions (half furrow, half ridge; random
light / medium / dark skin = Fitzpatrick III / IV / V; 8–35 mm²; pigment strength 0.6–1.8; pattern
modulation 0.005–0.35, so some patterns are deliberately faint). Disjoint seeds for train and test.

## Held-out results
Accuracy **{h["accuracy"]:.2f}**; it answers {h["coverage"]:.0%} of lesions, with accuracy
**{h["accuracy_when_answered"]:.2f}** on those.

| Group | n | Accuracy | Answered | Accuracy when answered |
|---|---|---|---|---|
{table}

Confusion (rows = true, columns = predicted: furrow, ridge): {h["confusion"]}

## Limits
- Simulated ridges and pigment from a simplified optical model; real dermatoglyphics, sweat pores,
  hyperkeratosis and pressure change the picture. Must be retrained and validated on real,
  consented acral captures before any clinical use.
- Two patterns only; fibrillar, lattice-like and irregular patterns are not modelled.
- Not a medical device.
"""


if __name__ == "__main__":
    main()
