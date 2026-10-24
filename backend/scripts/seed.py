"""Seed synthetic demo data (PLAN.md §7). Idempotent: re-running never duplicates or deletes.

    python -m scripts.seed

Requires the demo users (scripts.create_user) and generated phantoms (simulator.generate).
"""

import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.captures import FRAME_NAMES, ingest
from app.config import get_settings
from app.db import get_sessionmaker
from app.models import Capture, Case, Lesion, Patient, Review, User, utcnow
from app.storage import get_storage

SEED_NAMESPACE = uuid.UUID("6f1c2d5e-0b7a-4c1e-9a52-5e8d3f7b9c10")
DEVICE_ID = "virtual-001"


@dataclass(frozen=True)
class SeedCapture:
    phantom_id: str
    days_ago: int


@dataclass(frozen=True)
class SeedCase:
    question: str
    review: dict | None = None


@dataclass(frozen=True)
class SeedPatient:
    code: str
    age: int
    sex: str
    fitzpatrick: str
    body_site: str
    laterality: str | None
    captures: tuple[SeedCapture, ...]
    case: SeedCase | None
    lesion_key: str = "lesion"  # a further lesion of the same patient needs its own key


SEED = (
    SeedPatient(
        "PT-0003", 41, "male", "IV", "upper_back", "midline",
        (SeedCapture("mixed_medium", 20),),
        SeedCase(
            "Brown-red lesion on upper back noticed by the patient's family. Observe or refer?",
            review={
                "impression": "Lesion appears stable on this visit with a regular outline. "
                "No change history yet to compare.",
                "action": "observe",
                "follow_up_days": 90,
                "notes": "Re-image with the same device at follow-up for comparison.",
            },
        ),
    ),
    SeedPatient(
        "PT-0005", 29, "female", "IV", "forearm", "right",
        (SeedCapture("vascular_medium", 2),),
        SeedCase("Reddish lesion on right forearm for about 3 months. Please advise next step."),
    ),
    SeedPatient(
        "PT-0007", 54, "female", "V", "sole", "left",
        (SeedCapture("acral_dark_d01", 29), SeedCapture("acral_dark_d14", 16)),
        None,
    ),
    # Rehearsal twin of PT-0007: rehearse on this one so PT-0007 is untouched for the live demo.
    SeedPatient(
        "PT-0009", 54, "female", "V", "sole", "left",
        (SeedCapture("acral_dark_d01", 29), SeedCapture("acral_dark_d14", 16)),
        None,
    ),
    # Several lesions on one patient: three alike and one that looks different (ugly duckling).
    SeedPatient("PT-0011", 47, "female", "IV", "upper_back", "left",
                (SeedCapture("pigmented_medium", 40),), None, lesion_key="lesion-upper-back-left"),
    SeedPatient("PT-0011", 47, "female", "IV", "upper_back", "right",
                (SeedCapture("pigmented_light", 40),), None, lesion_key="lesion-upper-back-right"),
    SeedPatient("PT-0011", 47, "female", "IV", "chest", "midline",
                (SeedCapture("pigmented_dark", 40),), None, lesion_key="lesion-chest"),
    SeedPatient("PT-0011", 47, "female", "IV", "lower_back", "right",
                (SeedCapture("mixed_medium", 3),), None, lesion_key="lesion-lower-back"),
)  # fmt: skip


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, ":".join(parts))


def _user(session: Session, username: str) -> User:
    user = session.scalar(select(User).where(User.username == username))
    if user is None:
        raise SystemExit(f"user {username!r} missing: run scripts.create_user first")
    return user


def _frames(phantom_id: str) -> dict[str, bytes]:
    root = get_settings().simulator_dir / "phantoms" / phantom_id
    if not root.is_dir():
        raise SystemExit(f"phantom {phantom_id!r} missing: run simulator.generate first")
    return {name: (root / f"{name}.png").read_bytes() for name in FRAME_NAMES}


def seed_patient(session: Session, spec: SeedPatient, clinician: User, reviewer: User) -> None:
    patient = session.scalar(select(Patient).where(Patient.code == spec.code))
    if patient is None:
        patient = Patient(
            code=spec.code,
            age=spec.age,
            sex=spec.sex,
            fitzpatrick=spec.fitzpatrick,
            created_by=clinician.id,
        )
        session.add(patient)
        session.flush()

    lesion_id = _id(spec.code, spec.lesion_key)
    lesion = session.get(Lesion, lesion_id)
    if lesion is None:
        lesion = Lesion(
            id=lesion_id,
            patient_id=patient.id,
            body_site=spec.body_site,
            laterality=spec.laterality,
            created_by=clinician.id,
            created_at=utcnow() - timedelta(days=max(c.days_ago for c in spec.captures) + 1),
        )
        session.add(lesion)
        session.flush()

    captures = []
    for item in spec.captures:
        capture_id = _id(spec.code, item.phantom_id)
        capture = session.get(Capture, capture_id)
        if capture is None:
            capture = ingest(
                session,
                get_storage(),
                user=clinician,
                capture_id=capture_id,
                lesion=lesion,
                captured_at=datetime.now(UTC) - timedelta(days=item.days_ago),
                device_id=DEVICE_ID,
                phantom_id=item.phantom_id,
                frames=_frames(item.phantom_id),
            )
            session.flush()
        captures.append(capture)

    if spec.case is not None and session.get(Case, _id(spec.code, "case")) is None:
        created = captures[-1].captured_at + timedelta(minutes=10)
        case = Case(
            id=_id(spec.code, "case"),
            lesion_id=lesion.id,
            question=spec.case.question,
            status="submitted",
            created_by=clinician.id,
            created_at=created,
            captures=captures,
        )
        session.add(case)
        if spec.case.review is not None:
            session.add(Review(case_id=case.id, reviewer_id=reviewer.id, **spec.case.review))
            case.status = "answered"
            case.answered_at = created + timedelta(hours=5)
        session.flush()


def main() -> int:
    with get_sessionmaker()() as session:
        clinician = _user(session, "clinician")
        reviewer = _user(session, "dermatologist")
        for spec in SEED:
            seed_patient(session, spec, clinician, reviewer)
        session.commit()
    print(f"seeded {len({s.code for s in SEED})} patients (idempotent)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
