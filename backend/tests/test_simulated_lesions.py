"""Generated lesions keep their identity across captures and rebuild from their id."""

import uuid

from app.processing import run
from simulator.device import capture, factory_profile
from simulator.lesions import generated_id, next_in_series, spec_from_id
from simulator.phantoms import ground_truth

LESION = uuid.UUID("00000000-0000-4000-8000-000000000001")


def test_id_round_trips_and_keeps_identity_across_days() -> None:
    day0 = spec_from_id(generated_id(LESION, "V", "sole", 0))
    day30 = spec_from_id(generated_id(LESION, "V", "sole", 30))
    assert day0.tone == "dark" and day0.acral
    assert (day0.lesion, day0.shape_seed) == (day30.lesion, day30.shape_seed)
    assert day30.area_mm2 >= day0.area_mm2


def test_repeat_captures_differ_but_measure_alike() -> None:
    spec = spec_from_id(generated_id(LESION, "III", "forearm", 0))
    gt = ground_truth(spec)
    a, b = (run(capture(spec, gt, repeat=r), factory_profile()) for r in (1, 2))
    assert a.qc.passed and b.qc.passed
    assert abs(a.area_mm2 - b.area_mm2) / a.area_mm2 < 0.08


def test_bad_variant_fails_qc() -> None:
    spec = spec_from_id(generated_id(LESION, "IV", "chest", 3, "glare"))
    result = run(capture(spec, ground_truth(spec), repeat=5), factory_profile())
    assert not result.qc.passed


def test_growth_series_advances_and_stops_at_the_last_visit() -> None:
    assert next_in_series("acral_dark_d01").id == "acral_dark_d14"
    assert next_in_series("acral_dark_d30").id == "acral_dark_d30"
    assert next_in_series("pigmented_light") is None
