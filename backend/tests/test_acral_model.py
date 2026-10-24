"""Acral pattern model reads furrow vs ridge on the named acral phantoms."""

import pytest

from app.processing import run
from simulator.device import capture, factory_profile
from simulator.phantoms import PhantomSpec, ground_truth, spec_by_id

PROFILE = factory_profile()


@pytest.mark.parametrize(
    ("phantom_id", "expected"),
    [("acral_dark_d01", "furrow"), ("acral_dark_d30", "furrow"), ("acral_ridge_dark", "ridge")],
)
def test_reads_the_simulated_pattern(phantom_id: str, expected: str) -> None:
    spec = spec_by_id(phantom_id)
    opinion = run(capture(spec, ground_truth(spec)), PROFILE).acral_model
    assert opinion["pattern"] == expected
    assert set(opinion["probabilities"]) == {"furrow", "ridge"}


def test_no_reading_without_pigment() -> None:
    spec = PhantomSpec("acral_vascular_probe", "vascular", "dark", acral=True)
    assert run(capture(spec, ground_truth(spec)), PROFILE).acral_model is None
