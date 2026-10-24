"""Published checklists scored on the phantoms: formula, applicability, the acral ridge case."""

from app.processing import run
from simulator.device import capture, factory_profile
from simulator.phantoms import ground_truth, spec_by_id

PROFILE = factory_profile()


def _checklists(phantom_id: str) -> dict:
    spec = spec_by_id(phantom_id)
    return run(capture(spec, ground_truth(spec)), PROFILE).checklists


def test_tds_follows_the_published_formula() -> None:
    abcd = _checklists("acral_dark_d30")["abcd"]
    c, d = len(abcd["colours"]), len(abcd["structures"])
    expected = (
        1.3 * abcd["asymmetry_axes"] + 0.1 * abcd["abrupt_border_segments"] + 0.5 * c + 0.5 * d
    )
    assert abs(abcd["tds"] - expected) < 0.01
    assert abcd["category"] == (
        "benign"
        if abcd["tds"] < 4.75
        else "suspicious"
        if abcd["tds"] <= 5.45
        else "highly_suspicious"
    )


def test_not_applied_to_a_vascular_lesion() -> None:
    assert _checklists("vascular_dark") == {
        "applicable": False,
        "reason": "not pigmented (non-melanocytic pattern)",
    }


def test_acral_ridge_pattern_meets_braaff() -> None:
    braaff = _checklists("acral_ridge_dark")["braaff"]
    assert braaff["items"]["ridge_pattern"] == 3 and braaff["suspicious"] is True
    assert _checklists("acral_dark_d01")["braaff"]["items"]["parallel_furrow_pattern"] == -1
