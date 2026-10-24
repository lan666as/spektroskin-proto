import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.api.serialize import lesion_out
from app.auth import Clinician, CurrentUser
from app.db import get_session
from app.models import Lesion, Patient
from app.schemas import PatientCreate, PatientDetail, PatientOut

router = APIRouter(prefix="/patients", tags=["patients"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[PatientOut])
def list_patients(user: CurrentUser, session: SessionDep) -> list[Patient]:
    """Clinicians see the patients they registered; dermatologists see all."""
    query = select(Patient).order_by(Patient.code)
    if user.role == "clinician":
        query = query.where(Patient.created_by == user.id)
    patients = list(session.scalars(query))
    audit.record(session, user, "list", "patient", "*")
    session.commit()
    return patients


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientCreate, user: Clinician, session: SessionDep) -> Patient:
    patient = Patient(**body.model_dump(), created_by=user.id)
    session.add(patient)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Patient {body.code} already exists"
        ) from exc
    audit.record(session, user, "create", "patient", patient.id)
    session.commit()
    return patient


@router.get("/{patient_id}", response_model=PatientDetail)
def get_patient(patient_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PatientDetail:
    patient = session.get(
        Patient,
        patient_id,
        options=[selectinload(Patient.lesions).selectinload(Lesion.captures)],
    )
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    audit.record(session, user, "read", "patient", patient.id)
    session.commit()
    return PatientDetail(
        **PatientOut.model_validate(patient).model_dump(),
        lesions=[
            lesion_out(lesion) for lesion in sorted(patient.lesions, key=lambda x: x.created_at)
        ],
    )
