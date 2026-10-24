"""Published dermoscopy melanoma checklists, scored automatically from the pipeline's maps.

- ABCD rule of dermoscopy (Stolz et al. 1994; Nachbar et al., J Am Acad Dermatol 1994):
  TDS = 1.3·A + 0.1·B + 0.5·C + 0.5·D. Below 4.75 benign, 4.75–5.45 suspicious, above 5.45 highly
  suspicious for melanoma.
- BRAAFF checklist for acral lesions (Lallas et al., Br J Dermatol 2015): irregular blotch +1,
  parallel ridge pattern +3, asymmetry of structures +1, asymmetry of colours +1, parallel furrow
  pattern −1, fibrillar pattern −1; a score of 1 or more suggests acral melanoma.

The weights and thresholds are the published ones. The items are read automatically from simulated
images with thresholds set on simulated phantoms (the constants below), so the result is
decision support for the dermatologist, not a validated diagnosis and not a probability.
"""

import numpy as np
from scipy import ndimage
from skimage.measure import regionprops

# A dermoscopic "colour" counts when it covers at least this share of the lesion.
MIN_COLOUR_SHARE = 0.05
# Melanin excess over surrounding skin (map units) for light brown, dark brown and black.
LIGHT_BROWN, DARK_BROWN, BLACK = 0.2, 0.8, 1.6
RED_HEMOGLOBIN_EXCESS = 0.3
# An axis is asymmetric when the outline differs from its mirror image by this share of the area,
# or when mean pigment differs between the two halves by this relative amount.
SHAPE_ASYMMETRY = 0.08
COLOUR_ASYMMETRY = 0.15
# Border octant counts as an abrupt cut-off when the pigment drops this fast at the edge
# (fraction of the lesion's median excess per pixel).
ABRUPT_EDGE = 0.35
NETWORK_ENERGY = 0.08  # band-passed pigment texture relative to the excess: a network is present
DOT_FOCALITY = 1.4  # brightest blood spots vs typical lesion blood: dots or vessels present
BLOTCH_SHARE = 0.10  # dark structureless area share for an "irregular blotch"
BLOTCH_OFFSET = 0.25  # its centroid offset from the lesion centre, in lesion radii


def _aligned(mask: np.ndarray, field: np.ndarray, props) -> tuple[np.ndarray, np.ndarray]:
    size = mask.shape[0]
    cy, cx = props.centroid
    shift = (size / 2 - cy, size / 2 - cx)
    angle = -np.degrees(props.orientation)
    m = ndimage.rotate(
        ndimage.shift(mask.astype(float), shift, order=0), angle, reshape=False, order=0
    )
    f = ndimage.rotate(ndimage.shift(field, shift, order=1), angle, reshape=False, order=1)
    return m > 0.5, f


def _axis_asymmetry(mask: np.ndarray, excess: np.ndarray, props) -> tuple[list[bool], list[bool]]:
    """Per principal axis: is the outline asymmetric, and is the pigment asymmetric?"""
    m, f = _aligned(mask, excess, props)
    area = max(int(m.sum()), 1)
    mean = max(float(f[m].mean()), 1e-6)
    rows = np.arange(m.shape[0])[:, None] < m.shape[0] / 2
    cols = np.arange(m.shape[1])[None, :] < m.shape[1] / 2
    shape, colour = [], []
    for mirrored, half in ((m[::-1, :], rows), (m[:, ::-1], cols)):
        shape.append(float((m ^ mirrored).sum()) / (2 * area) > SHAPE_ASYMMETRY)
        a, b = f[m & half], f[m & ~half]
        uneven = (
            a.size and b.size and abs(float(a.mean()) - float(b.mean())) / mean > COLOUR_ASYMMETRY
        )
        colour.append(bool(uneven))
    return shape, colour


def _abrupt_octants(mask: np.ndarray, excess: np.ndarray, props) -> int:
    edge = mask & ~ndimage.binary_erosion(mask, iterations=1)
    gradient = np.hypot(*np.gradient(ndimage.gaussian_filter(excess, 1.0)))
    scale = max(float(np.median(excess[mask])), 1e-6)
    ys, xs = np.nonzero(edge)
    cy, cx = props.centroid
    octant = ((np.arctan2(ys - cy, xs - cx) + np.pi) / (2 * np.pi) * 8).astype(int) % 8
    count = 0
    for k in range(8):
        sel = octant == k
        if sel.any() and np.median(gradient[ys[sel], xs[sel]]) / scale > ABRUPT_EDGE:
            count += 1
    return count


def _colours(excess_m: np.ndarray, excess_h: np.ndarray, mask: np.ndarray) -> list[str]:
    inside_m, inside_h = excess_m[mask], excess_h[mask]
    shares = {
        "light brown": ((inside_m >= LIGHT_BROWN) & (inside_m < DARK_BROWN)).mean(),
        "dark brown": ((inside_m >= DARK_BROWN) & (inside_m < BLACK)).mean(),
        "black": (inside_m >= BLACK).mean(),
        "red": (inside_h >= RED_HEMOGLOBIN_EXCESS).mean(),
    }
    return [name for name, share in shares.items() if share >= MIN_COLOUR_SHARE]


def _structures(excess_m: np.ndarray, hemoglobin: np.ndarray, mask: np.ndarray) -> list[str]:
    inside = excess_m[mask]
    level = max(float(np.median(inside)), 1e-6)
    texture = ndimage.gaussian_filter(excess_m, 1.0) - ndimage.gaussian_filter(excess_m, 3.0)
    found = []
    if float(texture[mask].std()) / level > NETWORK_ENERGY:
        found.append("pigment network")
    else:
        found.append("structureless area")
    hb = hemoglobin[mask]
    if float(np.percentile(hb, 99) / max(np.median(hb), 1e-6)) > DOT_FOCALITY:
        found.append("dots / vessels")
    return found


def _blotch(excess_m: np.ndarray, mask: np.ndarray, props) -> bool:
    dark = mask & (excess_m >= BLACK)
    if dark.sum() < BLOTCH_SHARE * mask.sum():
        return False
    dy, dx = np.array(ndimage.center_of_mass(dark)) - np.array(props.centroid)
    radius = np.sqrt(mask.sum() / np.pi)
    return bool(np.hypot(dy, dx) / radius > BLOTCH_OFFSET)


def score(
    melanin: np.ndarray, hemoglobin: np.ndarray, mask: np.ndarray, acral_pattern: str | None
) -> dict | None:
    """Both checklists with their items; BRAAFF only means something on acral sites (the caller
    drops it elsewhere)."""
    if mask.sum() < 50:
        return None
    props = regionprops(mask.astype(np.uint8))[0]
    skin = ~ndimage.binary_dilation(mask, iterations=4)
    excess_m = melanin - float(np.median(melanin[skin]))
    excess_h = hemoglobin - float(np.median(hemoglobin[skin]))
    if float(np.median(excess_m[mask])) < LIGHT_BROWN:
        # Both rules apply to melanocytic (pigmented) lesions only; the first step of dermoscopy
        # sets the others, such as vascular lesions, aside.
        return {"applicable": False, "reason": "not pigmented (non-melanocytic pattern)"}
    shape_asym, colour_asym = _axis_asymmetry(mask, excess_m, props)
    a = sum(s or c for s, c in zip(shape_asym, colour_asym, strict=True))
    b = _abrupt_octants(mask, excess_m, props)
    colours = _colours(excess_m, excess_h, mask)
    structures = _structures(excess_m, hemoglobin, mask)
    c, d = max(len(colours), 1), max(len(structures), 1)
    tds = round(1.3 * a + 0.1 * b + 0.5 * c + 0.5 * d, 2)
    category = "benign" if tds < 4.75 else "suspicious" if tds <= 5.45 else "highly_suspicious"

    blotch = _blotch(excess_m, mask, props)
    items = {
        "irregular_blotch": 1 if blotch else 0,
        "ridge_pattern": 3 if acral_pattern == "ridge" else 0,
        "asymmetry_of_structures": 1 if any(shape_asym) else 0,
        "asymmetry_of_colours": 1 if any(colour_asym) else 0,
        "parallel_furrow_pattern": -1 if acral_pattern == "furrow" else 0,
        "fibrillar_pattern": 0,
    }
    total = sum(items.values())
    return {
        "applicable": True,
        "abcd": {
            "asymmetry_axes": a,
            "abrupt_border_segments": b,
            "colours": colours,
            "structures": structures,
            "tds": tds,
            "category": category,
        },
        "braaff": {
            "items": items,
            "not_assessed": ["fibrillar_pattern"],
            "score": total,
            "suspicious": total >= 1,
        },
    }
