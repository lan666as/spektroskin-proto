"""Outcome entry closes the loop: only after the review, only by the requesting clinician."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.cases import record_outcome, review_case
from app.models import Outcome
from app.schemas import OutcomeIn, ReviewCreate
from tests.test_scoping import _case, _user

BIOPSY = OutcomeIn(
    action_taken="biopsied", procedure_date=date(2026, 10, 20), histopathology="pending"
)


def test_outcome_waits_for_the_review(db: Session) -> None:
    clinician = _user(db, "o-clin-1", "clinician", True)
    case = _case(db, clinician, "PT-7101")
    with pytest.raises(HTTPException) as err:
        record_outcome(case.id, BIOPSY, clinician, db)
    assert err.value.status_code == 409


def test_only_the_requesting_clinician_records_it(db: Session) -> None:
    clinician = _user(db, "o-clin-2", "clinician", True)
    other = _user(db, "o-clin-3", "clinician", True)
    derm = _user(db, "o-derm-1", "dermatologist", True)
    case = _case(db, clinician, "PT-7102")
    review_case(case.id, ReviewCreate(impression="i", action="biopsy"), derm, db)
    with pytest.raises(HTTPException) as err:
        record_outcome(case.id, BIOPSY, other, db)
    assert err.value.status_code == 404


def test_recording_twice_replaces_and_shows_on_the_case(db: Session) -> None:
    clinician = _user(db, "o-clin-4", "clinician", True)
    derm = _user(db, "o-derm-2", "dermatologist", True)
    case = _case(db, clinician, "PT-7103")
    answered = review_case(
        case.id, ReviewCreate(impression="i", action="biopsy", follow_up_days=14), derm, db
    )
    assert answered.follow_up_due == answered.answered_at.date() + timedelta(days=14)

    record_outcome(case.id, BIOPSY, clinician, db)
    final = OutcomeIn(
        action_taken="biopsied",
        procedure_date=date(2026, 10, 20),
        histopathology="benign",
        histopathology_notes="Compound naevus",
    )
    detail = record_outcome(case.id, final, clinician, db)
    assert detail.outcome is not None and detail.outcome.histopathology == "benign"
    assert detail.histopathology == "benign" and detail.outcome_action == "biopsied"
    count = db.scalar(select(func.count()).select_from(Outcome).where(Outcome.case_id == case.id))
    assert count == 1


def test_histopathology_needs_tissue() -> None:
    with pytest.raises(ValidationError):
        OutcomeIn(action_taken="observed", histopathology="benign")
