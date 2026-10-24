"""AI overview for dermatologists: model cards, live shadow-mode agreement, validation data.

Agreement and counts are computed live from the cases in the viewer's group. Every capture in this
prototype is simulated, so these numbers describe the demo system, not clinical performance.
"""

import json
from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import audit
from app.auth import Dermatologist, same_group
from app.db import get_session
from app.models import Case, Lesion, utcnow
from app.processing import acral_model, quality_model, triage_model
from app.schemas import AISummary, DataFlywheel, HeldOut, ModelSummary, ShadowAgreement

router = APIRouter(prefix="/ai", tags=["ai"])
SCOPE = (
    "Model metrics are on held-out simulated data. Agreement and counts are live from the cases "
    "in this prototype, whose captures are all simulated: they show the validation loop working, "
    "not clinical performance."
)
PATTERNS = ("pigmented", "vascular", "mixed")


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
    audit.record(session, user, "ai_summary", "case", "*")
    session.commit()
    return AISummary(
        computed_at=utcnow(),
        scope=SCOPE,
        models=_models(),
        shadow=_shadow(cases),
        data=_data(cases),
    )
