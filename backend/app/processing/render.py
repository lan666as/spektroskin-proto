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


PIGMENT_EVIDENCE_RGB = np.array([245, 158, 11], dtype=float)
BLOOD_EVIDENCE_RGB = np.array([220, 38, 38], dtype=float)
VESSEL_SPOT_RGB = (236, 72, 153)
# Excess over surrounding skin that saturates the overlay (map units).
PIGMENT_EVIDENCE_FULL = 2.0
BLOOD_EVIDENCE_FULL = 0.8


def evidence_view(
    standard: np.ndarray, melanin: np.ndarray, hemoglobin: np.ndarray, mask: np.ndarray
) -> np.ndarray:
    """Where the pattern evidence sits: amber = melanin above the surrounding skin, red = blood
    above it, pink dots = the brightest blood spots. Drawn on a grey copy of the standard view."""
    skin = ~mask & ~ndimage.binary_dilation(spacer_mask(mask.shape[0]), iterations=4)
    pigment = np.clip((melanin - np.median(melanin[skin])) / PIGMENT_EVIDENCE_FULL, 0, 1)
    blood = np.clip((hemoglobin - np.median(hemoglobin[skin])) / BLOOD_EVIDENCE_FULL, 0, 1)
    region = ndimage.binary_dilation(mask, iterations=3)
    pigment, blood = pigment * region, blood * region
    grey = standard.mean(axis=-1, keepdims=True).repeat(3, axis=-1) * 0.85
    share = (blood / np.maximum(pigment + blood, 1e-6))[..., None]
    colour = PIGMENT_EVIDENCE_RGB * (1 - share) + BLOOD_EVIDENCE_RGB * share
    alpha = (0.85 * np.maximum(pigment, blood))[..., None]
    out = grey * (1 - alpha) + colour * alpha
    if mask.any():
        spots = mask & (hemoglobin > np.percentile(hemoglobin[mask], 98)) & (blood > 0.3)
        out[ndimage.binary_dilation(spots, iterations=1)] = VESSEL_SPOT_RGB
    return out.astype(np.uint8)


def with_outline(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = image.copy()
    out[find_boundaries(mask, mode="thick")] = OUTLINE_RGB
    return out


def mask_spacer(image: np.ndarray) -> np.ndarray:
    """Paint the spacer ring neutral: it is fixed to the device, so registration smears it."""
    out = image.copy()
    out[ndimage.binary_dilation(spacer_mask(image.shape[0]), iterations=3)] = SPACER_RGB
    return out
