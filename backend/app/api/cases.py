import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.api.serialize import case_detail, case_summary
from app.auth import Clinician, CurrentUser, Dermatologist, same_group
from app.db import get_session
from app.models import Capture, Case, Lesion, Outcome, Review, User, utcnow
from app.schemas import CaseCreate, CaseDetail, CaseStatus, CaseSummary, OutcomeIn, ReviewCreate

router = APIRouter(prefix="/cases", tags=["cases"])
SessionDep = Annotated[Session, Depends(get_session)]

_LOAD = (
    selectinload(Case.lesion).selectinload(Lesion.patient),
    selectinload(Case.lesion).selectinload(Lesion.captures),
    selectinload(Case.captures),
    selectinload(Case.review).selectinload(Review.reviewer),
    selectinload(Case.outcome).selectinload(Outcome.recorder),
)


def _requester_names(session: Session, cases: list[Case]) -> dict[uuid.UUID, str]:
    ids = {c.created_by for c in cases}
    if not ids:
        return {}
    return dict(session.execute(select(User.id, User.display_name).where(User.id.in_(ids))).all())


def _load_case(session: Session, case_id: uuid.UUID, user: User) -> Case:
    case = session.get(Case, case_id, options=_LOAD)
    # Clinicians may only open cases they submitted; 404 avoids confirming that others exist.
    if case is None or (user.role == "clinician" and case.created_by != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


@router.get("", response_model=list[CaseSummary])
def list_cases(
    user: CurrentUser,
    session: SessionDep,
    status_filter: Annotated[list[CaseStatus] | None, Query(alias="status")] = None,
) -> list[CaseSummary]:
    """Dermatologists: the review queue (all cases from their user group). Clinicians: cases they
    submitted."""
    query = select(Case).options(*_LOAD).order_by(Case.created_at.desc())
    if status_filter:
        query = query.where(Case.status.in_(status_filter))
    if user.role == "clinician":
        query = query.where(Case.created_by == user.id)
    else:
        query = query.where(Case.created_by.in_(same_group(user)))
    cases = list(session.scalars(query))
    names = _requester_names(session, cases)
    audit.record(session, user, "list", "case", "*")
    session.commit()
    return [case_summary(c, user, names[c.created_by]) for c in cases]


@router.post("", response_model=CaseDetail, status_code=status.HTTP_201_CREATED)
def create_case(body: CaseCreate, user: Clinician, session: SessionDep) -> CaseDetail:
    lesion = session.get(Lesion, body.lesion_id)
    if lesion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesion not found")
    captures = list(session.scalars(select(Capture).where(Capture.id.in_(body.capture_ids))))
    if len(captures) != len(set(body.capture_ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
    if any(c.lesion_id != lesion.id for c in captures):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Captures must be of this lesion")
    if any(c.status != "processed" for c in captures):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Captures that failed QC cannot be submitted"
        )
    case = Case(
        lesion_id=lesion.id,
        question=body.question,
        status="submitted",
        created_by=user.id,
        captures=captures,
    )
    session.add(case)
    session.flush()
    audit.record(session, user, "create", "case", case.id)
    session.commit()
    session.expire_all()
    return case_detail(_load_case(session, case.id, user), user, user.display_name)


@router.get("/{case_id}", response_model=CaseDetail)
def get_case(case_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CaseDetail:
    case = _load_case(session, case_id, user)
    if user.role == "dermatologist" and case.status == "submitted":
        case.status = "in_review"
    audit.record(session, user, "read", "case", case.id)
    session.commit()
    return case_detail(case, user, _requester_names(session, [case])[case.created_by])


@router.post("/{case_id}/review", response_model=CaseDetail, status_code=status.HTTP_201_CREATED)
def review_case(
    case_id: uuid.UUID, body: ReviewCreate, user: Dermatologist, session: SessionDep
) -> CaseDetail:
    # Row lock: two reviewers submitting at once cannot both answer the case.
    case = session.scalar(select(Case).where(Case.id == case_id).with_for_update())
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if case.status == "answered":
        raise HTTPException(status.HTTP_409_CONFLICT, "Case already answered")
    session.add(Review(case_id=case.id, reviewer_id=user.id, **body.model_dump()))
    case.status = "answered"
    case.answered_at = utcnow()
    audit.record(session, user, "review", "case", case.id)
    session.commit()
    session.expire_all()
    case = _load_case(session, case_id, user)
    return case_detail(case, user, _requester_names(session, [case])[case.created_by])


@router.put("/{case_id}/outcome", response_model=CaseDetail)
def record_outcome(
    case_id: uuid.UUID, body: OutcomeIn, user: Clinician, session: SessionDep
) -> CaseDetail:
    """The requesting clinician records what was done and, after tissue sampling, the
    histopathology result. Idempotent: a repeat replaces the previous entry."""
    case = session.scalar(select(Case).where(Case.id == case_id).with_for_update())
    if case is None or case.created_by != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if case.status != "answered":
        raise HTTPException(status.HTTP_409_CONFLICT, "Record the outcome after the review")
    outcome = session.scalar(select(Outcome).where(Outcome.case_id == case.id))
    if outcome is None:
        outcome = Outcome(case_id=case.id, recorded_by=user.id)
        session.add(outcome)
    for field, value in body.model_dump().items():
        setattr(outcome, field, value)
    outcome.recorded_by = user.id
    audit.record(session, user, "outcome", "case", case.id)
    session.commit()
    session.expire_all()
    return case_detail(_load_case(session, case_id, user), user, user.display_name)
