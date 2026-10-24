"""Learned image-quality classifier: an advisory second opinion beside the rule-based QC.

Multinomial logistic regression over interpretable image statistics, trained on synthetic phantoms
by scripts/train_quality_model.py (scikit-learn, dev-only). Inference here is plain numpy over the
exported JSON weights, so production carries no pickle and no training library. It judges image
quality only, never the lesion.
"""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage

from app.processing.calibration import flat_field, patch_means, patch_uniformity
from app.processing.optics import BANDS, FULL_SCALE, REFERENCE_BAND, spacer_mask
from app.processing.types import DeviceProfile, FrameSet

MODEL_PATH = Path(__file__).resolve().parent / "models" / "quality_v1.json"
CLASSES = ("good", "blurry", "glare")
FEATURE_NAMES = (
    "log_laplacian_var_s1",
    "log_laplacian_var_s2",
    "log_highfreq_energy_ratio",
    "gradient_contrast",
    "log_saturated_fraction",
    "log_bright_fraction",
    "hotspot_ratio_green",
    "hotspot_ratio_red",
    "patch_ratio_error",
    "patch_cv",
    "log_laplacian_var_blue",
    "mean_reflectance_green",
)


def _log_lap_var(image: np.ndarray, sigma: float, valid: np.ndarray) -> float:
    norm = image / max(float(np.mean(image[valid])), 1e-6)
    lap = ndimage.laplace(ndimage.gaussian_filter(norm, sigma))
    return float(np.log10(lap[valid].var() + 1e-12))


def features(frame_set: FrameSet, profile: DeviceProfile) -> np.ndarray:
    """Image statistics in FEATURE_NAMES order (skin area only; the spacer ring is excluded)."""
    size = frame_set.dark.shape[0]
    valid = ~ndimage.binary_dilation(spacer_mask(size), iterations=6)
    refl = flat_field(frame_set, profile)
    green = refl[REFERENCE_BAND]

    centred = (green - green[valid].mean()) * valid
    power = np.abs(np.fft.fftshift(np.fft.fft2(centred))) ** 2
    yy, xx = np.mgrid[0:size, 0:size] - size / 2
    high = np.hypot(yy, xx) > size * 0.25
    hf_ratio = power[high].sum() / max(power.sum(), 1e-12)

    grad = np.hypot(ndimage.sobel(green, 0), ndimage.sobel(green, 1))
    raw = np.stack([frame_set.frames[b] for b in BANDS])
    saturated = (raw >= 0.98 * FULL_SCALE).any(axis=0)[valid].mean()
    bright = (raw >= 0.90 * FULL_SCALE).any(axis=0)[valid].mean()
    means = patch_means(green)
    ratio = means[[1, 2]].mean() / max(means[[0, 3]].mean(), 1e-6)
    red = refl["red"]
    return np.array(
        [
            _log_lap_var(green, 1.0, valid),
            _log_lap_var(green, 2.0, valid),
            np.log10(hf_ratio + 1e-12),
            float(grad[valid].mean() / max(green[valid].mean(), 1e-6)),
            np.log10(saturated + 1e-5),
            np.log10(bright + 1e-5),
            float(np.percentile(green[valid], 99.9) / max(np.median(green[valid]), 1e-6)),
            float(np.percentile(red[valid], 99.9) / max(np.median(red[valid]), 1e-6)),
            abs(ratio / (0.50 / 0.18) - 1),
            patch_uniformity(green),
            _log_lap_var(refl["blue"], 1.0, valid),
            float(green[valid].mean()),
        ]
    )


@lru_cache
def _weights() -> dict:
    return json.loads(MODEL_PATH.read_text())


def predict(frame_set: FrameSet, profile: DeviceProfile) -> dict:
    w = _weights()
    x = (features(frame_set, profile) - np.array(w["mean"])) / np.array(w["scale"])
    logits = np.array(w["coef"]) @ x + np.array(w["intercept"])
    p = np.exp(logits - logits.max())
    p /= p.sum()
    best = int(np.argmax(p))
    return {
        "model": w["version"],
        "label": w["classes"][best],
        "probabilities": {c: round(float(v), 4) for c, v in zip(w["classes"], p, strict=True)},
        "held_out_accuracy": w["metrics"]["held_out"]["accuracy"],
    }
