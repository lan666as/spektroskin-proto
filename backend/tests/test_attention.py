"""Attention flags restate measured criteria on the lesion's captures."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS

from app.attention import attention_flags, looks_different

T0 = datetime(2026, 10, 1, tzinfo=UTC)


def _capture(i, day, area, border, triage="pigmented", acral=None, status="processed"):
    return NS(
        id=i,
        status=status,
        captured_at=T0 + timedelta(days=day),
        area_mm2=area,
        result={
            "morphology": {"border_irregularity": border},
            "triage_model": {"pattern": triage},
            "acral_model": {"pattern": acral} if acral else None,
        },
    )


def _case(site, history):
    lesion = NS(id="lesion", body_site=site, captures=history)
    lesion.patient = NS(lesions=[lesion])
    return NS(captures=[history[-1]], lesion=lesion)


def test_growing_acral_ridge_lesion_with_border_change() -> None:
    history = [_capture(1, 0, 18.0, 1.20), _capture(2, 30, 28.0, 1.30, acral="ridge")]
    assert attention_flags(_case("sole", history)) == ["ridge_pattern", "growing", "border_change"]


def test_stable_lesion_has_no_flags_and_ridge_needs_an_acral_site() -> None:
    history = [_capture(1, 0, 20.0, 1.20), _capture(2, 30, 21.0, 1.21, acral="ridge")]
    assert attention_flags(_case("forearm", history)) == []


def test_model_abstaining_is_flagged() -> None:
    assert attention_flags(_case("chest", [_capture(1, 0, 20.0, 1.2, triage=None)])) == [
        "ai_unsure"
    ]


def _lesion(i, embedding):
    capture = NS(
        status="processed", captured_at=T0, result={"triage_model": {"embedding": embedding}}
    )
    return NS(id=i, captures=[capture])


def test_ugly_duckling_needs_three_lesions_and_a_clear_outlier() -> None:
    moles = [_lesion("a", [0, 0]), _lesion("b", [1, 0]), _lesion("c", [0, 1])]
    assert looks_different(moles) == set()
    assert looks_different([*moles, _lesion("odd", [6, 6])]) == {"odd"}
    assert looks_different([moles[0], _lesion("odd", [6, 6])]) == set()
