"""Capture ingest: decode frames → run processing → store objects → persist the record."""

import uuid
from datetime import datetime

from app import audit
from app.devices import KNOWN_DEVICES, load_profile
from app.models import Capture, Lesion, User
from app.processing import FrameSet, run
from app.processing.frameio import decode_png16, encode_png16, encode_png_rgb
from app.processing.optics import BANDS, FRAME_SIZE
from app.storage import Storage, raw_frame_key, view_key

FRAME_NAMES = (*BANDS, "dark")


def ingest(
    session,
    storage: Storage,
    *,
    user: User,
    capture_id: uuid.UUID,
    lesion: Lesion,
    captured_at: datetime,
    device_id: str,
    phantom_id: str | None,
    frames: dict[str, bytes],
) -> Capture:
    """Process and persist one capture in the caller's transaction (caller commits).

    Raises FrameDecodeError for unreadable frames and UnknownDevice for unregistered devices.
    """
    profile = load_profile(device_id)
    shape = (FRAME_SIZE, FRAME_SIZE)
    decoded = {name: decode_png16(frames[name], shape) for name in FRAME_NAMES}
    frame_set = FrameSet(
        frames={b: decoded[b] for b in BANDS},
        dark=decoded["dark"],
        meta={"device_id": device_id, "phantom_id": phantom_id},
    )
    result = run(frame_set, profile)

    # Keys are derived from the capture id, so a retried upload overwrites identical objects.
    for name in FRAME_NAMES:
        storage.put(raw_frame_key(capture_id, name), encode_png16(decoded[name]))
    for name, image in result.views.items():
        storage.put(view_key(capture_id, name), encode_png_rgb(image))

    summary = result.summary()
    capture = Capture(
        id=capture_id,
        lesion_id=lesion.id,
        captured_at=captured_at,
        device_type=KNOWN_DEVICES[device_id],
        device_id=device_id,
        phantom_id=phantom_id,
        status="processed" if result.qc.passed else "qc_failed",
        qc=summary["qc"],
        result=summary,
        area_mm2=summary["area_mm2"],
        created_by=user.id,
    )
    session.add(capture)
    audit.record(session, user, "create", "capture", capture_id)
    return capture
