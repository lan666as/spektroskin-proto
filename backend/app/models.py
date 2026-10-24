import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    Uuid,
)
from sqlalchemy import false as sa_false
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ROLES = ("clinician", "dermatologist")
SEXES = ("female", "male")
FITZPATRICK = ("I", "II", "III", "IV", "V", "VI")
BODY_SITES = (
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
)
LATERALITY = ("left", "right", "midline")
CAPTURE_STATUSES = ("processed", "qc_failed")
DEVICE_TYPES = ("virtual",)
CASE_STATUSES = ("submitted", "in_review", "answered")
REVIEW_ACTIONS = ("observe", "biopsy", "refer")


def utcnow() -> datetime:
    return datetime.now(UTC)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    type_annotation_map = {dict[str, Any]: JSONB}


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="role_valid"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32))
    password_hash: Mapped[str] = mapped_column(String(128))
    # Automated smoke/e2e accounts. Their records stay out of real users' views.
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false())
    created_at: Mapped[datetime] = _created_at()


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint(_in("sex", SEXES), name="sex_valid"),
        CheckConstraint(_in("fitzpatrick", FITZPATRICK), name="fitzpatrick_valid"),
        CheckConstraint("age BETWEEN 0 AND 120", name="age_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    age: Mapped[int] = mapped_column(Integer)
    sex: Mapped[str] = mapped_column(String(16))
    fitzpatrick: Mapped[str] = mapped_column(String(4))
    # Consent to research use of this patient's images; clinical care does not depend on it.
    research_consent: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa_false()
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = _created_at()

    lesions: Mapped[list["Lesion"]] = relationship(back_populates="patient")


class Lesion(Base):
    __tablename__ = "lesions"
    __table_args__ = (
        CheckConstraint(_in("body_site", BODY_SITES), name="body_site_valid"),
        CheckConstraint(
            f"laterality IS NULL OR {_in('laterality', LATERALITY)}", name="laterality_valid"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    body_site: Mapped[str] = mapped_column(String(32))
    laterality: Mapped[str | None] = mapped_column(String(16))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = _created_at()

    patient: Mapped[Patient] = relationship(back_populates="lesions")
    captures: Mapped[list["Capture"]] = relationship(
        back_populates="lesion", order_by="Capture.captured_at"
    )


class Capture(Base):
    __tablename__ = "captures"
    __table_args__ = (
        CheckConstraint(_in("status", CAPTURE_STATUSES), name="status_valid"),
        CheckConstraint(_in("device_type", DEVICE_TYPES), name="device_type_valid"),
    )

    # Client-generated so that re-sending the same upload is idempotent.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    lesion_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lesions.id"), index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    device_type: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str] = mapped_column(String(64))
    phantom_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    qc: Mapped[dict[str, Any]]
    result: Mapped[dict[str, Any]]
    area_mm2: Mapped[float | None]
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = _created_at()

    lesion: Mapped[Lesion] = relationship(back_populates="captures")


case_captures = Table(
    "case_captures",
    Base.metadata,
    Column("case_id", ForeignKey("cases.id"), primary_key=True),
    Column("capture_id", ForeignKey("captures.id"), primary_key=True, index=True),
)


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (CheckConstraint(_in("status", CASE_STATUSES), name="status_valid"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lesion_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lesions.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    lesion: Mapped[Lesion] = relationship()
    captures: Mapped[list[Capture]] = relationship(
        secondary=case_captures, order_by="Capture.captured_at"
    )
    review: Mapped["Review | None"] = relationship(back_populates="case")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint(_in("action", REVIEW_ACTIONS), name="action_valid"),
        CheckConstraint(
            "follow_up_days IS NULL OR follow_up_days BETWEEN 0 AND 3650", name="follow_up_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cases.id"), unique=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    impression: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(String(16))
    follow_up_days: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()

    case: Mapped[Case] = relationship(back_populates="review")
    reviewer: Mapped[User] = relationship()


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(32))
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str] = mapped_column(String(64))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
