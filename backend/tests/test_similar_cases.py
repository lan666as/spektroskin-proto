"""Similar-case retrieval ranks reviewed cases by feature distance and skips the same lesion."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.api.cases import review_case, similar_cases
from app.models import Capture
from app.processing import run
from app.schemas import ReviewCreate
from simulator.device import capture, factory_profile
from simulator.phantoms import ground_truth, spec_by_id
from tests.test_scoping import _case, _user

_SPEC = spec_by_id("pigmented_light")
_RESULT = run(capture(_SPEC, ground_truth(_SPEC)), factory_profile())
QC, TRIAGE = _RESULT.summary()["qc"], _RESULT.triage_model


def _with_capture(db: Session, case, clinician, embedding) -> None:
    capture = Capture(
        id=uuid.uuid4(),
        lesion_id=case.lesion_id,
        captured_at=datetime.now(UTC),
        device_type="virtual",
        device_id="virtual-001",
        status="processed",
        qc=QC,
        result={"views": ["standard"], "triage_model": {**TRIAGE, "embedding": embedding}},
        area_mm2=20.0,
        created_by=clinician.id,
    )
    db.add(capture)
    db.flush()
    case.captures.append(capture)
    db.flush()


def test_nearest_reviewed_cases_come_first(db: Session) -> None:
    clinician = _user(db, "s-clin", "clinician", True)
    derm = _user(db, "s-derm", "dermatologist", True)
    target = _case(db, clinician, "PT-7201")
    near = _case(db, clinician, "PT-7202")
    far = _case(db, clinician, "PT-7203")
    unreviewed = _case(db, clinician, "PT-7204")
    for case, vector in ((target, [0, 0]), (near, [0.1, 0]), (far, [3, 3]), (unreviewed, [0, 0])):
        _with_capture(db, case, clinician, vector)
    for case in (near, far):
        review_case(case.id, ReviewCreate(impression="i", action="observe"), derm, db)

    result = similar_cases(target.id, derm, db, limit=3)
    assert [r.patient_code for r in result] == ["PT-7202", "PT-7203"]
    assert result[0].distance < result[1].distance
