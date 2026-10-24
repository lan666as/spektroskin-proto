import numpy as np

from app.processing.optics import BANDS, REFERENCE_PATCHES, WHITE_REFLECTANCE
from app.processing.types import DeviceProfile, FrameSet


def flat_field(frame_set: FrameSet, profile: DeviceProfile) -> dict[str, np.ndarray]:
    """Dark subtraction and flat-field correction: raw counts → reflectance (before drift fix)."""
    dark = frame_set.dark.astype(np.float64)
    flat_dark = profile.flat_dark.astype(np.float64)
    out = {}
    for band in BANDS:
        signal = frame_set.frames[band].astype(np.float64) - dark
        white = np.maximum(profile.flat[band].astype(np.float64) - flat_dark, 1.0)
        out[band] = signal / white * WHITE_REFLECTANCE
    return out


def patch_means(reflectance: np.ndarray) -> np.ndarray:
    return np.array([reflectance[p.rows, p.cols].mean() for p in REFERENCE_PATCHES])


def patch_uniformity(reflectance: np.ndarray) -> float:
    """Worst coefficient of variation across patches; glare or a missing spacer raises it."""
    return max(
        float(reflectance[p.rows, p.cols].std() / max(reflectance[p.rows, p.cols].mean(), 1e-6))
        for p in REFERENCE_PATCHES
    )


KNOWN_PATCH_REFLECTANCE = np.array([p.reflectance for p in REFERENCE_PATCHES])


def gain_drift(reflectance: np.ndarray) -> float:
    """Least-squares scale between measured and known patch reflectance (fit through origin)."""
    measured = patch_means(reflectance)
    known = KNOWN_PATCH_REFLECTANCE
    return float(np.dot(measured, known) / np.dot(known, known))


def calibrate(
    frame_set: FrameSet, profile: DeviceProfile
) -> tuple[dict[str, np.ndarray], dict[str, float]]:
    """Reflectance per band in sensor coordinates, corrected for per-capture LED gain drift."""
    reflectance = flat_field(frame_set, profile)
    corrections = {}
    for band in BANDS:
        drift = gain_drift(reflectance[band])
        corrections[band] = drift
        reflectance[band] = reflectance[band] / drift
    return reflectance, corrections
