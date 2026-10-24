"""Compare a capture's recovered maps with the simulator's ground truth.

Validates the processing math on simulated phantoms only; says nothing about clinical performance.
"""

import re
import uuid
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import audit
from app.auth import CurrentUser, authorize
from app.captures import FRAME_NAMES
from app.config import get_settings
from app.db import get_session
from app.devices import load_profile
from app.models import Capture
from app.processing import FrameSet, run
from app.processing.frameio import decode_png16
from app.processing.optics import BANDS, FRAME_SIZE
from app.processing.validation import compare
from app.schemas import ValidationOut
from app.storage import ObjectNotFound, get_storage, raw_frame_key
from simulator.lesions import spec_from_id
from simulator.phantoms import ground_truth

router = APIRouter(prefix="/validation", tags=["validation"])

# phantom_id arrives from the client at upload time: only ids of this shape may name a file.
_PHANTOM_ID = re.compile(r"^[a-z0-9_-]{1,64}$")
SCOPE = (
    "Compares recovered maps with the known ground truth of a synthetic phantom. Validates the "
    "processing math on simulated data only; it is not clinical validation."
)


def _ground_truth(phantom_id: str | None) -> dict[str, np.ndarray] | None:
    if not phantom_id or not _PHANTOM_ID.match(phantom_id):
        return None
    generated = spec_from_id(phantom_id)
    if generated is not None:
        gt = ground_truth(generated)
        return {
            "melanin": gt.melanin,
            "hemoglobin": gt.hemoglobin,
            "mask": gt.mask,
            "area_mm2": np.float64(gt.area_mm2),
        }
    path = get_settings().simulator_dir / "ground_truth" / f"{phantom_id}.npz"
    if not path.is_file():
        return None
    with np.load(path) as data:
        return {key: data[key] for key in data.files}


@router.get("/{capture_id}", response_model=ValidationOut)
def validate_capture(
    capture_id: uuid.UUID, user: CurrentUser, session: Annotated[Session, Depends(get_session)]
) -> ValidationOut:
    capture = session.get(Capture, capture_id)
    if capture is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
    authorize(session, user, capture.lesion.patient.created_by)
    truth = _ground_truth(capture.phantom_id)
    if truth is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No simulated ground truth for this capture")
    if capture.status != "processed":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Capture failed the quality check"
        )

    storage = get_storage()
    shape = (FRAME_SIZE, FRAME_SIZE)
    try:
        frames = {
            n: decode_png16(storage.get(raw_frame_key(capture.id, n)), shape) for n in FRAME_NAMES
        }
    except ObjectNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Raw frames not found") from exc
    result = run(
        FrameSet(frames={b: frames[b] for b in BANDS}, dark=frames["dark"]),
        load_profile(capture.device_id),
    )
    metrics = compare(
        result.melanin,
        result.hemoglobin,
        result.mask,
        truth["melanin"],
        truth["hemoglobin"],
        truth["mask"],
    )
    audit.record(session, user, "validate", "capture", capture.id)
    session.commit()
    return ValidationOut(
        capture_id=capture.id,
        phantom_id=capture.phantom_id,
        simulated=True,
        metrics={k: round(v, 4) for k, v in metrics.items()},
        measured_area_mm2=round(result.area_mm2, 2),
        true_area_mm2=round(float(truth["area_mm2"]), 2),
        scope=SCOPE,
    )
