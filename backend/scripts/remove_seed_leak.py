"""Remove the four demo lesions the batch-25 seed attached to the builder's own patient PT-0011.

    python -m scripts.remove_seed_leak            # dry run: lists what would be removed
    python -m scripts.remove_seed_leak --apply

Builder-approved on 25 Oct 2026 (BUILD_LOG). Removes exactly the listed lesions and their captures,
including the stored frames and views, and only if each lesion still belongs to PT-0011, carries
no case, and holds only the listed captures. Idempotent: rows already gone are reported and
skipped. One-way: restore from a database and storage backup.
"""

import argparse
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Case, Lesion
from app.storage import get_storage

PATIENT_CODE = "PT-0011"
LESIONS = {
    uuid.UUID("b8b27005-f046-5d95-be70-a42f8dda3d00"):
        uuid.UUID("9979d285-be2f-5d79-84d5-9f0a1fc113f0"),
    uuid.UUID("1a5ae85a-0f71-5384-aa7d-47d41a4c105b"):
        uuid.UUID("9101ba4e-76d2-50cb-8108-3e697358dcdb"),
    uuid.UUID("b7b42ec0-1206-5bdd-b132-5fddfe49328a"):
        uuid.UUID("e18c0e31-be4a-563f-9669-08d373b5aaa3"),
    uuid.UUID("08375ce7-c6fc-540d-8b52-a7e1b036c2f0"):
        uuid.UUID("85996485-5f4f-546f-b13e-f14241a0a5e9"),
}  # fmt: skip


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="delete (default: dry run)")
    args = parser.parse_args()
    storage = get_storage()
    with Session(get_engine()) as session:
        for lesion_id, capture_id in LESIONS.items():
            lesion = session.get(Lesion, lesion_id)
            if lesion is None:
                print(f"gone {lesion_id}")
                continue
            cases = session.scalar(select(func.count()).where(Case.lesion_id == lesion_id))
            captures = {c.id for c in lesion.captures}
            if lesion.patient.code != PATIENT_CODE or cases or not captures <= {capture_id}:
                print(f"refuse {lesion_id}: patient {lesion.patient.code}, {cases} case(s), "
                      f"captures {sorted(map(str, captures))}")  # fmt: skip
                continue
            verb = "delete" if args.apply else "would delete"
            print(
                f"{verb} lesion {lesion_id} ({lesion.body_site}), "
                f"capture(s) {sorted(map(str, captures))}"
            )
            if not args.apply:
                continue
            for capture in list(lesion.captures):
                session.delete(capture)
            session.delete(lesion)
            session.commit()
            for cid in captures:
                storage.delete_prefix(f"captures/{cid}")
    print("done" + ("" if args.apply else " (dry run)"))


if __name__ == "__main__":
    main()
