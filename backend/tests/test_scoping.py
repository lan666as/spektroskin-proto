"""Automated test accounts and real accounts never see each other's records in lists."""

from sqlalchemy.orm import Session

from app.api.cases import list_cases
from app.api.patients import list_patients
from app.models import Case, Lesion, Patient, User


def _user(db: Session, name: str, role: str, is_test: bool) -> User:
    user = User(username=name, display_name=name, role=role, password_hash="x", is_test=is_test)
    db.add(user)
    db.flush()
    return user


def _case(db: Session, clinician: User, code: str) -> Case:
    patient = Patient(code=code, age=50, sex="female", fitzpatrick="V", created_by=clinician.id)
    db.add(patient)
    db.flush()
    lesion = Lesion(patient_id=patient.id, body_site="sole", created_by=clinician.id)
    db.add(lesion)
    db.flush()
    case = Case(lesion_id=lesion.id, question="q", status="submitted", created_by=clinician.id)
    db.add(case)
    db.flush()
    return case


def test_dermatologist_lists_only_their_group(db: Session) -> None:
    real_clinician = _user(db, "t-real-clin", "clinician", False)
    test_clinician = _user(db, "t-test-clin", "clinician", True)
    real_derm = _user(db, "t-real-derm", "dermatologist", False)
    test_derm = _user(db, "t-test-derm", "dermatologist", True)
    real_case = _case(db, real_clinician, "PT-7001")
    test_case = _case(db, test_clinician, "PT-7002")

    real_ids = {c.id for c in list_cases(real_derm, db)}
    test_ids = {c.id for c in list_cases(test_derm, db)}
    assert real_case.id in real_ids and test_case.id not in real_ids
    assert test_case.id in test_ids and real_case.id not in test_ids

    real_codes = {p.code for p in list_patients(real_derm, db)}
    assert "PT-7001" in real_codes and "PT-7002" not in real_codes
