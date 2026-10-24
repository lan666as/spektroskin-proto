import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

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
ViewName = Literal["standard", "pigment", "vascular"]

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


class PatientOut(ORM):
    id: uuid.UUID
    code: str
    age: int
    sex: Sex
    fitzpatrick: Fitzpatrick
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


class PatientDetail(PatientOut):
    lesions: list[LesionOut]


class QCOut(BaseModel):
    passed: bool
    metrics: dict[str, float]
    checks: dict[str, bool]
    guidance: list[str]


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


class ReviewOut(BaseModel):
    id: uuid.UUID
    reviewer_name: str
    impression: str
    action: ReviewAction
    follow_up_days: int | None
    notes: str | None
    created_at: datetime


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


class CaseDetail(CaseSummary):
    captures: list[CaptureOut]
    lesion_history: list[CaptureOut]
    review: ReviewOut | None
