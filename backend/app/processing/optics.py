"""Simplified, illustrative optical model shared by the processing pipeline and the simulator.

Real skin involves scattering that this Beer-Lambert-style model ignores (CLAUDE.md §5). The
coefficients are illustrative, not fitted to measured skin optics.
"""

from dataclasses import dataclass

import numpy as np

BANDS: tuple[str, ...] = ("blue", "green", "red", "nir")
WAVELENGTHS_NM: dict[str, int] = {"blue": 470, "green": 550, "red": 660, "nir": 850}
REFERENCE_BAND = "green"

K_MEL = np.array([1.0, 0.7, 0.4, 0.2])
K_HB = np.array([0.6, 1.0, 0.1, 0.05])
# Reflectance of melanin- and blood-free tissue per band.
R0 = np.array([0.55, 0.60, 0.70, 0.75])

FRAME_SIZE = 256
MM_PER_PX = 0.04  # fixed by the contact spacer: 256 px = 10.24 mm field
FULL_SCALE = 65535
WHITE_REFLECTANCE = 0.99  # factory flat-field target


@dataclass(frozen=True)
class ReferencePatch:
    """Gray patch printed on the spacer ring; fixed in sensor coordinates."""

    name: str
    reflectance: float
    rows: slice
    cols: slice


_P = 22  # patch side, px
_M = 4  # margin from the frame edge, px
REFERENCE_PATCHES: tuple[ReferencePatch, ...] = (
    ReferencePatch("gray18_tl", 0.18, slice(_M, _M + _P), slice(_M, _M + _P)),
    ReferencePatch("gray50_tr", 0.50, slice(_M, _M + _P), slice(-_M - _P, -_M)),
    ReferencePatch("gray50_bl", 0.50, slice(-_M - _P, -_M), slice(_M, _M + _P)),
    ReferencePatch("gray18_br", 0.18, slice(-_M - _P, -_M), slice(-_M - _P, -_M)),
)


def spacer_mask(size: int = FRAME_SIZE) -> np.ndarray:
    """True where the spacer ring (reference patches plus a guard band) covers the skin."""
    mask = np.zeros((size, size), dtype=bool)
    guard = 4
    for p in REFERENCE_PATCHES:
        r = np.arange(size)[p.rows]
        c = np.arange(size)[p.cols]
        mask[
            max(r[0] - guard, 0) : min(r[-1] + guard + 1, size),
            max(c[0] - guard, 0) : min(c[-1] + guard + 1, size),
        ] = True
    return mask
