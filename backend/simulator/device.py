"""Virtual optical module: renders raw frames from ground-truth phantoms.

Raw frame per band: I_b = drift_b * gain_b * illum_b(x, y) * R_b + ambient + offset + noise,
with R_b = R0_b * exp(-(k_mel_b * m + k_hb_b * h)) * shading (CLAUDE.md §5).
"""

import numpy as np
from scipy import ndimage

from app.processing.optics import (
    BANDS,
    FRAME_SIZE,
    FULL_SCALE,
    K_HB,
    K_MEL,
    R0,
    REFERENCE_BAND,
    REFERENCE_PATCHES,
    WHITE_REFLECTANCE,
)
from app.processing.types import DeviceProfile, FrameSet
from simulator.phantoms import GroundTruth, PhantomSpec, seed_for

DEVICE_ID = "virtual-001"
GAIN = {"blue": 0.80, "green": 0.95, "red": 0.90, "nir": 0.70}
SENSOR_OFFSET = 400.0
AMBIENT = 600.0
READ_NOISE = 12.0
FACTORY_AVERAGED_FRAMES = 32


def _illumination(band_index: int, size: int = FRAME_SIZE) -> np.ndarray:
    """LED ring vignetting with a slight per-band off-centre tilt."""
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    cy = size / 2 + 6 * np.sin(band_index * 1.7)
    cx = size / 2 + 6 * np.cos(band_index * 1.7)
    r2 = ((yy - cy) ** 2 + (xx - cx) ** 2) / (size / 2) ** 2
    return 1.0 - 0.35 * r2 / 2


def _noise(rng: np.random.Generator, signal: np.ndarray, frames: int = 1) -> np.ndarray:
    sigma = np.sqrt(np.maximum(signal, 0) * 0.5 + READ_NOISE**2) / np.sqrt(frames)
    return rng.standard_normal(signal.shape) * sigma


def _to_counts(x: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(x), 0, FULL_SCALE).astype(np.uint16)


def factory_profile() -> DeviceProfile:
    rng = np.random.default_rng(seed_for(DEVICE_ID))
    flat = {}
    for i, band in enumerate(BANDS):
        signal = GAIN[band] * _illumination(i) * WHITE_REFLECTANCE * FULL_SCALE + SENSOR_OFFSET
        flat[band] = _to_counts(signal + _noise(rng, signal, FACTORY_AVERAGED_FRAMES))
    dark_signal = np.full((FRAME_SIZE, FRAME_SIZE), SENSOR_OFFSET)
    flat_dark = _to_counts(dark_signal + _noise(rng, dark_signal, FACTORY_AVERAGED_FRAMES))
    return DeviceProfile(device_id=DEVICE_ID, flat=flat, flat_dark=flat_dark)


def skin_reflectance(gt: GroundTruth) -> np.ndarray:
    """(bands, H, W) reflectance of the skin before device effects."""
    absorb = K_MEL[:, None, None] * gt.melanin + K_HB[:, None, None] * gt.hemoglobin
    return R0[:, None, None] * np.exp(-absorb) * gt.shading


def capture(
    spec: PhantomSpec,
    gt: GroundTruth,
    repeat: int | None = None,
    blur_sigma: float = 3.5,
    glare_amplitude: float = 2.5,
    glare_radius: float = 16.0,
    noise_scale: float = 1.0,
) -> FrameSet:
    """Render one capture. `repeat` selects an independent draw of noise, gain drift and hand
    motion for the same phantom (None = the canonical capture bundled in the app). The blur and
    glare parameters set the severity of those bad-capture variants; noise_scale multiplies sensor
    noise (stress tests)."""
    suffix = ":capture" if repeat is None else f":capture:{repeat}"
    rng = np.random.default_rng(seed_for(spec.id + suffix))
    skin = skin_reflectance(gt)

    if spec.variant == "blur":
        skin = np.stack([ndimage.gaussian_filter(b, blur_sigma) for b in skin])
    if spec.variant == "glare":
        yy, xx = np.mgrid[0:FRAME_SIZE, 0:FRAME_SIZE].astype(float)
        cy, cx = rng.uniform(90, 160, size=2)
        r2 = (yy - cy) ** 2 + (xx - cx) ** 2
        hotspot = glare_amplitude * np.exp(-r2 / (2 * glare_radius**2))
        speckle = (rng.random((FRAME_SIZE, FRAME_SIZE)) > 0.996) * 0.8 * glare_amplitude
        skin = skin + hotspot + ndimage.gaussian_filter(speckle, 0.8)

    frames: dict[str, np.ndarray] = {}
    shifts: dict[str, list[float]] = {}
    for i, band in enumerate(BANDS):
        scene = skin[i]
        if band != REFERENCE_BAND:
            shift = rng.uniform(-3.0, 3.0, size=2)
            scene = ndimage.shift(scene, shift, order=3, mode="nearest")
            shifts[band] = [float(shift[0]), float(shift[1])]
        scene = scene.copy()
        for patch in REFERENCE_PATCHES:  # fixed to the spacer, so it does not move with the skin
            scene[patch.rows, patch.cols] = patch.reflectance
        drift = rng.uniform(0.94, 1.06)
        signal = drift * GAIN[band] * _illumination(i) * scene * FULL_SCALE
        signal = signal + AMBIENT + SENSOR_OFFSET
        frames[band] = _to_counts(signal + noise_scale * _noise(rng, signal))
    dark_signal = np.full((FRAME_SIZE, FRAME_SIZE), AMBIENT + SENSOR_OFFSET)
    dark = _to_counts(dark_signal + noise_scale * _noise(rng, dark_signal))

    meta = {
        "phantom_id": spec.id,
        "device_id": DEVICE_ID,
        "device_type": "virtual",
        "bands": list(BANDS),
        "wavelengths_nm": {"blue": 470, "green": 550, "red": 660, "nir": 850},
        "simulated": True,
        "description": spec.description,
        "lesion": spec.lesion,
        "tone": spec.tone,
        "fitzpatrick": spec.fitzpatrick,
        "acral": spec.acral,
        "variant": spec.variant,
        "true_shift_px": shifts,
    }
    return FrameSet(frames=frames, dark=dark, meta=meta)
