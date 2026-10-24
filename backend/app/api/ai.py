"""AI overview for dermatologists: model cards, live shadow-mode agreement, validation data.

Agreement and counts are computed live from the cases in the viewer's group. Every capture in this
prototype is simulated, so these numbers describe the demo system, not clinical performance.
"""

import json
from collections import Counter
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.auth import Dermatologist, same_group
from app.db import get_session
from app.models import Capture, Case, Lesion, utcnow
from app.processing import acral_model, quality_model, triage_model
from app.schemas import (
    AISummary,
    DataFlywheel,
    HeldOut,
    LearningCase,
    ModelSummary,
    Monitoring,
    ShadowAgreement,
    ValidationRecord,
    ValidationSet,
)

router = APIRouter(prefix="/ai", tags=["ai"])
SCOPE = (
    "Model metrics are on held-out simulated data. Agreement and counts are live from the cases "
    "in this prototype, whose captures are all simulated: they show the validation loop working, "
    "not clinical performance."
)
PATTERNS = ("pigmented", "vascular", "mixed")
MONITORING_DAYS = 30


def _tone_accuracy(held_out: dict) -> dict[str, float]:
    return {tone: group["accuracy"] for tone, group in held_out["by_tone"].items()}


def _models() -> list[ModelSummary]:
    quality = json.loads(quality_model.MODEL_PATH.read_text())
    triage = json.loads(triage_model.MODEL_PATH.read_text())
    acral = json.loads(acral_model.MODEL_PATH.read_text())
    t = triage["metrics"]
    return [
        ModelSummary(
            name="Image quality",
            version=quality["version"],
            purpose="Second opinion on focus and glare beside the rule-based check",
            status="advisory",
            trained_at=quality["trained_at"],
            held_out=HeldOut(**{k: quality["metrics"]["held_out"][k] for k in ("accuracy", "n")}),
            model_card="docs/evidence/quality_model_card.md",
            by_tone=quality["metrics"]["held_out_by_tone"],
        ),
        ModelSummary(
            name="Lesion pattern triage",
            version=triage["version"],
            purpose="Pigment-dominant, vascular or mixed; abstains when unsure",
            status="research",
            trained_at=triage["trained_at"],
            held_out=HeldOut(
                **{
                    k: t["spectral"]["held_out"][k]
                    for k in ("accuracy", "coverage", "accuracy_when_answered", "n")
                }
            ),
            ablation={
                "rgb_only": t["rgb_only"]["held_out"]["accuracy"],
                "spectral": t["spectral"]["held_out"]["accuracy"],
            },
            model_card="docs/evidence/triage_model_card.md",
            by_tone=_tone_accuracy(t["spectral"]["held_out"]),
            ablation_by_tone={
                arm: _tone_accuracy(t[arm]["held_out"]) for arm in ("rgb_only", "spectral")
            },
        ),
        ModelSummary(
            name="Acral pattern",
            version=acral["version"],
            purpose="Pigment along furrows or ridges on palms, soles, nails; abstains when faint",
            status="research",
            trained_at=acral["trained_at"],
            held_out=HeldOut(
                **{
                    k: acral["metrics"]["held_out"][k]
                    for k in ("accuracy", "coverage", "accuracy_when_answered", "n")
                }
            ),
            model_card="docs/evidence/acral_model_card.md",
            by_tone=_tone_accuracy(acral["metrics"]["held_out"]),
        ),
    ]


def _shadow(cases: list[Case]) -> ShadowAgreement:
    confusion: dict[str, Counter] = {p: Counter() for p in (*PATTERNS, "unsure")}
    counts = Counter()
    for case in cases:
        review = case.review
        if review is None or review.pattern_read is None or not case.captures:
            continue
        opinion = (case.captures[-1].result or {}).get("triage_model") or {}
        model = opinion.get("pattern") or "abstained"
        blind = bool(review.ai_hidden)
        counts["reads"] += 1
        counts["blind_reads"] += blind
        confusion[review.pattern_read][model] += 1
        if review.pattern_read == "unsure":
            continue
        if model == "abstained":
            counts["model_abstained"] += 1
            continue
        counts["compared"] += 1
        counts["blind_compared"] += blind
        agreed = model == review.pattern_read
        counts["agreed"] += agreed
        counts["blind_agreed"] += blind and agreed
    return ShadowAgreement(
        **{k: counts[k] for k in ShadowAgreement.model_fields if k != "confusion"},
        confusion={read: dict(c) for read, c in confusion.items()},
    )


def _data(cases: list[Case]) -> DataFlywheel:
    reviewed = [c for c in cases if c.review]
    confirmed = [
        c
        for c in reviewed
        if c.outcome and c.outcome.histopathology in ("benign", "malignant", "indeterminate")
    ]
    return DataFlywheel(
        cases=len(cases),
        reviewed=len(reviewed),
        consented_reviewed=sum(c.lesion.patient.research_consent for c in reviewed),
        with_outcome=sum(c.outcome is not None for c in reviewed),
        histopathology_confirmed=len(confirmed),
        validation_eligible=sum(c.lesion.patient.research_consent for c in confirmed),
    )


def _monitoring(captures: list[Capture]) -> Monitoring:
    counts: Counter = Counter()
    patterns: Counter = Counter()
    for capture in captures:
        result = capture.result or {}
        passed = capture.status == "processed"
        counts["qc_passed"] += passed
        quality = result.get("quality_model")
        if quality is not None:
            counts["quality_disagreements"] += (quality["label"] == "good") != passed
        triage = result.get("triage_model")
        if triage is not None:
            counts["with_triage"] += 1
            counts["triage_out_of_range"] += bool(triage.get("out_of_distribution"))
            if triage.get("pattern"):
                patterns[triage["pattern"]] += 1
            else:
                counts["triage_abstained"] += 1
        counts["acral_ridge"] += (result.get("acral_model") or {}).get("pattern") == "ridge"
    return Monitoring(
        window_days=MONITORING_DAYS,
        captures=len(captures),
        patterns=dict(patterns),
        **{
            k: counts[k]
            for k in (
                "qc_passed",
                "quality_disagreements",
                "with_triage",
                "triage_abstained",
                "triage_out_of_range",
                "acral_ridge",
            )
        },
    )


def learning_queue(cases: list[Case], limit: int = 10) -> list[LearningCase]:
    queue = []
    for case in sorted(cases, key=lambda c: c.created_at, reverse=True):
        review = case.review
        if review is None or review.pattern_read in (None, "unsure") or not case.captures:
            continue
        triage = (case.captures[-1].result or {}).get("triage_model")
        if triage is None:
            continue
        model = triage.get("pattern")
        if model == review.pattern_read:
            continue
        queue.append(
            LearningCase(
                case_id=case.id,
                patient_code=case.lesion.patient.code,
                fitzpatrick=case.lesion.patient.fitzpatrick,
                reason="model_abstained" if model is None else "disagreement",
                dermatologist_read=review.pattern_read,
                model_pattern=model,
            )
        )
    return queue[:limit]


@router.get("/summary", response_model=AISummary)
def ai_summary(user: Dermatologist, session: Annotated[Session, Depends(get_session)]) -> AISummary:
    # ponytail: loads every case of the group per call; fine at demo scale, aggregate in SQL
    # (or a nightly table) before real volumes.
    cases = list(
        session.scalars(
            select(Case)
            .where(Case.created_by.in_(same_group(user)))
            .options(
                selectinload(Case.review),
                selectinload(Case.outcome),
                selectinload(Case.captures),
                selectinload(Case.lesion).selectinload(Lesion.patient),
            )
        )
    )
    recent = list(
        session.scalars(
            select(Capture).where(
                Capture.created_by.in_(same_group(user)),
                Capture.created_at >= utcnow() - timedelta(days=MONITORING_DAYS),
            )
        )
    )
    audit.record(session, user, "ai_summary", "case", "*")
    session.commit()
    return AISummary(
        computed_at=utcnow(),
        scope=SCOPE,
        models=_models(),
        shadow=_shadow(cases),
        data=_data(cases),
        monitoring=_monitoring(recent),
        learning_queue=learning_queue(cases),
    )


PURPOSE = (
    "Validation of SpektroSkin assistance models on consented, dermatologist-reviewed, "
    "histopathology-confirmed cases. Research use only, under the consent each patient gave."
)


def _age_band(age: int) -> str:
    low = age // 10 * 10
    return f"{low}-{low + 9}"


def validation_records(cases: list[Case]) -> list[ValidationRecord]:
    records = []
    for case in cases:
        outcome, review, patient = case.outcome, case.review, case.lesion.patient
        if not (patient.research_consent and review and outcome and case.captures):
            continue
        if outcome.histopathology not in ("benign", "malignant", "indeterminate"):
            continue
        triage = (case.captures[-1].result or {}).get("triage_model") or {}
        records.append(
            ValidationRecord(
                case_id=case.id,
                capture_ids=[c.id for c in case.captures],
                simulated=all(c.device_type == "virtual" for c in case.captures),
                age_band=_age_band(patient.age),
                sex=patient.sex,
                fitzpatrick=patient.fitzpatrick,
                body_site=case.lesion.body_site,
                dermatologist_action=review.action,
                dermatologist_pattern_read=review.pattern_read,
                histopathology=outcome.histopathology,
                model_pattern=triage.get("pattern"),
            )
        )
    return records


@router.get("/validation-set", response_model=ValidationSet)
def validation_set(
    user: Dermatologist, session: Annotated[Session, Depends(get_session)]
) -> ValidationSet:
    """Export for model validation: eligible cases only, minimum fields, audited."""
    cases = list(
        session.scalars(
            select(Case)
            .where(Case.created_by.in_(same_group(user)))
            .options(
                selectinload(Case.review),
                selectinload(Case.outcome),
                selectinload(Case.captures),
                selectinload(Case.lesion).selectinload(Lesion.patient),
            )
        )
    )
    records = validation_records(cases)
    audit.record(session, user, "export_validation_set", "case", f"{len(records)} records")
    session.commit()
    return ValidationSet(generated_at=utcnow(), purpose=PURPOSE, records=records)
