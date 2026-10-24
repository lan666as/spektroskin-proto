import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.api.serialize import capture_out, lesion_out
from app.auth import Clinician, CurrentUser
from app.db import get_session
from app.models import Lesion, Patient
from app.schemas import LesionCreate, LesionDetail, LesionOut, PatientOut

router = APIRouter(prefix="/lesions", tags=["lesions"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=LesionOut, status_code=status.HTTP_201_CREATED)
def create_lesion(body: LesionCreate, user: Clinician, session: SessionDep) -> LesionOut:
    if session.get(Patient, body.patient_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    lesion = Lesion(**body.model_dump(), created_by=user.id)
    session.add(lesion)
    session.flush()
    audit.record(session, user, "create", "lesion", lesion.id)
    session.commit()
    return lesion_out(lesion)


@router.get("/{lesion_id}", response_model=LesionDetail)
def get_lesion(lesion_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> LesionDetail:
    """Lesion with its patient and full capture history (oldest first)."""
    lesion = session.get(
        Lesion, lesion_id, options=[selectinload(Lesion.captures), selectinload(Lesion.patient)]
    )
    if lesion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesion not found")
    audit.record(session, user, "read", "lesion", lesion.id)
    session.commit()
    return LesionDetail(
        **lesion_out(lesion).model_dump(),
        patient=PatientOut.model_validate(lesion.patient),
        captures=[capture_out(c, user) for c in lesion.captures],
    )
