import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Role = Literal["clinician", "dermatologist"]
Sex = Literal["female", "male"]
Fitzpatrick = Literal["I", "II", "III", "IV", "V", "VI"]
BodySite = Literal[
    "face",
    "scalp",
    "neck",
    "chest",
    "abdomen",
    "upper_back",
    "lower_back",
    "upper_arm",
    "forearm",
    "palm",
    "hand_dorsum",
    "thigh",
    "lower_leg",
    "sole",
    "foot_dorsum",
    "fingernail",
    "toenail",
    "genital",
    "other",
]
Laterality = Literal["left", "right", "midline"]
CaptureStatus = Literal["processed", "qc_failed"]
CaseStatus = Literal["submitted", "in_review", "answered"]
ReviewAction = Literal["observe", "biopsy", "refer"]
OutcomeAction = Literal["observed", "biopsied", "excised", "referred", "declined"]
Histopathology = Literal["pending", "benign", "malignant", "indeterminate"]
PatternRead = Literal["pigmented", "vascular", "mixed", "unsure"]
AttentionFlag = Literal["ridge_pattern", "growing", "border_change", "ai_unsure"]
ViewName = Literal["standard", "pigment", "vascular", "evidence"]

PatientCode = Annotated[str, StringConstraints(pattern=r"^PT-\d{4}$")]
Text2000 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ORM):
    id: uuid.UUID
    username: str
    display_name: str
    role: Role


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class PatientCreate(BaseModel):
    code: PatientCode
    age: int = Field(ge=0, le=120)
    sex: Sex
    fitzpatrick: Fitzpatrick
    research_consent: bool = Field(
        default=False, description="Patient consented to research use of their images"
    )


class PatientOut(ORM):
    id: uuid.UUID
    code: str
    age: int
    sex: Sex
    fitzpatrick: Fitzpatrick
    research_consent: bool
    created_at: datetime


class LesionCreate(BaseModel):
    patient_id: uuid.UUID
    body_site: BodySite
    laterality: Laterality | None = None


class LesionOut(ORM):
    id: uuid.UUID
    patient_id: uuid.UUID
    body_site: BodySite
    laterality: Laterality | None
    created_at: datetime
    capture_count: int = 0
    last_captured_at: datetime | None = None
    latest_thumbnail_url: str | None = Field(
        default=None, description="Signed standard view of the latest processed visit"
    )


class PatientListItem(PatientOut):
    lesion_count: int = 0
    last_visit_at: datetime | None = None
    latest_thumbnail_url: str | None = Field(
        default=None, description="Signed standard view of the patient's most recent visit"
    )


class PatientDetail(PatientOut):
    lesions: list[LesionOut]


class QCOut(BaseModel):
    passed: bool
    metrics: dict[str, float]
    checks: dict[str, bool]
    guidance: list[str]


class ChromophoreContrast(BaseModel):
    lesion: float
    skin: float


class SpectralSignature(BaseModel):
    bands_nm: list[int]
    lesion: list[float] = Field(description="Mean calibrated reflectance per band in the lesion")
    skin: list[float] = Field(description="Mean reflectance per band in surrounding skin")
    melanin: ChromophoreContrast
    hemoglobin: ChromophoreContrast


class QualityOpinion(BaseModel):
    """Advisory output of the learned image-quality model; the rule-based QC decides."""

    model: str
    label: Literal["good", "blurry", "glare"]
    probabilities: dict[str, float]
    held_out_accuracy: float = Field(
        description="Accuracy on held-out synthetic phantoms (docs/evidence/quality_model_card.md)"
    )


class TriageDriver(BaseModel):
    feature: str
    level: Literal["high", "low"] = Field(description="Value relative to the training average")
    contribution: float = Field(description="> 0 supports the suggested pattern")


class Morphology(BaseModel):
    asymmetry: float = Field(
        description="Non-overlapping area with the mirror image (0 = symmetric)"
    )
    border_irregularity: float = Field(description="perimeter² / (4π·area); 1 = circle")
    pigment_variation: float | None = Field(
        description="Coefficient of variation of melanin excess; null when barely pigmented"
    )
    vessel_focality: float = Field(description="99th percentile / median blood level in the lesion")


class TriageOpinion(BaseModel):
    """Research-mode lesion-pattern suggestion from a model trained on simulated phantoms only.
    Not a diagnosis; no malignancy probability exists anywhere in this model."""

    model: str
    pattern: Literal["pigmented", "vascular", "mixed"] | None = Field(
        description="Suggested dominant pattern; null = uncertain, the dermatologist decides"
    )
    probabilities: dict[str, float]
    abstain_below: float
    held_out_accuracy_when_answered: float
    held_out_coverage: float
    trained_on: str
    drivers: list[TriageDriver] = []


class AcralOpinion(BaseModel):
    """Research-mode acral pattern read (pigment along furrows or ridges) from a model trained on
    simulated acral lesions only. Meaningful only for palm, sole and nail sites."""

    model: str
    pattern: Literal["furrow", "ridge"] | None = Field(
        description="null = uncertain, the dermatologist decides"
    )
    probabilities: dict[str, float]
    abstain_below: float
    held_out_accuracy_when_answered: float
    held_out_coverage: float
    trained_on: str


class CaptureOut(BaseModel):
    id: uuid.UUID
    lesion_id: uuid.UUID
    captured_at: datetime
    status: CaptureStatus
    device_type: Literal["virtual"]
    device_id: str
    phantom_id: str | None
    simulated: bool = Field(description="True: frames come from the simulated optical module")
    qc: QCOut
    area_mm2: float | None
    views: dict[str, str] = Field(description="View name → short-lived signed image URL")
    spectral_signature: SpectralSignature | None = None
    diameter_mm: float | None = Field(default=None, description="Longest diameter of the outline")
    width_mm: float | None = Field(default=None, description="Width (ellipse minor axis)")
    quality_model: QualityOpinion | None = None
    triage_model: TriageOpinion | None = None
    acral_model: AcralOpinion | None = None
    morphology: Morphology | None = None
    registration_shift_px: dict[str, list[float]] | None = None
    gain_correction: dict[str, float] | None = None


class LesionDetail(LesionOut):
    patient: PatientOut
    captures: list[CaptureOut]


class CaseCreate(BaseModel):
    lesion_id: uuid.UUID
    capture_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    question: Text2000


class ReviewCreate(BaseModel):
    impression: Text2000
    action: ReviewAction
    follow_up_days: int | None = Field(default=None, ge=0, le=3650)
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    pattern_read: PatternRead | None = Field(
        default=None, description="Dermatologist's own read of the dominant pattern (shadow mode)"
    )
    ai_hidden: bool | None = Field(
        default=None, description="True if the AI suggestions were hidden while reviewing"
    )


class ReviewOut(BaseModel):
    id: uuid.UUID
    reviewer_name: str
    impression: str
    action: ReviewAction
    follow_up_days: int | None
    notes: str | None
    pattern_read: PatternRead | None = None
    ai_hidden: bool | None = None
    created_at: datetime


class OutcomeIn(BaseModel):
    action_taken: OutcomeAction
    procedure_date: date | None = None
    histopathology: Histopathology | None = Field(
        default=None, description="Only when tissue was taken (biopsied or excised)"
    )
    histopathology_notes: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None
    ) = None

    @model_validator(mode="after")
    def _tissue_only(self) -> "OutcomeIn":
        if self.histopathology and self.action_taken not in ("biopsied", "excised"):
            raise ValueError("Histopathology needs a biopsy or excision")
        return self


class OutcomeOut(OutcomeIn):
    recorded_by_name: str
    recorded_at: datetime
    updated_at: datetime


class CaseSummary(BaseModel):
    id: uuid.UUID
    status: CaseStatus
    question: str
    created_at: datetime
    updated_at: datetime
    answered_at: datetime | None
    requested_by: str
    patient: PatientOut
    lesion: LesionOut
    thumbnail_url: str | None
    review_action: ReviewAction | None
    follow_up_due: date | None = Field(
        default=None, description="Answer date + the dermatologist's follow-up interval"
    )
    outcome_action: OutcomeAction | None = None
    histopathology: Histopathology | None = None
    attention_flags: list[AttentionFlag] = Field(
        default=[], description="Named criteria worth the dermatologist's attention; not a score"
    )


class CaseDetail(CaseSummary):
    captures: list[CaptureOut]
    lesion_history: list[CaptureOut]
    review: ReviewOut | None
    outcome: OutcomeOut | None = None


class ValidationOut(BaseModel):
    capture_id: uuid.UUID
    phantom_id: str
    simulated: bool
    metrics: dict[str, float] = Field(
        description="melanin_r, melanin_rmse, hemoglobin_r, hemoglobin_rmse, mask_dice, "
        "area_error_pct"
    )
    measured_area_mm2: float
    true_area_mm2: float
    scope: str


class AuditEventOut(BaseModel):
    id: uuid.UUID
    at: datetime
    actor: str
    actor_role: Role
    action: str
    entity_type: str
    entity_id: str


class HeldOut(BaseModel):
    accuracy: float
    coverage: float | None = None
    accuracy_when_answered: float | None = None
    n: int


class ModelSummary(BaseModel):
    name: str
    version: str
    purpose: str
    status: Literal["advisory", "research"]
    trained_at: str
    held_out: HeldOut
    ablation: dict[str, float] | None = Field(
        default=None, description="Held-out accuracy per feature set (triage: rgb_only, spectral)"
    )
    model_card: str


class ShadowAgreement(BaseModel):
    reads: int = Field(description="Reviews with a dermatologist pattern read")
    compared: int = Field(description="Reads where the model gave a pattern (did not abstain)")
    agreed: int
    model_abstained: int
    blind_reads: int = Field(description="Reads made with the AI suggestions hidden")
    blind_compared: int
    blind_agreed: int
    confusion: dict[str, dict[str, int]] = Field(description="dermatologist read → model pattern")


class DataFlywheel(BaseModel):
    cases: int
    reviewed: int
    consented_reviewed: int
    with_outcome: int
    histopathology_confirmed: int
    validation_eligible: int = Field(
        description="Consented, reviewed and histopathology-confirmed: usable to validate a model"
    )


class AISummary(BaseModel):
    computed_at: datetime
    scope: str
    models: list[ModelSummary]
    shadow: ShadowAgreement
    data: DataFlywheel


class SimilarCase(BaseModel):
    case_id: uuid.UUID
    patient_code: str
    site: str
    fitzpatrick: str
    thumbnail_url: str | None
    distance: float = Field(description="Euclidean distance between standardised feature vectors")
    review_action: ReviewAction | None
    pattern_read: PatternRead | None
    outcome_action: OutcomeAction | None
    histopathology: Histopathology | None
