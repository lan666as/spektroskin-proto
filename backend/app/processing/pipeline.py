from app.processing import render
from app.processing.calibration import calibrate
from app.processing.qc import run_qc
from app.processing.registration import register
from app.processing.segmentation import measurements, segment
from app.processing.signature import spectral_signature
from app.processing.spectral import unmix
from app.processing.types import DeviceProfile, FrameSet, ProcessingResult


def run(frame_set: FrameSet, device_profile: DeviceProfile) -> ProcessingResult:
    """QC → calibration → registration → spectral maps → segmentation.

    Calibration runs before registration because flat-field and reference patches live in
    sensor coordinates, while hand motion shifts only the skin. Deterministic; no ML.
    """
    qc = run_qc(frame_set, device_profile)
    reflectance, gains = calibrate(frame_set, device_profile)
    aligned, shifts = register(reflectance)
    standard = render.mask_spacer(render.standard_view(aligned))
    if not qc.passed:
        return ProcessingResult(
            qc=qc, views={"standard": standard}, shifts_px=shifts, gain_correction=gains
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
        shifts_px=shifts,
        gain_correction=gains,
    )
