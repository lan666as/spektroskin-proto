"""Add the newer automated outputs (AI opinions, morphology, evidence view) to captures processed
before they existed. Dry run by default; --apply writes.

    python -m scripts.reprocess_captures            # dry run: lists what would change
    python -m scripts.reprocess_captures --apply

Re-runs the same deterministic pipeline on the stored raw frames. Measurements, QC and status are
kept as stored (the dry run reports any capture whose area would differ, and --apply skips it);
only keys missing from the stored result are added, plus the missing view images. One capture at a
time, committed individually, with a pause between captures. Restore path: the added keys can be
removed again; nothing existing is overwritten.
"""

import argparse
import time
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.captures import add_newer_outputs, lacks_newer_outputs
from app.db import get_engine
from app.models import Capture
from app.storage import get_storage

PAUSE_S = 0.2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args()
    storage = get_storage()
    outcomes: Counter = Counter()
    with Session(get_engine()) as session:
        ids = [c.id for c in session.scalars(select(Capture)) if lacks_newer_outputs(c)]
        print(f"{len(ids)} processed captures lack the newer outputs")
        for capture_id in ids:
            capture = session.get(Capture, capture_id)
            outcome = add_newer_outputs(storage, capture, apply=args.apply)
            print(f"{outcome} {capture_id}")
            outcomes[outcome] += 1
            if args.apply and outcome == "updated":
                flag_modified(capture, "result")
                session.commit()
                time.sleep(PAUSE_S)
    print(f"done: {dict(outcomes)}{'' if args.apply else ' (dry run)'}")


if __name__ == "__main__":
    main()
