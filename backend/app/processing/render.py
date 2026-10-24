"""Display images. Fixed scales so views are comparable across visits."""

import numpy as np
from scipy import ndimage
from skimage.segmentation import find_boundaries

from app.processing.optics import spacer_mask

STANDARD_WHITE = 0.75  # reflectance mapped to full white in the standard view
MELANIN_RANGE = (0.0, 4.0)
HEMOGLOBIN_RANGE = (0.0, 1.6)
OUTLINE_RGB = (20, 184, 166)
SPACER_RGB = (203, 213, 225)


def standard_view(reflectance: dict[str, np.ndarray]) -> np.ndarray:
    """Pseudo-RGB from the red, green and blue bands (gamma 2.2)."""
    rgb = np.stack([reflectance["red"], reflectance["green"], reflectance["blue"]], axis=-1)
    rgb = np.clip(rgb / STANDARD_WHITE, 0, 1) ** (1 / 2.2)
    return (rgb * 255).astype(np.uint8)


def _ramp(values: np.ndarray, lo: float, hi: float, dark_rgb: tuple[int, int, int]) -> np.ndarray:
    t = np.clip((values - lo) / (hi - lo), 0, 1)[..., None]
    white = np.array([250, 250, 248], dtype=float)
    return (white * (1 - t) + np.array(dark_rgb, dtype=float) * t).astype(np.uint8)


def pigment_view(melanin: np.ndarray) -> np.ndarray:
    return _ramp(melanin, *MELANIN_RANGE, dark_rgb=(60, 30, 10))


def vascular_view(hemoglobin: np.ndarray) -> np.ndarray:
    return _ramp(hemoglobin, *HEMOGLOBIN_RANGE, dark_rgb=(160, 0, 30))


def with_outline(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = image.copy()
    out[find_boundaries(mask, mode="thick")] = OUTLINE_RGB
    return out


def mask_spacer(image: np.ndarray) -> np.ndarray:
    """Paint the spacer ring neutral: it is fixed to the device, so registration smears it."""
    out = image.copy()
    out[ndimage.binary_dilation(spacer_mask(image.shape[0]), iterations=3)] = SPACER_RGB
    return out
