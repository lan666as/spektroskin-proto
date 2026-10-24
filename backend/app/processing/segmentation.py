import numpy as np
from scipy import ndimage
from skimage.filters import apply_hysteresis_threshold, threshold_otsu
from skimage.measure import label

from app.processing.optics import MM_PER_PX, spacer_mask

# Hemoglobin contrast is weaker per unit than melanin in this model; weight it up so vascular
# lesions segment on the same score as pigmented ones.
HB_WEIGHT = 2.0
HYSTERESIS_LOW = 0.5


def segment(melanin: np.ndarray, hemoglobin: np.ndarray) -> tuple[np.ndarray, float]:
    """Otsu threshold on the combined chromophore excess, grown by hysteresis down to half the
    Otsu level so a lighter lesion rim is kept → largest connected lesion mask, mm²."""
    valid = ~ndimage.binary_dilation(spacer_mask(melanin.shape[0]), iterations=4)
    excess_m = melanin - np.median(melanin[valid])
    excess_h = hemoglobin - np.median(hemoglobin[valid])
    score = ndimage.gaussian_filter(np.maximum(excess_m, HB_WEIGHT * excess_h), 2.0)

    otsu = threshold_otsu(score[valid])
    mask = apply_hysteresis_threshold(score, HYSTERESIS_LOW * otsu, otsu) & valid
    mask = ndimage.binary_opening(mask, iterations=2)
    labels = label(mask)
    if labels.max() == 0:
        return np.zeros_like(mask), 0.0
    largest = np.argmax(np.bincount(labels.ravel())[1:]) + 1
    mask = ndimage.binary_fill_holes(labels == largest)
    return mask, float(mask.sum() * MM_PER_PX**2)
