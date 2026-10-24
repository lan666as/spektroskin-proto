"""Registered capture devices and their factory calibration profiles."""

from functools import lru_cache

from app.config import get_settings
from app.processing.frameio import decode_png16
from app.processing.optics import BANDS, FRAME_SIZE
from app.processing.types import DeviceProfile

KNOWN_DEVICES = {"virtual-001": "virtual"}


class UnknownDevice(LookupError):
    pass


@lru_cache
def load_profile(device_id: str) -> DeviceProfile:
    if device_id not in KNOWN_DEVICES:
        raise UnknownDevice(device_id)
    root = get_settings().simulator_dir / "device_profile"
    shape = (FRAME_SIZE, FRAME_SIZE)
    return DeviceProfile(
        device_id=device_id,
        flat={b: decode_png16((root / f"{b}.png").read_bytes(), shape) for b in BANDS},
        flat_dark=decode_png16((root / "dark.png").read_bytes(), shape),
    )
