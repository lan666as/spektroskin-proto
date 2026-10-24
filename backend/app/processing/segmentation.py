import numpy as np
from scipy import ndimage
from skimage.filters import apply_hysteresis_threshold, threshold_otsu
from skimage.measure import label, regionprops

from app.processing.optics import MM_PER_PX, spacer_mask

# Hemoglobin contrast is weaker per unit than melanin in this model; weight it up so vascular
# lesions segment on the same score as pigmented ones.
HB_WEIGHT = 2.0
HYSTERESIS_LOW = 0.5
MIN_PIGMENT_EXCESS = 0.15


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


def measurements(mask: np.ndarray) -> dict[str, float] | None:
    """Longest diameter (maximum Feret) and width (minor axis of the fitted ellipse), in mm."""
    if not mask.any():
        return None
    props = regionprops(mask.astype(np.uint8))[0]
    return {
        "diameter_mm": round(float(props.feret_diameter_max) * MM_PER_PX, 2),
        "width_mm": round(float(props.axis_minor_length) * MM_PER_PX, 2),
    }


def morphology(mask: np.ndarray, melanin: np.ndarray, hemoglobin: np.ndarray) -> dict | None:
    """Dermoscopy-style shape and colour measurements of the outline (automated, no scoring).

    asymmetry: area that does not overlap its mirror image across the lesion's main axes, as a
    fraction of the lesion (0 = symmetric). border_irregularity: perimeter² / (4π·area), 1 for a
    circle. pigment_variation: coefficient of variation of melanin excess inside the outline (None
    when the lesion carries almost no extra melanin, where the ratio is meaningless).
    vessel_focality: how much the brightest blood spots exceed the lesion's typical level.
    """
    if mask.sum() < 50:
        return None
    props = regionprops(mask.astype(np.uint8))[0]
    size = mask.shape[0]
    cy, cx = props.centroid
    centred = ndimage.shift(mask.astype(float), (size / 2 - cy, size / 2 - cx), order=0)
    aligned = ndimage.rotate(centred, -np.degrees(props.orientation), reshape=False, order=0) > 0.5
    area = max(int(aligned.sum()), 1)
    asymmetry = max(
        float((aligned ^ aligned[::-1, :]).sum()) / (2 * area),
        float((aligned ^ aligned[:, ::-1]).sum()) / (2 * area),
    )
    valid = ~ndimage.binary_dilation(spacer_mask(size), iterations=4)
    excess = melanin - np.median(melanin[valid & ~mask])
    inside = excess[mask]
    hb = hemoglobin[mask]
    return {
        "asymmetry": round(asymmetry, 3),
        "border_irregularity": round(float(props.perimeter**2 / (4 * np.pi * props.area)), 3),
        "pigment_variation": round(float(inside.std() / inside.mean()), 3)
        if inside.mean() > MIN_PIGMENT_EXCESS
        else None,
        "vessel_focality": round(float(np.percentile(hb, 99) / max(np.median(hb), 1e-6)), 3),
    }
