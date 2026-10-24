"""Experiment: a small neural network on the raw pigment and blood maps vs the deployed
engineered-feature triage model. Not deployed; reported either way.

    uv run python -m scripts.experiment_mlp

Writes docs/evidence/experiment_mlp_vs_features.md. Same simulated lesions and split as
scripts/train_triage_model.py. Deterministic.
"""

import json
import subprocess
from datetime import UTC, datetime
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from scipy import ndimage
from skimage.transform import resize
from sklearn.neural_network import MLPClassifier

from app.processing.pipeline import measure
from app.processing.triage_model import MODEL_PATH
from scripts.train_triage_model import N_TEST, N_TRAIN, random_spec
from simulator.device import capture, factory_profile
from simulator.phantoms import TONE_FITZPATRICK, ground_truth

CROP = 32
REPORT = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "experiment_mlp_vs_features.md"


def patch(args: tuple[str, int]):
    spec = random_spec(*args)
    result = measure(capture(spec, ground_truth(spec)), factory_profile())
    if not result.qc.passed or result.mask is None or not result.mask.any():
        return None
    cy, cx = ndimage.center_of_mass(result.mask)
    half = 48
    y0, x0 = int(max(cy - half, 0)), int(max(cx - half, 0))
    crops = [m[y0 : y0 + 2 * half, x0 : x0 + 2 * half] for m in (result.melanin, result.hemoglobin)]
    skin = ~result.mask
    excess = [
        c - np.median(m[skin])
        for c, m in zip(crops, (result.melanin, result.hemoglobin), strict=True)
    ]
    x = np.concatenate([resize(e, (CROP, CROP), anti_aliasing=True).ravel() for e in excess])
    return x, spec.lesion, spec.tone


def dataset(split: str, n: int) -> list:
    with Pool() as pool:
        return [r for r in pool.map(patch, [(split, i) for i in range(n)]) if r is not None]


def main() -> None:
    train, test = dataset("train", N_TRAIN), dataset("test", N_TEST)
    x_train, y_train = np.array([r[0] for r in train]), [r[1] for r in train]
    x_test, y_test = np.array([r[0] for r in test]), [r[1] for r in test]
    mlp = MLPClassifier(
        hidden_layer_sizes=(64,), alpha=1e-3, max_iter=500, early_stopping=True, random_state=0
    ).fit(x_train, y_train)
    pred = mlp.predict(x_test)
    correct = np.array([p == t for p, t in zip(pred, y_test, strict=True)])
    by_tone = {
        f"{t} ({TONE_FITZPATRICK[t]})": round(
            float(correct[np.array([r[2] == t for r in test])].mean()), 4
        )
        for t in ("light", "medium", "dark")
    }
    deployed = json.loads(MODEL_PATH.read_text())["metrics"]["spectral"]["held_out"]
    deployed_tone = {t: g["accuracy"] for t, g in deployed["by_tone"].items()}
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
    ).stdout.strip()
    acc = float(correct.mean())
    gap = deployed["accuracy"] - acc
    verdict = (
        "more accurate" if gap > 0.005 else "as accurate" if gap >= -0.005 else "less accurate"
    )
    rows = "\n".join(f"| {t} | {deployed_tone[t]:.2f} | {by_tone[t]:.2f} |" for t in by_tone)
    REPORT.write_text(
        f"""# Experiment: neural network on raw maps vs engineered features (simulated data)

Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC on top of commit `{commit}` with
`uv run python -m scripts.experiment_mlp` (deterministic). Not deployed.

**Question:** does a small neural network that sees the pigment and blood maps directly (two
{CROP}×{CROP} crops around the lesion, {2 * CROP * CROP} inputs, one hidden layer of 64 units,
scikit-learn MLP) beat the deployed model, which uses 12 engineered lesion-vs-skin statistics?

Same simulated lesions and the same held-out split as the deployed triage model
({len(train)} train, {len(test)} held out).

| Held-out accuracy | Deployed (12 features, logistic regression) | Neural network (raw maps) |
|---|---|---|
| All | {deployed["accuracy"]:.2f} | {acc:.2f} |
{rows}

**Decision:** the deployed model stays. It is {verdict} ({deployed["accuracy"]:.2f} vs {acc:.2f}),
and every suggestion it makes can be explained in named, measurable terms ("high blood excess"), it
abstains and guards against out-of-range input, and it is calibrated. A neural network earns its
place with real images, where hand-made statistics miss texture and structure; this is where the
roadmap's image encoder comes in.
"""
    )
    print(REPORT.read_text())


if __name__ == "__main__":
    main()
