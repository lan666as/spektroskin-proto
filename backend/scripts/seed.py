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
from app.models import Capture, Case, Lesion, Outcome, Patient, Review, User, utcnow
from app.processing.frameio import encode_png16
from app.storage import get_storage
from simulator.device import capture as simulate
from simulator.lesions import generated_id, spec_from_id
from simulator.phantoms import ground_truth

SEED_NAMESPACE = uuid.UUID("6f1c2d5e-0b7a-4c1e-9a52-5e8d3f7b9c10")
DEVICE_ID = "virtual-001"
# A capture whose phantom is "gen" (or "gen-blur" / "gen-glare") is drawn from the lesion's own
# simulated identity, as the app's virtual module does, so every seeded lesion looks different.
GENERATED = "gen"


@dataclass(frozen=True)
class SeedCapture:
    phantom_id: str
    days_ago: int


@dataclass(frozen=True)
class SeedCase:
    question: str
    review: dict | None = None
    status: str = "submitted"  # without a review: "submitted" or "in_review"
    # What was done after the recommendation. Never a histopathology result other than
    # "pending": a made-up label would feed the AI page's validation numbers.
    outcome: dict | None = None


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
    research_consent: bool = False


def _review(impression: str, action: str, follow_up_days: int | None) -> dict:
    return {
        "impression": impression,
        "action": action,
        "follow_up_days": follow_up_days,
        "notes": "Seeded demo review of a synthetic phantom.",
    }


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
    SeedPatient("PT-0091", 47, "female", "IV", "upper_back", "left",
                (SeedCapture("pigmented_medium", 40),), None, lesion_key="lesion-upper-back-left"),
    SeedPatient("PT-0091", 47, "female", "IV", "upper_back", "right",
                (SeedCapture("pigmented_light", 40),), None, lesion_key="lesion-upper-back-right"),
    SeedPatient("PT-0091", 47, "female", "IV", "chest", "midline",
                (SeedCapture("pigmented_dark", 40),), None, lesion_key="lesion-chest"),
    SeedPatient("PT-0091", 47, "female", "IV", "lower_back", "right",
                (SeedCapture("mixed_medium", 3),), None, lesion_key="lesion-lower-back"),
    # A wider demo cohort: every Fitzpatrick type, acral and non-acral sites, growth series, bad
    # captures and retakes, and cases in every state.
    SeedPatient("PT-0201", 34, "female", "I", "face", "left",
                (SeedCapture("pigmented_light", 75),),
                SeedCase("New dark spot on left cheek, patient worried. Observe or refer?",
                         review=_review("Small, symmetric pigmented lesion with an even outline.",
                                        "observe", 180),
                         outcome={"action_taken": "observed"}),
                research_consent=True),
    SeedPatient("PT-0202", 62, "male", "II", "scalp", "midline",
                (SeedCapture(GENERATED, 60), SeedCapture(GENERATED, 46),
                 SeedCapture(GENERATED, 30)),
                SeedCase("Scalp lesion found by the barber, three visits so far. Please review.",
                         review=_review("Three visits available; compare the outlines across the "
                                        "series before deciding.", "refer", None),
                         outcome={"action_taken": "referred"}),
                research_consent=True),
    SeedPatient("PT-0203", 45, "female", "III", "neck", "right",
                (SeedCapture("vascular_light", 1),),
                SeedCase("Red papule on the neck that bleeds when shaving. Next step?")),
    SeedPatient("PT-0204", 51, "male", "IV", "chest", "midline",
                (SeedCapture("mixed_medium", 2),),
                SeedCase("Brown-red lesion on chest, changed colour per patient.",
                         status="in_review")),
    SeedPatient("PT-0205", 38, "female", "V", "palm", "left",
                (SeedCapture(GENERATED, 35), SeedCapture(GENERATED, 7)),
                SeedCase("Pigmented lesion on left palm, two visits. Biopsy needed?",
                         review=_review("Acral lesion; review the pigment pattern along the "
                                        "ridges and furrows in the pigment view.", "biopsy", None),
                         outcome={"action_taken": "biopsied", "histopathology": "pending"}),
                research_consent=True),
    SeedPatient("PT-0206", 67, "male", "VI", "sole", "right",
                (SeedCapture("acral_ridge_dark", 5),),
                SeedCase("Dark patch on right sole of a farmer, painless. Please advise urgently.",
                         review=_review("Acral lesion; pigment appears to follow the ridges in "
                                        "the pigment view.", "refer", None),
                         outcome={"action_taken": "referred"})),
    SeedPatient("PT-0207", 58, "female", "V", "sole", "left",
                (SeedCapture("acral_dark_d01", 45), SeedCapture("acral_dark_d14", 32),
                 SeedCapture("acral_dark_d30", 16)),
                SeedCase("Sole lesion growing across three visits. Excision?",
                         review=_review("Area increases over the three visits.", "biopsy", None),
                         outcome={"action_taken": "excised", "histopathology": "pending"}),
                research_consent=True),
    SeedPatient("PT-0208", 29, "male", "V", "forearm", "left",
                (SeedCapture("pigmented_dark_blur", 3), SeedCapture("pigmented_dark", 3)),
                SeedCase("Dark mole on forearm; first capture was blurred, retaken.")),
    SeedPatient("PT-0209", 41, "female", "V", "upper_arm", "right",
                (SeedCapture("pigmented_dark_glare", 9), SeedCapture("pigmented_dark", 9)),
                None),
    SeedPatient("PT-0210", 73, "male", "VI", "fingernail", "right",
                (SeedCapture(GENERATED, 4),),
                SeedCase("Dark band on right thumbnail for six months. Please review.")),
    SeedPatient("PT-0211", 23, "female", "IV", "abdomen", "midline",
                (SeedCapture("vascular_medium", 50),),
                SeedCase("Red lesion on abdomen since pregnancy.",
                         review=_review("Vascular pattern in the vessel view.", "observe", 90),
                         outcome={"action_taken": "declined"})),
    SeedPatient("PT-0212", 55, "male", "V", "toenail", "left",
                (SeedCapture(GENERATED, 40), SeedCapture(GENERATED, 12)), None),
    SeedPatient("PT-0213", 48, "female", "V", "thigh", "right",
                (SeedCapture("mixed_dark", 120),),
                SeedCase("Mixed-colour lesion on thigh.",
                         review=_review("Stable outline on this visit.", "observe", 90))),
    SeedPatient("PT-0214", 36, "male", "IV", "hand_dorsum", "left",
                (SeedCapture(GENERATED, 6),), None),
    SeedPatient("PT-0215", 64, "female", "VI", "lower_leg", "left",
                (SeedCapture("vascular_dark", 1),),
                SeedCase("Red-purple lesion on shin, slow growing.", status="in_review")),
    SeedPatient("PT-0216", 44, "male", "IV", "upper_back", "left",
                (SeedCapture(GENERATED, 25),), None, lesion_key="lesion-upper-back"),
    SeedPatient("PT-0216", 44, "male", "IV", "lower_back", "midline",
                (SeedCapture(GENERATED, 25), SeedCapture(GENERATED, 2)), None,
                lesion_key="lesion-lower-back"),
    SeedPatient("PT-0216", 44, "male", "IV", "foot_dorsum", "right",
                (SeedCapture(GENERATED, 25),), None, lesion_key="lesion-foot"),
)  # fmt: skip


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, ":".join(parts))


def _user(session: Session, username: str) -> User:
    user = session.scalar(select(User).where(User.username == username))
    if user is None:
        raise SystemExit(f"user {username!r} missing: run scripts.create_user first")
    return user


def _frames(phantom_id: str, capture_id: uuid.UUID) -> dict[str, bytes]:
    spec = spec_from_id(phantom_id)
    if spec is not None:
        frame_set = simulate(spec, ground_truth(spec), repeat=capture_id.int % 1_000_000)
        raw = {**frame_set.frames, "dark": frame_set.dark}
        return {name: encode_png16(raw[name]) for name in FRAME_NAMES}
    root = get_settings().simulator_dir / "phantoms" / phantom_id
    if not root.is_dir():
        raise SystemExit(f"phantom {phantom_id!r} missing: run simulator.generate first")
    return {name: (root / f"{name}.png").read_bytes() for name in FRAME_NAMES}


def seed_patient(session: Session, spec: SeedPatient, clinician: User, reviewer: User) -> None:
    patient = session.scalar(select(Patient).where(Patient.code == spec.code))
    if patient is not None and (patient.age, patient.sex, patient.fitzpatrick) != (
        spec.age,
        spec.sex,
        spec.fitzpatrick,
    ):
        # Someone else's patient already holds this code: never attach seed data to it.
        print(f"skip {spec.code} ({spec.lesion_key}): code taken by a different patient")
        return
    if patient is None:
        patient = Patient(
            code=spec.code,
            age=spec.age,
            sex=spec.sex,
            fitzpatrick=spec.fitzpatrick,
            research_consent=spec.research_consent,
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
    first_days_ago = max(c.days_ago for c in spec.captures)
    for item in spec.captures:
        phantom_id = item.phantom_id
        if phantom_id.startswith(GENERATED):
            variant = phantom_id.removeprefix(GENERATED).lstrip("-") or None
            day = first_days_ago - item.days_ago
            phantom_id = generated_id(lesion.id, spec.fitzpatrick, spec.body_site, day, variant)
        capture_id = _id(spec.code, phantom_id)
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
                phantom_id=phantom_id,
                frames=_frames(phantom_id, capture_id),
            )
            session.flush()
        captures.append(capture)

    usable = [c for c in captures if c.status == "processed"]
    if spec.case is not None and usable and session.get(Case, _id(spec.code, "case")) is None:
        created = usable[-1].captured_at + timedelta(minutes=10)
        case = Case(
            id=_id(spec.code, "case"),
            lesion_id=lesion.id,
            question=spec.case.question,
            status=spec.case.status,
            created_by=clinician.id,
            created_at=created,
            captures=usable,
        )
        session.add(case)
        if spec.case.review is not None:
            session.add(Review(case_id=case.id, reviewer_id=reviewer.id, **spec.case.review))
            case.status = "answered"
            case.answered_at = created + timedelta(hours=5)
            if spec.case.outcome is not None:
                session.add(Outcome(case_id=case.id, recorded_by=clinician.id, **spec.case.outcome))
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
