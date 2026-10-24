import numpy as np
from scipy import ndimage
from skimage.registration import phase_cross_correlation

from app.processing.optics import BANDS, REFERENCE_BAND, spacer_mask


def _structure(reflectance: np.ndarray, exclude: np.ndarray) -> np.ndarray:
    """High-passed log reflectance; band-independent skin lines and lesion edges dominate it."""
    log_r = np.log(np.clip(reflectance, 1e-4, None))
    high = log_r - ndimage.gaussian_filter(log_r, 8)
    high[exclude] = 0.0
    return high


def register(
    reflectance: dict[str, np.ndarray],
) -> tuple[dict[str, np.ndarray], dict[str, tuple[float, float]]]:
    """Align every band to the reference (green) band by phase correlation.

    The spacer patches are fixed to the device, not the skin, so they are masked out of the
    estimate; only skin content drives the shift.
    """
    size = reflectance[REFERENCE_BAND].shape[0]
    exclude = ndimage.binary_dilation(spacer_mask(size), iterations=6)
    reference = _structure(reflectance[REFERENCE_BAND], exclude)
    aligned = {REFERENCE_BAND: reflectance[REFERENCE_BAND]}
    shifts: dict[str, tuple[float, float]] = {}
    for band in BANDS:
        if band == REFERENCE_BAND:
            continue
        shift, _, _ = phase_cross_correlation(
            reference, _structure(reflectance[band], exclude), upsample_factor=20
        )
        aligned[band] = ndimage.shift(reflectance[band], shift, order=1, mode="nearest")
        shifts[band] = (float(shift[0]), float(shift[1]))
    return aligned, shifts
