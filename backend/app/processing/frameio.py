"""16-bit PNG encoding for raw frames and 8-bit PNG for display views."""

import io

import numpy as np
from PIL import Image


class FrameDecodeError(ValueError):
    pass


def encode_png16(frame: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(frame, dtype=np.uint16)).save(buf, format="PNG")
    return buf.getvalue()


def decode_png16(data: bytes, expected_shape: tuple[int, int] | None = None) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format != "PNG" or img.mode not in ("I;16", "I;16B", "I", "L"):
                raise FrameDecodeError(f"expected a grayscale PNG, got {img.format} {img.mode}")
            arr = np.array(img)
    except (OSError, SyntaxError) as exc:
        raise FrameDecodeError("not a readable PNG") from exc
    if arr.dtype == np.uint8:
        arr = arr.astype(np.uint16) * 257
    arr = arr.astype(np.uint16)
    if expected_shape is not None and arr.shape != expected_shape:
        raise FrameDecodeError(f"expected shape {expected_shape}, got {arr.shape}")
    return arr


def encode_png_rgb(image: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(image, dtype=np.uint8)).save(buf, format="PNG")
    return buf.getvalue()
