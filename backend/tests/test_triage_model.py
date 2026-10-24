"""Triage model: suggests the simulator's pattern on the named demo phantoms, never a malignancy."""

import pytest

from app.processing import run
from simulator.device import capture, factory_profile
from simulator.phantoms import ground_truth, spec_by_id

PROFILE = factory_profile()


@pytest.mark.parametrize(
    "phantom_id",
    [
        "pigmented_light",
        "pigmented_dark",
        "vascular_medium",
        "vascular_dark",
        "mixed_light",
        "acral_dark_d30",
    ],
)
def test_suggests_the_generating_pattern(phantom_id: str) -> None:
    spec = spec_by_id(phantom_id)
    opinion = run(capture(spec, ground_truth(spec)), PROFILE).triage_model
    assert opinion["pattern"] in (spec.lesion, None)
    assert max(opinion["probabilities"], key=opinion["probabilities"].get) == spec.lesion
    assert set(opinion["probabilities"]) == {"pigmented", "vascular", "mixed"}


def test_no_opinion_without_an_outline() -> None:
    spec = spec_by_id("pigmented_dark_glare")
    assert run(capture(spec, ground_truth(spec)), PROFILE).triage_model is None


def test_explains_with_the_expected_chromophores() -> None:
    spec = spec_by_id("vascular_dark")
    opinion = run(capture(spec, ground_truth(spec)), PROFILE).triage_model
    top = {d["feature"]: d for d in opinion["drivers"]}
    assert top["blood excess"]["level"] == "high" and top["blood excess"]["contribution"] > 0


def test_growth_series_border_becomes_less_regular() -> None:
    def border(phantom_id: str) -> float:
        spec = spec_by_id(phantom_id)
        return run(capture(spec, ground_truth(spec)), PROFILE).morphology["border_irregularity"]

    assert border("acral_dark_d01") < border("acral_dark_d30")
