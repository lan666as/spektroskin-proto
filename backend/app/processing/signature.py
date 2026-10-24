import numpy as np
from scipy import ndimage

from app.processing.optics import BANDS, WAVELENGTHS_NM, spacer_mask

RING_INNER_PX = 4  # gap so the soft lesion edge is not counted as skin
RING_OUTER_PX = 16


def spectral_signature(
    reflectance: dict[str, np.ndarray],
    melanin: np.ndarray,
    hemoglobin: np.ndarray,
    mask: np.ndarray,
) -> dict | None:
    """Mean calibrated reflectance per band inside the lesion vs a ring of surrounding skin.

    This is the measured spectral contrast the pigment and vascular views are built from.
    """
    valid = ~ndimage.binary_dilation(spacer_mask(mask.shape[0]), iterations=6)
    lesion = ndimage.binary_erosion(mask, iterations=2) & valid
    ring = (
        ndimage.binary_dilation(mask, iterations=RING_OUTER_PX)
        & ~ndimage.binary_dilation(mask, iterations=RING_INNER_PX)
        & valid
    )
    if lesion.sum() < 20 or ring.sum() < 20:
        return None
    return {
        "bands_nm": [WAVELENGTHS_NM[b] for b in BANDS],
        "lesion": [round(float(reflectance[b][lesion].mean()), 4) for b in BANDS],
        "skin": [round(float(reflectance[b][ring].mean()), 4) for b in BANDS],
        "melanin": {
            "lesion": round(float(melanin[lesion].mean()), 3),
            "skin": round(float(melanin[ring].mean()), 3),
        },
        "hemoglobin": {
            "lesion": round(float(hemoglobin[lesion].mean()), 3),
            "skin": round(float(hemoglobin[ring].mean()), 3),
        },
    }
