"""The seed never attaches demo data to someone else's patient that holds the same code."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Lesion, Patient
from scripts.seed import SeedCapture, SeedPatient, seed_patient
from tests.test_scoping import _user


def test_seed_skips_a_code_taken_by_a_different_patient(db: Session) -> None:
    clinician = _user(db, "seed-clin", "clinician", True)
    derm = _user(db, "seed-derm", "dermatologist", True)
    theirs = Patient(
        code="PT-7301", age=31, sex="female", fitzpatrick="VI", created_by=clinician.id
    )
    db.add(theirs)
    db.flush()
    spec = SeedPatient(
        "PT-7301", 47, "female", "IV", "chest", "midline",
        (SeedCapture("pigmented_dark", 40),), None, lesion_key="lesion-chest",
    )  # fmt: skip
    seed_patient(db, spec, clinician, derm)
    lesions = db.scalar(
        select(func.count()).select_from(Lesion).where(Lesion.patient_id == theirs.id)
    )
    assert lesions == 0
