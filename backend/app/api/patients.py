import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.api.serialize import lesion_out
from app.attention import lesion_flags, looks_different
from app.auth import Clinician, CurrentUser, authorize, same_group, sign_image_url
from app.db import get_session
from app.models import Lesion, Patient
from app.schemas import (
    ConsentUpdate,
    LesionFlag,
    PatientCreate,
    PatientDetail,
    PatientListItem,
    PatientOut,
)

router = APIRouter(prefix="/patients", tags=["patients"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[PatientListItem])
def list_patients(user: CurrentUser, session: SessionDep) -> list[PatientListItem]:
    """Clinicians see the patients they registered; dermatologists see their user group's.
    Most recently seen first."""
    query = select(Patient).options(selectinload(Patient.lesions).selectinload(Lesion.captures))
    if user.role == "clinician":
        query = query.where(Patient.created_by == user.id)
    else:
        query = query.where(Patient.created_by.in_(same_group(user)))
    items = [_list_item(p, user) for p in session.scalars(query)]
    audit.record(session, user, "list", "patient", "*")
    session.commit()
    return sorted(items, key=lambda i: i.last_visit_at or i.created_at, reverse=True)


def _list_item(patient: Patient, viewer) -> PatientListItem:
    visits = [c for lesion in patient.lesions for c in lesion.captures if c.status == "processed"]
    latest = max(visits, key=lambda c: c.captured_at, default=None)
    different = looks_different(patient.lesions)
    return PatientListItem(
        **PatientOut.model_validate(patient).model_dump(),
        lesion_count=len(patient.lesions),
        lesion_flags=[
            LesionFlag(
                lesion_id=lesion.id,
                body_site=lesion.body_site,
                laterality=lesion.laterality,
                flag=flag,
            )
            for lesion in patient.lesions
            for flag in lesion_flags(lesion, different)
        ],
        last_visit_at=latest.captured_at if latest else None,
        latest_thumbnail_url=sign_image_url(latest.id, "standard", viewer.id) if latest else None,
    )


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
    authorize(session, user, patient.created_by)
    audit.record(session, user, "read", "patient", patient.id)
    session.commit()
    different = looks_different(patient.lesions)
    return PatientDetail(
        **PatientOut.model_validate(patient).model_dump(),
        lesions=[
            lesion_out(lesion, user, lesion.id in different)
            for lesion in sorted(patient.lesions, key=lambda x: x.created_at)
        ],
    )


@router.put("/{patient_id}/consent", response_model=PatientOut)
def update_consent(
    patient_id: uuid.UUID, body: ConsentUpdate, user: Clinician, session: SessionDep
) -> Patient:
    """Research consent given later or withdrawn, by the clinician who registered the patient.
    Idempotent. Withdrawal removes the patient's cases from the validation set and its export."""
    patient = session.get(Patient, patient_id)
    if patient is None or patient.created_by != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    patient.research_consent = body.research_consent
    audit.record(session, user, "consent_given" if body.research_consent else "consent_withdrawn",
                 "patient", patient.id)  # fmt: skip
    session.commit()
    return patient
