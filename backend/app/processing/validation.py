"""Compare recovered maps with simulator ground truth. Validates processing math on simulated data
only; says nothing about clinical performance."""

import numpy as np
from scipy import ndimage

from app.processing.optics import spacer_mask


def _valid(shape: tuple[int, int]) -> np.ndarray:
    v = ~ndimage.binary_dilation(spacer_mask(shape[0]), iterations=6)
    v[:8, :] = v[-8:, :] = v[:, :8] = v[:, -8:] = False  # registration edge fill
    return v


def compare(
    melanin: np.ndarray,
    hemoglobin: np.ndarray,
    mask: np.ndarray,
    true_melanin: np.ndarray,
    true_hemoglobin: np.ndarray,
    true_mask: np.ndarray,
) -> dict[str, float]:
    v = _valid(melanin.shape)
    inter = np.logical_and(mask, true_mask).sum()
    true_area = float(true_mask.sum())
    return {
        "melanin_r": float(np.corrcoef(melanin[v], true_melanin[v])[0, 1]),
        "melanin_rmse": float(np.sqrt(np.mean((melanin[v] - true_melanin[v]) ** 2))),
        "hemoglobin_r": float(np.corrcoef(hemoglobin[v], true_hemoglobin[v])[0, 1]),
        "hemoglobin_rmse": float(np.sqrt(np.mean((hemoglobin[v] - true_hemoglobin[v]) ** 2))),
        "mask_dice": float(2 * inter / (mask.sum() + true_mask.sum())),
        "area_error_pct": float(100 * (mask.sum() - true_area) / true_area),
    }
