"""Shadow-mode agreement and validation-data counts from reviewed cases."""

from types import SimpleNamespace as NS

from app.api.ai import _data, _models, _shadow


def _case(read, model_pattern, blind=False, consent=True, histo=None):
    return NS(
        review=NS(pattern_read=read, ai_hidden=blind) if read is not None else None,
        captures=[NS(result={"triage_model": {"pattern": model_pattern}})],
        outcome=NS(histopathology=histo) if histo else None,
        lesion=NS(patient=NS(research_consent=consent)),
    )


def test_agreement_counts_abstentions_and_blind_reads_separately() -> None:
    cases = [
        _case("pigmented", "pigmented", blind=True),
        _case("pigmented", "mixed"),
        _case("vascular", None),
        _case("unsure", "mixed"),
        _case(None, "pigmented"),
    ]
    s = _shadow(cases)
    assert (s.reads, s.compared, s.agreed, s.model_abstained) == (4, 2, 1, 1)
    assert (s.blind_reads, s.blind_compared, s.blind_agreed) == (1, 1, 1)
    assert s.confusion["vascular"] == {"abstained": 1}


def test_only_consented_confirmed_cases_are_validation_eligible() -> None:
    cases = [
        _case("pigmented", "pigmented", histo="benign"),
        _case("mixed", "mixed", consent=False, histo="malignant"),
        _case("vascular", "vascular", histo="pending"),
        _case(None, None),
    ]
    d = _data(cases)
    assert (d.reviewed, d.with_outcome, d.histopathology_confirmed) == (3, 3, 2)
    assert d.validation_eligible == 1


def test_model_cards_load() -> None:
    names = [m.name for m in _models()]
    assert names == ["Image quality", "Lesion pattern triage", "Acral pattern"]


def test_monitoring_counts_disagreements_abstentions_and_out_of_range() -> None:
    from app.api.ai import _monitoring

    def capture(status, quality, pattern, ood=False, acral=None, site="sole"):
        return NS(
            status=status,
            lesion=NS(body_site=site),
            result={
                "quality_model": {"label": quality},
                "triage_model": {"pattern": pattern, "out_of_distribution": ood},
                "acral_model": {"pattern": acral} if acral else None,
            },
        )

    m = _monitoring(
        [
            capture("processed", "good", "pigmented", acral="ridge"),
            capture("processed", "noisy", None, ood=True),
            capture("qc_failed", "glare", None),
            capture("processed", "good", "pigmented", acral="ridge", site="forearm"),
        ]
    )
    assert (m.captures, m.qc_passed, m.quality_disagreements) == (4, 3, 1)
    assert (m.triage_abstained, m.triage_out_of_range, m.acral_ridge) == (2, 1, 1)
    assert m.patterns == {"pigmented": 2}


def test_validation_export_keeps_only_eligible_cases_and_minimum_fields() -> None:
    import uuid

    from app.api.ai import validation_records

    def case(consent, histo, age=57):
        return NS(
            id=uuid.uuid4(),
            outcome=NS(histopathology=histo),
            review=NS(action="biopsy", pattern_read="pigmented"),
            lesion=NS(
                body_site="sole",
                patient=NS(research_consent=consent, age=age, sex="female", fitzpatrick="V"),
            ),
            captures=[
                NS(
                    id=uuid.uuid4(),
                    device_type="virtual",
                    result={"triage_model": {"pattern": "pigmented"}},
                )
            ],
        )

    records = validation_records(
        [case(True, "benign"), case(False, "malignant"), case(True, "pending")]
    )
    assert len(records) == 1
    record = records[0].model_dump()
    assert record["age_band"] == "50-59" and record["simulated"] is True
    assert not {"code", "patient_code", "age", "notes", "impression"} & set(record)


def test_learning_queue_lists_disagreements_and_abstentions_newest_first() -> None:
    import uuid
    from datetime import UTC, datetime, timedelta

    from app.api.ai import learning_queue

    t0 = datetime(2026, 10, 1, tzinfo=UTC)

    def case(read, model, day):
        c = _case(read, model)
        c.id, c.created_at = uuid.UUID(int=day), t0 + timedelta(days=day)
        c.lesion.patient.code, c.lesion.patient.fitzpatrick = f"PT-{day:04d}", "V"
        return c

    queue = learning_queue(
        [
            case("pigmented", "pigmented", 1),
            case("pigmented", "mixed", 2),
            case("vascular", None, 3),
            case("unsure", "mixed", 4),
        ]
    )
    assert [(q.patient_code, q.reason) for q in queue] == [
        ("PT-0003", "model_abstained"),
        ("PT-0002", "disagreement"),
    ]
