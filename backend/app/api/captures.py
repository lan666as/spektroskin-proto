import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app import audit
from app.api.serialize import capture_out
from app.auth import Clinician, CurrentUser, authorize
from app.captures import add_newer_outputs, ingest
from app.db import get_session
from app.devices import UnknownDevice
from app.models import Capture, Lesion
from app.processing.frameio import FrameDecodeError
from app.schemas import CaptureOut
from app.storage import get_storage

router = APIRouter(prefix="/captures", tags=["captures"])
SessionDep = Annotated[Session, Depends(get_session)]
MAX_FRAME_BYTES = 4 * 1024 * 1024
CLOCK_SKEW = timedelta(minutes=10)


def _read(upload: UploadFile, name: str) -> bytes:
    data = upload.file.read(MAX_FRAME_BYTES + 1)
    if len(data) > MAX_FRAME_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Frame {name} too large")
    return data


@router.post(
    "",
    response_model=CaptureOut,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"description": "Capture with this id already exists (idempotent retry)"}},
)
def create_capture(
    response: Response,
    user: Clinician,
    session: SessionDep,
    id: Annotated[uuid.UUID, Form(description="Client-generated capture id (idempotency key)")],
    lesion_id: Annotated[uuid.UUID, Form()],
    captured_at: Annotated[datetime, Form()],
    device_id: Annotated[str, Form(max_length=64)],
    blue: Annotated[UploadFile, File()],
    green: Annotated[UploadFile, File()],
    red: Annotated[UploadFile, File()],
    nir: Annotated[UploadFile, File()],
    dark: Annotated[UploadFile, File()],
    phantom_id: Annotated[str | None, Form(max_length=64)] = None,
) -> CaptureOut:
    """Upload one frame set (16-bit PNG per band + dark frame); processing runs synchronously."""
    existing = session.get(Capture, id)
    if existing is not None:
        authorize(session, user, existing.lesion.patient.created_by)
        return _existing(existing, lesion_id, user, response)
    if captured_at.tzinfo is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "captured_at needs a timezone")
    if captured_at > datetime.now(UTC) + CLOCK_SKEW:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "captured_at is in the future")
    lesion = session.get(Lesion, lesion_id)
    if lesion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesion not found")
    authorize(session, user, lesion.patient.created_by)

    frames = {
        "blue": _read(blue, "blue"),
        "green": _read(green, "green"),
        "red": _read(red, "red"),
        "nir": _read(nir, "nir"),
        "dark": _read(dark, "dark"),
    }
    try:
        capture = ingest(
            session,
            get_storage(),
            user=user,
            capture_id=id,
            lesion=lesion,
            captured_at=captured_at,
            device_id=device_id,
            phantom_id=phantom_id,
            frames=frames,
        )
        session.commit()
    except FrameDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Bad frame: {exc}") from exc
    except UnknownDevice as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown device") from exc
    except IntegrityError:
        session.rollback()  # a concurrent retry with the same id won the insert
        existing = session.get(Capture, id)
        if existing is None:
            raise
        return _existing(existing, lesion_id, user, response)
    return capture_out(capture, user)


def _existing(capture: Capture, lesion_id: uuid.UUID, user, response: Response) -> CaptureOut:
    if capture.lesion_id != lesion_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Capture id already used for another lesion")
    response.status_code = status.HTTP_200_OK
    return capture_out(capture, user)


@router.get("/{capture_id}", response_model=CaptureOut)
def get_capture(capture_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CaptureOut:
    capture = session.get(Capture, capture_id)
    if capture is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
    authorize(session, user, capture.lesion.patient.created_by)
    audit.record(session, user, "read", "capture", capture.id)
    session.commit()
    return capture_out(capture, user)


@router.post("/{capture_id}/ai", response_model=CaptureOut)
def run_ai(capture_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CaptureOut:
    """Add the AI outputs to a capture processed before they existed. Idempotent; never changes
    stored measurements."""
    capture = session.get(Capture, capture_id)
    if capture is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
    authorize(session, user, capture.lesion.patient.created_by)
    outcome = add_newer_outputs(get_storage(), capture, apply=True)
    if outcome == "skipped":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Re-processing would change stored measurements; not applied"
        )
    if outcome == "updated":
        flag_modified(capture, "result")
        audit.record(session, user, "run_ai", "capture", capture.id)
    session.commit()
    return capture_out(capture, user)
