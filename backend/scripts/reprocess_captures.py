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

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.captures import FRAME_NAMES
from app.db import get_engine
from app.devices import load_profile
from app.models import Capture
from app.processing import FrameSet, run
from app.processing.frameio import decode_png16, encode_png_rgb
from app.processing.optics import BANDS, FRAME_SIZE
from app.storage import get_storage, raw_frame_key, view_key

ADDED_KEYS = ("quality_model", "triage_model", "acral_model", "morphology")
AREA_TOLERANCE_MM2 = 0.01
PAUSE_S = 0.2


def needs_update(capture: Capture) -> bool:
    return capture.status == "processed" and "triage_model" not in (capture.result or {})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args()
    storage = get_storage()
    shape = (FRAME_SIZE, FRAME_SIZE)
    updated = skipped = 0
    with Session(get_engine()) as session:
        ids = [c.id for c in session.scalars(select(Capture)) if needs_update(c)]
        print(f"{len(ids)} processed captures lack the newer outputs")
        for capture_id in ids:
            capture = session.get(Capture, capture_id)
            frames = {
                n: decode_png16(storage.get(raw_frame_key(capture_id, n)), shape)
                for n in FRAME_NAMES
            }
            result = run(
                FrameSet(frames={b: frames[b] for b in BANDS}, dark=frames["dark"]),
                load_profile(capture.device_id),
            )
            summary = result.summary()
            if abs((summary["area_mm2"] or 0) - (capture.area_mm2 or 0)) > AREA_TOLERANCE_MM2:
                print(
                    f"skip {capture_id}: area {capture.area_mm2} would become {summary['area_mm2']}"
                )
                skipped += 1
                continue
            new_views = sorted(set(result.views) - set(capture.result.get("views", [])))
            verb = "update" if args.apply else "would update"
            print(f"{verb} {capture_id}: +{ADDED_KEYS} views +{new_views}")
            if not args.apply:
                continue
            for name in new_views:
                storage.put(view_key(capture_id, name), encode_png_rgb(result.views[name]))
            capture.result = {
                **capture.result,
                **{k: summary[k] for k in ADDED_KEYS if k not in capture.result},
                "views": sorted(set(capture.result.get("views", [])) | set(new_views)),
            }
            flag_modified(capture, "result")
            session.commit()
            updated += 1
            time.sleep(PAUSE_S)
    print(f"done: {updated} updated, {skipped} skipped{'' if args.apply else ' (dry run)'}")


if __name__ == "__main__":
    main()
