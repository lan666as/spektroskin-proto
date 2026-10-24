"""Acral pattern model (research mode): does lesion pigment follow the skin furrows or the ridges?

On palms and soles, dermatologists read whether pigment lies in the furrows (parallel furrow
pattern) or on the ridges (parallel ridge pattern, a recognised reason for prompt specialist review
of acral lesions; Saida et al., Arch Dermatol 2004). Here: the melanin map is correlated with the
band-independent shading term of the unmixing (the ridges themselves), and a logistic regression
trained on simulated acral lesions by scripts/train_acral_model.py turns the evidence into a
pattern or an abstention. It describes a pattern; it is not a diagnosis.
"""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.special import expit

from app.processing.signature import lesion_and_ring
from app.processing.spectral import shading

MODEL_PATH = Path(__file__).resolve().parent / "models" / "acral_v1.json"
CLASSES = ("furrow", "ridge")
ABSTAIN_BELOW = 0.75
# Below this melanin excess over the surrounding skin there is no pigment pattern to read
# (vascular lesions sit near 0, the faintest trained pigmented lesions near 0.5).
MIN_PIGMENT_EXCESS = 0.3


def _band_pass(x: np.ndarray) -> np.ndarray:
    # Keeps structure at the dermatoglyphic ridge period (~12 px = 0.5 mm at the spacer scale).
    return ndimage.gaussian_filter(x, 1.0) - ndimage.gaussian_filter(x, 5.0)


def _corr(a: np.ndarray, b: np.ndarray, where: np.ndarray) -> float:
    a, b = a[where] - a[where].mean(), b[where] - b[where].mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-12))


def features(
    reflectance: dict[str, np.ndarray], melanin: np.ndarray, mask: np.ndarray
) -> np.ndarray | None:
    regions = lesion_and_ring(mask)
    if regions is None:
        return None
    lesion, ring = regions
    m, ridges = _band_pass(melanin), _band_pass(shading(reflectance))
    excess = float(melanin[lesion].mean() - melanin[ring].mean())
    return np.array(
        [
            _corr(m, ridges, lesion),
            _corr(m, ridges, ring),
            float(m[lesion].std() / max(excess, 1e-3)),
            float(ridges[lesion].std()),
            excess,
        ]
    )


@lru_cache
def _weights() -> dict:
    return json.loads(MODEL_PATH.read_text())


def probabilities(x: np.ndarray, w: dict) -> np.ndarray:
    z = (x - np.array(w["mean"])) / np.array(w["scale"])
    logit = float(np.array(w["coef"]) @ z + w["intercept"])
    p_ridge = float(expit(logit))
    return np.array([1 - p_ridge, p_ridge])


def predict(
    reflectance: dict[str, np.ndarray], melanin: np.ndarray, mask: np.ndarray
) -> dict | None:
    x = features(reflectance, melanin, mask)
    if x is None or x[4] < MIN_PIGMENT_EXCESS:
        return None
    w = _weights()
    p = probabilities(x, w)
    best = int(np.argmax(p))
    held_out = w["metrics"]["held_out"]
    return {
        "model": w["version"],
        "pattern": None if p[best] < ABSTAIN_BELOW else CLASSES[best],
        "probabilities": {c: round(float(v), 4) for c, v in zip(CLASSES, p, strict=True)},
        "abstain_below": ABSTAIN_BELOW,
        "held_out_accuracy_when_answered": held_out["accuracy_when_answered"],
        "held_out_coverage": held_out["coverage"],
        "trained_on": "simulated acral phantoms only",
    }
