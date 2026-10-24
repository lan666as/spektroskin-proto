"""ORM → response schemas. Image URLs are signed for the viewing user."""

from datetime import date, timedelta

from app.auth import sign_image_url
from app.models import Capture, Case, Lesion, Outcome, User
from app.schemas import (
    CaptureOut,
    CaseDetail,
    CaseSummary,
    LesionOut,
    OutcomeOut,
    PatientOut,
    QCOut,
    ReviewOut,
)


def lesion_out(lesion: Lesion, viewer: User | None = None) -> LesionOut:
    captures = lesion.captures
    processed = [c for c in captures if c.status == "processed"]
    return LesionOut(
        id=lesion.id,
        patient_id=lesion.patient_id,
        body_site=lesion.body_site,
        laterality=lesion.laterality,
        created_at=lesion.created_at,
        capture_count=len(captures),
        last_captured_at=captures[-1].captured_at if captures else None,
        latest_thumbnail_url=sign_image_url(processed[-1].id, "standard", viewer.id)
        if viewer and processed
        else None,
    )


def capture_out(capture: Capture, viewer: User) -> CaptureOut:
    return CaptureOut(
        id=capture.id,
        lesion_id=capture.lesion_id,
        captured_at=capture.captured_at,
        status=capture.status,
        device_type=capture.device_type,
        device_id=capture.device_id,
        phantom_id=capture.phantom_id,
        simulated=capture.device_type == "virtual",
        qc=QCOut(**capture.qc),
        area_mm2=capture.area_mm2,
        views={
            name: sign_image_url(capture.id, name, viewer.id) for name in capture.result["views"]
        },
        spectral_signature=capture.result.get("signature"),
        diameter_mm=(capture.result.get("measurements") or {}).get("diameter_mm"),
        width_mm=(capture.result.get("measurements") or {}).get("width_mm"),
        quality_model=capture.result.get("quality_model"),
        triage_model=capture.result.get("triage_model"),
        morphology=capture.result.get("morphology"),
        registration_shift_px=capture.result.get("registration_shift_px"),
        gain_correction=capture.result.get("gain_correction"),
    )


def case_summary(case: Case, viewer: User, requested_by: str) -> CaseSummary:
    latest = case.captures[-1] if case.captures else None
    return CaseSummary(
        id=case.id,
        status=case.status,
        question=case.question,
        created_at=case.created_at,
        updated_at=case.updated_at,
        answered_at=case.answered_at,
        requested_by=requested_by,
        patient=PatientOut.model_validate(case.lesion.patient),
        lesion=lesion_out(case.lesion),
        thumbnail_url=sign_image_url(latest.id, "standard", viewer.id) if latest else None,
        review_action=case.review.action if case.review else None,
        follow_up_due=follow_up_due(case),
        outcome_action=case.outcome.action_taken if case.outcome else None,
        histopathology=case.outcome.histopathology if case.outcome else None,
    )


def follow_up_due(case: Case) -> date | None:
    review = case.review
    if review is None or review.follow_up_days is None or case.answered_at is None:
        return None
    return case.answered_at.date() + timedelta(days=review.follow_up_days)


def case_detail(case: Case, viewer: User, requested_by: str) -> CaseDetail:
    review = case.review
    return CaseDetail(
        **case_summary(case, viewer, requested_by).model_dump(),
        captures=[capture_out(c, viewer) for c in case.captures],
        lesion_history=[
            capture_out(c, viewer) for c in case.lesion.captures if c.status == "processed"
        ],
        review=ReviewOut(
            id=review.id,
            reviewer_name=review.reviewer.display_name,
            impression=review.impression,
            action=review.action,
            follow_up_days=review.follow_up_days,
            notes=review.notes,
            created_at=review.created_at,
        )
        if review
        else None,
        outcome=outcome_out(case.outcome) if case.outcome else None,
    )


def outcome_out(outcome: Outcome) -> OutcomeOut:
    return OutcomeOut(
        action_taken=outcome.action_taken,
        procedure_date=outcome.procedure_date,
        histopathology=outcome.histopathology,
        histopathology_notes=outcome.histopathology_notes,
        recorded_by_name=outcome.recorder.display_name,
        recorded_at=outcome.recorded_at,
        updated_at=outcome.updated_at,
    )
