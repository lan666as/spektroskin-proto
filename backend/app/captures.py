"""Capture ingest: decode frames → run processing → store objects → persist the record."""

import uuid
from datetime import datetime

from sqlalchemy import select

from app import audit
from app.attention import ACRAL_SITES
from app.devices import KNOWN_DEVICES, load_profile
from app.models import Capture, Lesion, User
from app.processing import FrameSet, run
from app.processing.change import change_since
from app.processing.frameio import decode_png16, encode_png16, encode_png_rgb
from app.processing.optics import BANDS, FRAME_SIZE
from app.processing.pipeline import measure
from app.processing.render import mask_spacer, standard_view
from app.storage import ObjectNotFound, Storage, raw_frame_key, view_key

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
    change = _change_since_first(session, storage, lesion, captured_at, result, profile)

    # Keys are derived from the capture id, so a retried upload overwrites identical objects.
    for name in FRAME_NAMES:
        storage.put(raw_frame_key(capture_id, name), encode_png16(decoded[name]))
    views = dict(result.views)
    if change is not None:
        views["change"] = change[0]
    for name, image in views.items():
        storage.put(view_key(capture_id, name), encode_png_rgb(image))

    summary = result.summary()
    if lesion.body_site not in ACRAL_SITES:
        # The acral pattern read only means something on palms, soles and nails.
        summary["acral_model"] = None
    if change is not None:
        summary["views"] = sorted(views)
        summary["change_since_first"] = change[1]
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


def _change_since_first(session, storage: Storage, lesion: Lesion, captured_at, result, profile):
    """Change view and numbers against the lesion's first processed visit, or None (first visit,
    failed QC, or the first visit's frames are missing)."""
    if result.mask is None:
        return None
    first = session.scalar(
        select(Capture)
        .where(
            Capture.lesion_id == lesion.id,
            Capture.status == "processed",
            Capture.captured_at < captured_at,
        )
        .order_by(Capture.captured_at)
        .limit(1)
    )
    if first is None:
        return None
    shape = (FRAME_SIZE, FRAME_SIZE)
    try:
        raw = {n: decode_png16(storage.get(raw_frame_key(first.id, n)), shape) for n in FRAME_NAMES}
    except ObjectNotFound:
        return None
    before = measure(FrameSet(frames={b: raw[b] for b in BANDS}, dark=raw["dark"]), profile)
    if before.mask is None:
        return None
    image, stats = change_since(
        before.reflectance,
        before.mask,
        result.reflectance,
        result.mask,
        standard_view(result.reflectance),
    )
    return mask_spacer(image), {**stats, "first_capture_id": str(first.id)}


NEWER_OUTPUTS = ("quality_model", "triage_model", "acral_model", "morphology")
AREA_TOLERANCE_MM2 = 0.01


def lacks_newer_outputs(capture: Capture) -> bool:
    return capture.status == "processed" and "triage_model" not in (capture.result or {})


def add_newer_outputs(storage: Storage, capture: Capture, *, apply: bool) -> str:
    """Re-run the deterministic pipeline on the stored raw frames and add only the outputs the
    capture lacks (AI opinions, morphology, missing views). Stored measurements are never changed:
    if the area would differ, nothing is written. Returns "current", "skipped" or "updated" (or
    "would_update" without apply). The caller commits."""
    if not lacks_newer_outputs(capture):
        return "current"
    shape = (FRAME_SIZE, FRAME_SIZE)
    frames = {
        n: decode_png16(storage.get(raw_frame_key(capture.id, n)), shape) for n in FRAME_NAMES
    }
    result = run(
        FrameSet(frames={b: frames[b] for b in BANDS}, dark=frames["dark"]),
        load_profile(capture.device_id),
    )
    summary = result.summary()
    if abs((summary["area_mm2"] or 0) - (capture.area_mm2 or 0)) > AREA_TOLERANCE_MM2:
        return "skipped"
    if not apply:
        return "would_update"
    if capture.lesion.body_site not in ACRAL_SITES:
        summary["acral_model"] = None
    new_views = sorted(set(result.views) - set(capture.result.get("views", [])))
    for name in new_views:
        storage.put(view_key(capture.id, name), encode_png_rgb(result.views[name]))
    capture.result = {
        **capture.result,
        **{k: summary[k] for k in NEWER_OUTPUTS if k not in capture.result},
        "views": sorted(set(capture.result.get("views", [])) | set(new_views)),
    }
    return "updated"
