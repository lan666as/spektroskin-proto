import numpy as np
from scipy import ndimage

from app.processing.optics import BANDS, K_HB, K_MEL, R0

# Columns: melanin, hemoglobin, band-independent offset (skin-line shading, residual geometry).
_DESIGN = np.stack([K_MEL, K_HB, np.ones_like(K_MEL)], axis=1)
_UNMIX = np.linalg.pinv(_DESIGN)


def unmix(reflectance: dict[str, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel least-squares unmixing of -ln(R_b / R0_b) over the four bands.

    Returns estimated (melanin, hemoglobin) maps in the model's arbitrary concentration units.
    """
    coeffs = _coefficients(reflectance)
    return coeffs[0].astype(np.float32), coeffs[1].astype(np.float32)


def shading(reflectance: dict[str, np.ndarray]) -> np.ndarray:
    """The band-independent term of the unmixing: skin-line and ridge shading."""
    return _coefficients(reflectance)[2].astype(np.float32)


def _coefficients(reflectance: dict[str, np.ndarray]) -> np.ndarray:
    absorbance = np.stack(
        [
            ndimage.gaussian_filter(-np.log(np.clip(reflectance[b], 1e-4, None) / R0[i]), 0.8)
            for i, b in enumerate(BANDS)
        ]
    )
    return np.tensordot(_UNMIX, absorbance, axes=1)
