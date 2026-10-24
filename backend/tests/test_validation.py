import pytest

from app.api.validation import _ground_truth
from scripts.validation_report import write_report


@pytest.mark.parametrize("phantom_id", [None, "", "../etc/passwd", "a/b", "X" * 65, "UPPER"])
def test_ground_truth_lookup_rejects_untrusted_ids(phantom_id) -> None:
    assert _ground_truth(phantom_id) is None


def test_ground_truth_lookup_unknown_phantom_is_none() -> None:
    assert _ground_truth("no_such_phantom") is None


def test_report_is_stratified_by_tone_and_states_scope(tmp_path) -> None:
    report = write_report(tmp_path, repeats=1).read_text()
    for tone in ("light (III)", "medium (IV)", "dark (V)"):
        assert tone in report
    assert "synthetic phantoms only" in report
    assert "not** clinical performance" in report
    assert (tmp_path / "validation_maps_dark.png").is_file()
