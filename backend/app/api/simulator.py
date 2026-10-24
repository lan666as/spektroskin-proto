"""Virtual optical module, server side: a fresh simulated frame set for each capture.

The app's VirtualCaptureDevice calls this instead of a USB module, then uploads the frames through
POST /captures exactly as a real device's frames would be. Frames are synthetic only.
"""

import random
import re
import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.auth import Clinician, authorize
from app.db import get_session
from app.models import Lesion
from app.processing.frameio import encode_png16
from app.processing.optics import BANDS
from app.storage import ObjectNotFound, get_storage
from simulator.device import capture
from simulator.generate import preview_png
from simulator.lesions import generated_id, next_in_series, spec_from_id
from simulator.phantoms import catalogue, ground_truth, spec_by_id

router = APIRouter(prefix="/simulator", tags=["simulator"])
SessionDep = Annotated[Session, Depends(get_session)]
FRAMES = (*BANDS, "dark")
BAD_CAPTURE_RATE = 0.1
_TOKEN = re.compile(r"^[0-9a-f]{32}$")
_FILE = re.compile(r"^(preview_)?(blue|green|red|nir|dark)\.png$")


class SimulatedCaptureIn(BaseModel):
    lesion_id: uuid.UUID
    phantom_id: str | None = None


class SimulatedCaptureOut(BaseModel):
    phantom_id: str
    description: str
    simulated: bool = True
    frames: dict[str, str]
    previews: dict[str, str]


def _choose_spec(lesion: Lesion, requested: str | None, rng: random.Random, allow_bad: bool):
    if requested:
        try:
            return spec_by_id(requested)
        except KeyError:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown phantom") from None
    captures = sorted(lesion.captures, key=lambda c: c.captured_at)
    latest = captures[-1] if captures else None
    if latest and latest.phantom_id:
        series = next_in_series(latest.phantom_id)
        if series:
            return series
        if latest.phantom_id in {s.id for s in catalogue()}:
            return spec_by_id(latest.phantom_id)
    day = (datetime.now(UTC) - captures[0].captured_at).days if captures else 0
    retaking = latest is not None and latest.status == "qc_failed"
    variant = None
    if allow_bad and not retaking and rng.random() < BAD_CAPTURE_RATE:
        variant = rng.choice(("blur", "glare"))
    phantom_id = generated_id(
        lesion.id, lesion.patient.fitzpatrick, lesion.body_site, max(day, 0), variant
    )
    return spec_from_id(phantom_id)


@router.post("/captures", response_model=SimulatedCaptureOut)
def simulate_capture(
    body: SimulatedCaptureIn, user: Clinician, session: SessionDep
) -> SimulatedCaptureOut:
    """Same lesion, new capture: the lesion keeps its simulated identity (pattern, shape, growth),
    each capture draws new noise and hand motion, and now and then a blurred or glare capture
    (never for automated test accounts, whose checks must be deterministic)."""
    lesion = session.get(
        Lesion,
        body.lesion_id,
        options=(selectinload(Lesion.captures), selectinload(Lesion.patient)),
    )
    if lesion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesion not found")
    authorize(session, user, lesion.patient.created_by)
    rng = random.Random(secrets.randbits(64))
    spec = _choose_spec(lesion, body.phantom_id, rng, allow_bad=not user.is_test)
    frame_set = capture(spec, ground_truth(spec), repeat=rng.randrange(1_000_000))
    raw = {**frame_set.frames, "dark": frame_set.dark}
    token = uuid.uuid4().hex
    storage = get_storage()
    # ponytail: generated frames are never pruned (~0.5 MB per capture); add a TTL sweep if
    # simulated captures ever run at volume.
    for name in FRAMES:
        storage.put(f"simulator/{token}/{name}.png", encode_png16(raw[name]))
        storage.put(
            f"simulator/{token}/preview_{name}.png", preview_png(name, raw[name], raw["dark"])
        )
    audit.record(session, user, "simulate", "lesion", lesion.id)
    session.commit()
    base = f"/api/simulator/frames/{token}"
    return SimulatedCaptureOut(
        phantom_id=spec.id,
        description=spec.description,
        frames={n: f"{base}/{n}.png" for n in FRAMES},
        previews={n: f"{base}/preview_{n}.png" for n in FRAMES},
    )


@router.get("/frames/{token}/{file}", response_class=Response)
def simulated_frame(token: str, file: str) -> Response:
    """Unauthenticated on purpose: React Native attaches a multipart file part by downloading its
    URL without our auth header. The frames are synthetic and the token is a random 128-bit id."""
    if not _TOKEN.match(token) or not _FILE.match(file):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    try:
        data = get_storage().get(f"simulator/{token}/{file}")
    except ObjectNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found") from None
    return Response(data, media_type="image/png", headers={"Cache-Control": "no-store"})
