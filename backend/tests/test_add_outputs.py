"""Older captures gain the AI outputs without any stored measurement changing."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.captures import FRAME_NAMES, add_newer_outputs, ingest
from app.config import get_settings
from app.storage import LocalStorage
from tests.test_scoping import _case, _user


def test_adds_missing_outputs_once_and_keeps_measurements(db: Session, tmp_path) -> None:
    clinician = _user(db, "ai-clin", "clinician", True)
    case = _case(db, clinician, "PT-7401")
    storage = LocalStorage(tmp_path)
    root = get_settings().simulator_dir / "phantoms" / "pigmented_dark"
    capture = ingest(
        db,
        storage,
        user=clinician,
        capture_id=uuid.uuid4(),
        lesion=case.lesion,
        captured_at=datetime.now(UTC),
        device_id="virtual-001",
        phantom_id="pigmented_dark",
        frames={n: (root / f"{n}.png").read_bytes() for n in FRAME_NAMES},
    )
    db.flush()
    area = capture.area_mm2
    older = {k: v for k, v in capture.result.items() if k not in ("triage_model", "morphology")}
    capture.result = {**older, "views": ["pigment", "standard", "vascular"]}

    assert add_newer_outputs(storage, capture, apply=True) == "updated"
    assert capture.result["triage_model"]["pattern"] == "pigmented"
    assert "evidence" in capture.result["views"]
    assert capture.result["morphology"]["border_irregularity"] > 1.0
    assert capture.area_mm2 == area
    assert add_newer_outputs(storage, capture, apply=True) == "current"
