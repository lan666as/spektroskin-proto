"""Pipeline recovers simulator ground truth; QC rejects bad captures (CLAUDE.md §6)."""

import json

import numpy as np
import pytest

from app.processing import ProcessingResult, run
from app.processing.frameio import decode_png16, encode_png16
from app.processing.validation import compare
from simulator import generate
from simulator.device import capture, factory_profile
from simulator.phantoms import catalogue, ground_truth, spec_by_id

CLEAN = [s.id for s in catalogue() if s.variant is None]
PROFILE = factory_profile()


def _run(phantom_id: str) -> tuple[ProcessingResult, object, dict]:
    spec = spec_by_id(phantom_id)
    gt = ground_truth(spec)
    frame_set = capture(spec, gt)
    return run(frame_set, PROFILE), gt, frame_set.meta


@pytest.mark.parametrize("phantom_id", CLEAN)
def test_clean_phantom_passes_qc_and_recovers_ground_truth(phantom_id: str) -> None:
    result, gt, _ = _run(phantom_id)
    assert result.qc.passed, result.qc
    m = compare(result.melanin, result.hemoglobin, result.mask, gt.melanin, gt.hemoglobin, gt.mask)
    assert m["melanin_r"] >= 0.95
    assert m["hemoglobin_r"] >= 0.95
    assert m["melanin_rmse"] <= 0.06
    assert m["hemoglobin_rmse"] <= 0.03
    assert m["mask_dice"] >= 0.93
    assert abs(m["area_error_pct"]) <= 10.0
    assert set(result.views) == {"standard", "pigment", "vascular"}


@pytest.mark.parametrize("phantom_id", CLEAN)
def test_registration_recovers_hand_motion(phantom_id: str) -> None:
    result, _, meta = _run(phantom_id)
    for band, true_shift in meta["true_shift_px"].items():
        # The estimate is the correction, i.e. the negative of the simulated motion.
        assert np.allclose(result.shifts_px[band], -np.array(true_shift), atol=0.5)


def test_qc_rejects_blur_with_guidance() -> None:
    result, _, _ = _run("pigmented_dark_blur")
    assert not result.qc.passed
    assert result.qc.checks["sharp"] is False
    assert any("not sharp" in g for g in result.qc.guidance)
    assert set(result.views) == {"standard"}
    assert result.area_mm2 is None


def test_qc_rejects_glare_with_guidance() -> None:
    result, _, _ = _run("pigmented_dark_glare")
    assert not result.qc.passed
    assert result.qc.checks["no_glare"] is False
    assert any("Glare" in g for g in result.qc.guidance)


def test_growth_series_area_increases_and_tracks_truth() -> None:
    areas = []
    for pid in ("acral_dark_d01", "acral_dark_d14", "acral_dark_d30"):
        result, gt, _ = _run(pid)
        assert abs(result.area_mm2 - gt.area_mm2) / gt.area_mm2 <= 0.10
        areas.append(result.area_mm2)
    assert areas[0] < areas[1] < areas[2]


def test_summary_is_json_serializable() -> None:
    result, _, _ = _run("mixed_medium")
    summary = json.loads(json.dumps(result.summary()))
    assert summary["qc"]["passed"] is True
    assert summary["area_mm2"] > 0


def test_png16_round_trip_is_lossless() -> None:
    frame = np.random.default_rng(0).integers(0, 65535, size=(256, 256), dtype=np.uint16)
    assert np.array_equal(decode_png16(encode_png16(frame), (256, 256)), frame)


def test_generator_bundles_frames_but_never_ground_truth(tmp_path) -> None:
    out, mobile = tmp_path / "out", tmp_path / "mobile"
    (mobile / "src" / "device").mkdir(parents=True)
    generate.generate(out)
    generate.export_to_mobile(mobile, out)
    bundled = {p.name for p in (mobile / "assets" / "phantoms").rglob("*") if p.is_file()}
    assert bundled == {"blue.png", "green.png", "red.png", "nir.png", "dark.png", "meta.json"}
    index = (mobile / "src" / "device" / "phantoms.generated.ts").read_text()
    assert "acral_dark_d30" in index and "npz" not in index
