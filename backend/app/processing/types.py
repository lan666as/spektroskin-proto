from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass(frozen=True)
class FrameSet:
    """Raw frames from one capture: one uint16 image per band plus a dark frame (LEDs off)."""

    frames: dict[str, np.ndarray]
    dark: np.ndarray
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceProfile:
    """One-time factory calibration of a capture device."""

    device_id: str
    flat: dict[str, np.ndarray]  # per band, white target at WHITE_REFLECTANCE, raw counts
    flat_dark: np.ndarray


@dataclass(frozen=True)
class QCResult:
    passed: bool
    metrics: dict[str, float]
    checks: dict[str, bool]
    guidance: list[str]


@dataclass(frozen=True)
class ProcessingResult:
    qc: QCResult
    # Display images (uint8 RGB). Always has "standard"; "pigment" and "vascular" only if QC passed.
    views: dict[str, np.ndarray]
    melanin: np.ndarray | None = None
    hemoglobin: np.ndarray | None = None
    mask: np.ndarray | None = None
    area_mm2: float | None = None
    signature: dict[str, Any] | None = None
    measurements: dict[str, float] | None = None
    morphology: dict[str, float] | None = None
    quality_model: dict[str, Any] | None = None
    triage_model: dict[str, Any] | None = None
    acral_model: dict[str, Any] | None = None
    reflectance: dict[str, np.ndarray] | None = None  # registered, calibrated bands
    shifts_px: dict[str, tuple[float, float]] = field(default_factory=dict)
    gain_correction: dict[str, float] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        """JSON-serializable result stored with the capture."""
        return {
            "qc": {
                "passed": self.qc.passed,
                "metrics": self.qc.metrics,
                "checks": self.qc.checks,
                "guidance": self.qc.guidance,
            },
            "area_mm2": None if self.area_mm2 is None else round(self.area_mm2, 2),
            "registration_shift_px": {
                b: [round(dy, 2), round(dx, 2)] for b, (dy, dx) in self.shifts_px.items()
            },
            "gain_correction": {b: round(g, 4) for b, g in self.gain_correction.items()},
            "views": sorted(self.views),
            "signature": self.signature,
            "measurements": self.measurements,
            "morphology": self.morphology,
            "quality_model": self.quality_model,
            "triage_model": self.triage_model,
            "acral_model": self.acral_model,
        }
