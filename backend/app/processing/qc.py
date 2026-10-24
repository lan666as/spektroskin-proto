"""Image quality checks on a raw capture (classical, no ML)."""

import numpy as np
from scipy import ndimage

from app.processing.calibration import flat_field, patch_means, patch_uniformity
from app.processing.optics import (
    BANDS,
    FULL_SCALE,
    REFERENCE_BAND,
    REFERENCE_PATCHES,
    spacer_mask,
)
from app.processing.types import DeviceProfile, FrameSet, QCResult

# Thresholds set from the simulated clean vs blur/glare phantoms (see tests/test_processing.py).
MIN_SHARPNESS = 5.0e-5
MAX_SATURATED_FRACTION = 0.002
PATCH_RATIO_EXPECTED = 0.50 / 0.18
PATCH_RATIO_TOLERANCE = 0.20
MAX_PATCH_CV = 0.10
# Pixel noise inside the uniform gray patches; the simulated module sits near 0.007. Added after
# docs/evidence/ai_evaluation.md showed heavy noise passed every other check.
MAX_PATCH_NOISE = 0.02
SATURATION_LEVEL = 0.98 * FULL_SCALE


def sharpness(reflectance: np.ndarray, exclude: np.ndarray) -> float:
    """Variance of the Laplacian of the lightly denoised, mean-normalised reference band."""
    norm = reflectance / max(float(np.mean(reflectance[~exclude])), 1e-6)
    lap = ndimage.laplace(ndimage.gaussian_filter(norm, 1.0))
    return float(lap[~exclude].var())


def patch_noise(reflectance: np.ndarray) -> float:
    """Median over the gray patches of high-passed pixel noise relative to the patch level."""
    values = []
    for patch in REFERENCE_PATCHES:
        inner = reflectance[patch.rows, patch.cols][3:-3, 3:-3]
        residual = inner - ndimage.gaussian_filter(inner, 2.0)
        values.append(residual.std() / max(float(inner.mean()), 1e-6))
    return float(np.median(values))


def run_qc(frame_set: FrameSet, profile: DeviceProfile) -> QCResult:
    exclude = ndimage.binary_dilation(spacer_mask(frame_set.dark.shape[0]), iterations=6)
    reflectance = flat_field(frame_set, profile)

    saturated = np.zeros_like(frame_set.dark, dtype=bool)
    for band in BANDS:
        saturated |= frame_set.frames[band] >= SATURATION_LEVEL
    saturated_fraction = float(saturated[~exclude].mean())

    sharp = sharpness(reflectance[REFERENCE_BAND], exclude)

    means = patch_means(reflectance[REFERENCE_BAND])
    ratio = float(means[[1, 2]].mean() / max(means[[0, 3]].mean(), 1e-6))
    cv = patch_uniformity(reflectance[REFERENCE_BAND])
    ratio_ok = abs(ratio / PATCH_RATIO_EXPECTED - 1) <= PATCH_RATIO_TOLERANCE
    patches_ok = ratio_ok and cv <= MAX_PATCH_CV
    noise = patch_noise(reflectance[REFERENCE_BAND])

    checks = {
        "sharp": sharp >= MIN_SHARPNESS,
        "no_glare": saturated_fraction <= MAX_SATURATED_FRACTION,
        "reference_patches": patches_ok,
        "low_noise": noise <= MAX_PATCH_NOISE,
    }
    guidance = []
    if not checks["sharp"]:
        guidance.append(
            "Image is not sharp. Hold the spacer flat against the skin, keep still, and retake."
        )
    if not checks["no_glare"]:
        guidance.append(
            f"Glare detected ({saturated_fraction:.1%} of pixels saturated). Press the spacer "
            "evenly to close air gaps, and retake."
        )
    if not checks["reference_patches"]:
        guidance.append(
            "Reference patches not found. Check that the spacer ring is clean and fully seated, "
            "and retake."
        )
    if not checks["low_noise"]:
        guidance.append(
            "Image is noisy. Shield the module from bright light, let it warm up for a few "
            "seconds, and retake."
        )
    return QCResult(
        passed=all(checks.values()),
        metrics={
            "sharpness": round(sharp, 7),
            "saturated_fraction": round(saturated_fraction, 5),
            "patch_ratio": round(ratio, 3),
            "patch_cv": round(cv, 4),
            "patch_noise": round(noise, 4),
        },
        checks=checks,
        guidance=guidance,
    )
