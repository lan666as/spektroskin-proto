"""Attention flags for the dermatologist's queue: named, explainable criteria, never a score.

Each flag restates something measured or suggested on the lesion's captures: the acral parallel
ridge pattern (Saida 2004), evolution in size or border (the "E" of ABCDE), a lesion that looks
unlike the patient's other lesions (the "ugly duckling" sign, Grob & Bonerandi 1998), or the
triage model abstaining. Flags reorder nothing; the dermatologist decides what to open first.
"""

import numpy as np

from app.models import Capture, Case, Lesion

ACRAL_SITES = frozenset({"palm", "sole", "fingernail", "toenail"})
GROWTH_FLAG = 0.20  # relative area increase since the first visit
BORDER_FLAG = 0.05  # increase in perimeter² / (4π·area) since the first visit
# Ugly duckling: mean feature distance to the patient's other lesions at least this many times the
# median of the others' mean distances, and above an absolute floor (standardised units).
DUCKLING_RATIO = 1.6
DUCKLING_MIN_DISTANCE = 2.5
DUCKLING_MIN_LESIONS = 3


def _area_growth(first: Capture, latest: Capture) -> float | None:
    if not first.area_mm2 or not latest.area_mm2:
        return None
    return (latest.area_mm2 - first.area_mm2) / first.area_mm2


def _border(capture: Capture) -> float | None:
    return ((capture.result or {}).get("morphology") or {}).get("border_irregularity")


def attention_flags(case: Case) -> list[str]:
    latest = case.captures[-1] if case.captures else None
    if latest is None or latest.status != "processed":
        return []
    result = latest.result or {}
    flags = []
    acral = result.get("acral_model") or {}
    if case.lesion.body_site in ACRAL_SITES and acral.get("pattern") == "ridge":
        flags.append("ridge_pattern")
    history = sorted(
        (c for c in case.lesion.captures if c.status == "processed"), key=lambda c: c.captured_at
    )
    first = history[0] if history else None
    if first is not None and first.id != latest.id:
        growth = _area_growth(first, latest)
        if growth is not None and growth >= GROWTH_FLAG:
            flags.append("growing")
        before, now = _border(first), _border(latest)
        if before is not None and now is not None and now - before >= BORDER_FLAG:
            flags.append("border_change")
    if case.lesion.id in looks_different(case.lesion.patient.lesions):
        flags.append("looks_different")
    triage = result.get("triage_model")
    if triage is not None and triage.get("pattern") is None:
        flags.append("ai_unsure")
    return flags


def _latest_embedding(lesion: Lesion) -> np.ndarray | None:
    processed = [c for c in lesion.captures if c.status == "processed"]
    if not processed:
        return None
    latest = max(processed, key=lambda c: c.captured_at)
    vector = ((latest.result or {}).get("triage_model") or {}).get("embedding")
    return None if vector is None else np.array(vector)


def looks_different(lesions: list[Lesion]) -> set:
    """Ids of lesions that stand out from the same patient's other lesions."""
    vectors = {}
    for lesion in lesions:
        vector = _latest_embedding(lesion)
        if vector is not None:
            vectors[lesion.id] = vector
    if len(vectors) < DUCKLING_MIN_LESIONS:
        return set()
    mean_distance = {
        i: float(np.mean([np.linalg.norm(v - w) for j, w in vectors.items() if j != i]))
        for i, v in vectors.items()
    }
    flagged = set()
    for i, distance in mean_distance.items():
        others = float(np.median([d for j, d in mean_distance.items() if j != i]))
        if distance >= DUCKLING_MIN_DISTANCE and distance >= DUCKLING_RATIO * others:
            flagged.add(i)
    return flagged
