"""Lesion-pattern triage model (research mode): which chromophore pattern dominates the lesion.

Multinomial logistic regression over lesion-vs-skin statistics of the calibrated bands and the
pigment and blood maps, trained on synthetic phantoms by scripts/train_triage_model.py. It
suggests a pattern (pigment-dominant, vascular, mixed) or abstains; it is not a diagnosis and
outputs no malignancy probability, because the training data carries no such labels.
"""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.processing.signature import lesion_and_ring

MODEL_PATH = Path(__file__).resolve().parent / "models" / "triage_v1.json"
CLASSES = ("pigmented", "vascular", "mixed")
RGB_BANDS = ("blue", "green", "red")
ABSTAIN_BELOW = 0.70  # top-class probability under this → "uncertain, dermatologist decides"
FEATURE_LABELS = (
    *(f"{b} {k}" for b in RGB_BANDS for k in ("contrast", "texture")),
    "NIR contrast",
    "NIR texture",
    "melanin excess",
    "melanin focality",
    "blood excess",
    "blood focality",
)


def _band_stats(r: np.ndarray, lesion: np.ndarray, ring: np.ndarray) -> list[float]:
    inside = r[lesion]
    return [
        float(np.log(inside.mean() / max(r[ring].mean(), 1e-6))),
        float(inside.std() / max(inside.mean(), 1e-6)),
    ]


def _map_stats(m: np.ndarray, lesion: np.ndarray, ring: np.ndarray) -> list[float]:
    inside = m[lesion]
    return [
        float(inside.mean() - m[ring].mean()),
        float(np.percentile(inside, 95) - np.median(inside)),
    ]


def features(
    reflectance: dict[str, np.ndarray],
    melanin: np.ndarray,
    hemoglobin: np.ndarray,
    mask: np.ndarray,
    spectral: bool = True,
) -> np.ndarray | None:
    """RGB-band statistics, plus NIR and the pigment/blood maps when spectral (the ablation arm
    sets spectral=False). None if the outline is too small to measure."""
    regions = lesion_and_ring(mask)
    if regions is None:
        return None
    lesion, ring = regions
    out = [v for b in RGB_BANDS for v in _band_stats(reflectance[b], lesion, ring)]
    if spectral:
        out += _band_stats(reflectance["nir"], lesion, ring)
        out += _map_stats(melanin, lesion, ring) + _map_stats(hemoglobin, lesion, ring)
    return np.array(out)


@lru_cache
def _weights() -> dict:
    return json.loads(MODEL_PATH.read_text())


def probabilities(x: np.ndarray, w: dict) -> np.ndarray:
    z = (x - np.array(w["mean"])) / np.array(w["scale"])
    logits = np.array(w["coef"]) @ z + np.array(w["intercept"])
    p = np.exp(logits - logits.max())
    return p / p.sum()


def predict(
    reflectance: dict[str, np.ndarray],
    melanin: np.ndarray,
    hemoglobin: np.ndarray,
    mask: np.ndarray,
) -> dict | None:
    x = features(reflectance, melanin, hemoglobin, mask)
    if x is None:
        return None
    w = _weights()
    p = probabilities(x, w)
    best = int(np.argmax(p))
    held_out = w["metrics"]["spectral"]["held_out"]
    return {
        "model": w["version"],
        "pattern": None if p[best] < ABSTAIN_BELOW else w["classes"][best],
        "probabilities": {c: round(float(v), 4) for c, v in zip(w["classes"], p, strict=True)},
        "abstain_below": ABSTAIN_BELOW,
        "held_out_accuracy_when_answered": held_out["accuracy_when_answered"],
        "held_out_coverage": held_out["coverage"],
        "trained_on": "simulated phantoms only",
        "drivers": drivers(x, w, best),
    }


def drivers(x: np.ndarray, w: dict, cls: int, top: int = 3) -> list[dict]:
    """Features that pushed most toward (positive) or away from the suggested pattern, relative to
    the other patterns: (coefficient − mean coefficient) × standardised value. level: the value
    compared with the training average."""
    coef = np.array(w["coef"])
    z = (x - np.array(w["mean"])) / np.array(w["scale"])
    contribution = (coef[cls] - coef.mean(axis=0)) * z
    order = np.argsort(-np.abs(contribution))[:top]
    return [
        {
            "feature": FEATURE_LABELS[i],
            "level": "high" if z[i] > 0 else "low",
            "contribution": round(float(contribution[i]), 3),
        }
        for i in order
    ]
