from dataclasses import replace

from app.processing import render
from app.processing.acral_model import predict as acral_opinion
from app.processing.calibration import calibrate
from app.processing.qc import run_qc
from app.processing.quality_model import predict as quality_opinion
from app.processing.registration import register
from app.processing.segmentation import measurements, morphology, segment
from app.processing.signature import spectral_signature
from app.processing.spectral import unmix
from app.processing.triage_model import predict as triage_opinion
from app.processing.types import DeviceProfile, FrameSet, ProcessingResult


def run(frame_set: FrameSet, device_profile: DeviceProfile) -> ProcessingResult:
    """measure(), then the learned models' advisory opinions. None gates or changes a
    measurement: the quality model sits beside the rule-based QC; the triage and acral pattern
    models (research mode) suggest patterns for the dermatologist."""
    result = measure(frame_set, device_profile)
    measured = result.mask is not None
    return replace(
        result,
        quality_model=quality_opinion(frame_set, device_profile),
        triage_model=triage_opinion(
            result.reflectance, result.melanin, result.hemoglobin, result.mask
        )
        if measured
        else None,
        acral_model=acral_opinion(result.reflectance, result.melanin, result.mask)
        if measured
        else None,
    )


def measure(frame_set: FrameSet, device_profile: DeviceProfile) -> ProcessingResult:
    """QC → calibration → registration → spectral maps → segmentation. Deterministic; no ML.

    Calibration runs before registration because flat-field and reference patches live in
    sensor coordinates, while hand motion shifts only the skin.
    """
    qc = run_qc(frame_set, device_profile)
    reflectance, gains = calibrate(frame_set, device_profile)
    aligned, shifts = register(reflectance)
    standard = render.mask_spacer(render.standard_view(aligned))
    if not qc.passed:
        return ProcessingResult(
            qc=qc,
            views={"standard": standard},
            shifts_px=shifts,
            gain_correction=gains,
        )

    melanin, hemoglobin = unmix(aligned)
    mask, area_mm2 = segment(melanin, hemoglobin)
    views = {
        "standard": render.with_outline(standard, mask),
        "pigment": render.with_outline(render.mask_spacer(render.pigment_view(melanin)), mask),
        "vascular": render.with_outline(render.mask_spacer(render.vascular_view(hemoglobin)), mask),
    }
    return ProcessingResult(
        qc=qc,
        views=views,
        melanin=melanin,
        hemoglobin=hemoglobin,
        mask=mask,
        area_mm2=area_mm2,
        signature=spectral_signature(aligned, melanin, hemoglobin, mask),
        measurements=measurements(mask),
        morphology=morphology(mask, melanin, hemoglobin),
        reflectance=aligned,
        shifts_px=shifts,
        gain_correction=gains,
    )
