"""Learned quality model: weights load and it agrees with the known capture condition."""

import pytest

from app.processing.quality_model import CLASSES, FEATURE_NAMES, _weights, predict
from simulator.device import capture, factory_profile
from simulator.phantoms import ground_truth, spec_by_id

PROFILE = factory_profile()


def test_weights_match_feature_layout() -> None:
    w = _weights()
    assert w["classes"] == list(CLASSES)
    assert w["feature_names"] == list(FEATURE_NAMES)
    assert len(w["coef"]) == len(CLASSES)
    assert all(len(row) == len(FEATURE_NAMES) for row in w["coef"])
    assert 0 < w["metrics"]["held_out"]["accuracy"] <= 1


@pytest.mark.parametrize(
    ("phantom_id", "expected"),
    [
        ("pigmented_light", "good"),
        ("mixed_dark", "good"),
        ("pigmented_dark_blur", "blurry"),
        ("pigmented_dark_glare", "glare"),
    ],
)
def test_predicts_capture_condition(phantom_id: str, expected: str) -> None:
    spec = spec_by_id(phantom_id)
    opinion = predict(capture(spec, ground_truth(spec)), PROFILE)
    assert opinion["label"] == expected
    assert abs(sum(opinion["probabilities"].values()) - 1) < 1e-3


def test_recognises_heavy_sensor_noise() -> None:
    spec = spec_by_id("pigmented_medium")
    assert (
        predict(capture(spec, ground_truth(spec), repeat=2, noise_scale=8.0), PROFILE)["label"]
        == "noisy"
    )
