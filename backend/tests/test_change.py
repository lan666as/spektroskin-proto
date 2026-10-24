"""Change since the first visit: growth shows as new area after registering the two visits."""

from app.processing import render
from app.processing.change import change_since
from app.processing.pipeline import measure
from simulator.device import capture, factory_profile
from simulator.phantoms import ground_truth, spec_by_id

PROFILE = factory_profile()


def _measure(phantom_id: str, repeat: int):
    spec = spec_by_id(phantom_id)
    return measure(capture(spec, ground_truth(spec), repeat=repeat), PROFILE)


def test_growth_series_shows_new_area_and_keeps_the_old_outline() -> None:
    first, now = _measure("acral_dark_d01", 1), _measure("acral_dark_d30", 2)
    image, stats = change_since(
        first.reflectance,
        first.mask,
        now.reflectance,
        now.mask,
        render.standard_view(now.reflectance),
    )
    assert image.shape == (*now.mask.shape, 3)
    # Day 01 → Day 30 grows by about 10 mm² (18 → 28 mm²) and keeps covering the old outline.
    assert 7.0 < stats["new_area_mm2"] < 13.0
    assert stats["overlap_fraction"] > 0.95


def test_same_lesion_again_shows_almost_no_change() -> None:
    a, b = _measure("pigmented_dark", 3), _measure("pigmented_dark", 4)
    _, stats = change_since(
        a.reflectance, a.mask, b.reflectance, b.mask, render.standard_view(b.reflectance)
    )
    assert stats["new_area_mm2"] < 1.5 and stats["no_longer_covered_mm2"] < 1.5
