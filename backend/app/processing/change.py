"""Change between two visits of the same lesion: register the first visit onto the current one by
its skin texture, then compare the outlines. Deterministic image processing, no learning."""

import numpy as np
from scipy import ndimage
from skimage.registration import phase_cross_correlation
from skimage.segmentation import find_boundaries

from app.processing.optics import MM_PER_PX, REFERENCE_BAND, spacer_mask
from app.processing.registration import _structure

GROWTH_RGB = np.array([245, 158, 11], dtype=float)
SHRINK_RGB = np.array([59, 130, 246], dtype=float)
FIRST_OUTLINE_RGB = (59, 130, 246)
NOW_OUTLINE_RGB = (20, 184, 166)


def change_since(
    first_reflectance: dict[str, np.ndarray],
    first_mask: np.ndarray,
    reflectance: dict[str, np.ndarray],
    mask: np.ndarray,
    standard: np.ndarray,
) -> tuple[np.ndarray, dict[str, float]]:
    """Change view (grey current image; amber = new area, blue = area no longer covered, blue
    line = first outline, teal line = current outline) and its numbers in mm²."""
    exclude = ndimage.binary_dilation(spacer_mask(mask.shape[0]), iterations=6)
    shift, _, _ = phase_cross_correlation(
        _structure(reflectance[REFERENCE_BAND], exclude),
        _structure(first_reflectance[REFERENCE_BAND], exclude),
        upsample_factor=10,
    )
    before = ndimage.shift(first_mask.astype(float), shift, order=0) > 0.5
    grown, shrunk = mask & ~before, before & ~mask
    out = standard.mean(axis=-1, keepdims=True).repeat(3, axis=-1) * 0.9
    out[grown] = out[grown] * 0.3 + GROWTH_RGB * 0.7
    out[shrunk] = out[shrunk] * 0.3 + SHRINK_RGB * 0.7
    out[find_boundaries(before, mode="thick")] = FIRST_OUTLINE_RGB
    out[find_boundaries(mask, mode="thick")] = NOW_OUTLINE_RGB
    px = MM_PER_PX**2
    return out.astype(np.uint8), {
        "new_area_mm2": round(float(grown.sum() * px), 2),
        "no_longer_covered_mm2": round(float(shrunk.sum() * px), 2),
        "overlap_fraction": round(float((mask & before).sum() / max(before.sum(), 1)), 3),
        "registration_shift_px": [round(float(shift[0]), 2), round(float(shift[1]), 2)],
    }
