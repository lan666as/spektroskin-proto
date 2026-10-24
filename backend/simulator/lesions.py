"""Per-lesion simulated identities, so every capture of a lesion looks like the same lesion.

The phantom id encodes everything needed to rebuild the ground truth (for validation):
`gen-<lesion hash>-<tone initial><acral 0/1>-d<day>[-blur|-glare]`. The lesion hash fixes the
pattern, size, shape and growth rate; the day since the lesion's first capture sets the size of a
growing lesion. Noise and hand motion differ per capture (the `repeat` draw), as on a real device.
"""

import hashlib
import random
import re

from app.attention import ACRAL_SITES
from simulator.phantoms import PhantomSpec, catalogue

TONE_BY_FITZPATRICK = {"I": "light", "II": "light", "III": "light", "IV": "medium"}
_GEN_ID = re.compile(r"^gen-([0-9a-f]{8})-([lmd])([01])-d(\d{3})(?:-(blur|glare))?$")
_TONES = {"l": "light", "m": "medium", "d": "dark"}
MAX_AREA_MM2 = 60.0


def lesion_hash(lesion_id: object) -> str:
    return hashlib.sha256(str(lesion_id).encode()).hexdigest()[:8]


def generated_id(lesion_id: object, fitzpatrick: str, body_site: str, day: int, variant=None):
    tone = TONE_BY_FITZPATRICK.get(fitzpatrick, "dark")
    acral = int(body_site in ACRAL_SITES)
    suffix = f"-{variant}" if variant else ""
    return f"gen-{lesion_hash(lesion_id)}-{tone[0]}{acral}-d{min(day, 999):03d}{suffix}"


def spec_from_id(phantom_id: str) -> PhantomSpec | None:
    """Rebuild the spec of a generated phantom id; None if the id is not one."""
    match = _GEN_ID.match(phantom_id)
    if not match:
        return None
    lesion, tone_key, acral, day, variant = match.groups()
    rng = random.Random(lesion)
    acral_site = acral == "1"
    weights = (0.7, 0.1, 0.2) if acral_site else (0.45, 0.3, 0.25)
    pattern = rng.choices(("pigmented", "vascular", "mixed"), weights)[0]
    base_area = rng.uniform(10.0, 26.0)
    growth_per_day = 0.0 if rng.random() < 0.5 else rng.uniform(0.008, 0.02)
    pigment = {"pigmented": rng.uniform(0.9, 1.8), "mixed": rng.uniform(0.7, 1.2)}.get(pattern)
    vascular = {"vascular": rng.uniform(0.45, 0.85), "mixed": rng.uniform(0.35, 0.6)}.get(pattern)
    tone = _TONES[tone_key]
    acral_pattern = "ridge" if rng.random() < 0.35 else "furrow"
    acral_modulation = rng.uniform(0.1, 0.35)
    return PhantomSpec(
        id=phantom_id,
        lesion=pattern,
        tone=tone,
        acral=acral_site,
        area_mm2=min(base_area * (1 + growth_per_day * int(day)), MAX_AREA_MM2),
        variant=variant,
        shape_seed=f"gen-{lesion}",
        description=f"Simulated {pattern} lesion, {tone} skin, day {int(day)}",
        pigment_amplitude=pigment,
        vascular_amplitude=vascular,
        acral_pattern=acral_pattern,
        acral_modulation=acral_modulation,
    )


def next_in_series(phantom_id: str) -> PhantomSpec | None:
    """For a catalogue growth series (same shape, growing area), the visit after this one; the
    last visit repeats. None if the phantom is not part of a series."""
    by_id = {s.id: s for s in catalogue()}
    current = by_id.get(phantom_id)
    if current is None or current.shape_seed is None or current.variant:
        return None
    series = sorted(
        (s for s in by_id.values() if s.shape_seed == current.shape_seed and not s.variant),
        key=lambda s: s.area_mm2,
    )
    if len(series) < 2:
        return None
    index = series.index(current)
    return series[min(index + 1, len(series) - 1)]
