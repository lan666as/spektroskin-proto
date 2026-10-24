"""clinical records

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-24 21:32:03.234211

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_audit_events_actor_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
    )
    op.create_index(op.f("ix_audit_events_actor_id"), "audit_events", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_events_at"), "audit_events", ["at"], unique=False)
    op.create_table(
        "patients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("fitzpatrick", sa.String(length=4), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "fitzpatrick IN ('I', 'II', 'III', 'IV', 'V', 'VI')",
            name=op.f("ck_patients_fitzpatrick_valid"),
        ),
        sa.CheckConstraint("sex IN ('female', 'male')", name=op.f("ck_patients_sex_valid")),
        sa.CheckConstraint("age BETWEEN 0 AND 120", name=op.f("ck_patients_age_range")),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_patients_created_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_patients")),
        sa.UniqueConstraint("code", name=op.f("uq_patients_code")),
    )
    op.create_index(op.f("ix_patients_created_by"), "patients", ["created_by"], unique=False)
    op.create_table(
        "lesions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("body_site", sa.String(length=32), nullable=False),
        sa.Column("laterality", sa.String(length=16), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "body_site IN ('face', 'scalp', 'neck', 'chest', 'abdomen', 'upper_back', 'lower_back', 'upper_arm', 'forearm', 'palm', 'hand_dorsum', 'thigh', 'lower_leg', 'sole', 'foot_dorsum', 'fingernail', 'toenail', 'genital', 'other')",
            name=op.f("ck_lesions_body_site_valid"),
        ),
        sa.CheckConstraint(
            "laterality IS NULL OR laterality IN ('left', 'right', 'midline')",
            name=op.f("ck_lesions_laterality_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_lesions_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"], ["patients.id"], name=op.f("fk_lesions_patient_id_patients")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lesions")),
    )
    op.create_index(op.f("ix_lesions_created_by"), "lesions", ["created_by"], unique=False)
    op.create_index(op.f("ix_lesions_patient_id"), "lesions", ["patient_id"], unique=False)
    op.create_table(
        "captures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lesion_id", sa.Uuid(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_type", sa.String(length=16), nullable=False),
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("phantom_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("qc", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("area_mm2", sa.Double(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "device_type IN ('virtual')", name=op.f("ck_captures_device_type_valid")
        ),
        sa.CheckConstraint(
            "status IN ('processed', 'qc_failed')", name=op.f("ck_captures_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_captures_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["lesion_id"], ["lesions.id"], name=op.f("fk_captures_lesion_id_lesions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_captures")),
    )
    op.create_index(op.f("ix_captures_created_by"), "captures", ["created_by"], unique=False)
    op.create_index(op.f("ix_captures_lesion_id"), "captures", ["lesion_id"], unique=False)
    op.create_table(
        "cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lesion_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('submitted', 'in_review', 'answered')", name=op.f("ck_cases_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_cases_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["lesion_id"], ["lesions.id"], name=op.f("fk_cases_lesion_id_lesions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cases")),
    )
    op.create_index(op.f("ix_cases_created_by"), "cases", ["created_by"], unique=False)
    op.create_index(op.f("ix_cases_lesion_id"), "cases", ["lesion_id"], unique=False)
    op.create_index(op.f("ix_cases_status"), "cases", ["status"], unique=False)
    op.create_table(
        "case_captures",
        sa.Column("case_id", sa.Uuid(), nullable=False),
        sa.Column("capture_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["capture_id"], ["captures.id"], name=op.f("fk_case_captures_capture_id_captures")
        ),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], name=op.f("fk_case_captures_case_id_cases")
        ),
        sa.PrimaryKeyConstraint("case_id", "capture_id", name=op.f("pk_case_captures")),
    )
    op.create_index(
        op.f("ix_case_captures_capture_id"), "case_captures", ["capture_id"], unique=False
    )
    op.create_table(
        "reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=False),
        sa.Column("impression", sa.Text(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("follow_up_days", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "action IN ('observe', 'biopsy', 'refer')", name=op.f("ck_reviews_action_valid")
        ),
        sa.CheckConstraint(
            "follow_up_days IS NULL OR follow_up_days BETWEEN 0 AND 3650",
            name=op.f("ck_reviews_follow_up_range"),
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], name=op.f("fk_reviews_case_id_cases")),
        sa.ForeignKeyConstraint(
            ["reviewer_id"], ["users.id"], name=op.f("fk_reviews_reviewer_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
        sa.UniqueConstraint("case_id", name=op.f("uq_reviews_case_id")),
    )
    op.create_index(op.f("ix_reviews_reviewer_id"), "reviews", ["reviewer_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_reviews_reviewer_id"), table_name="reviews")
    op.drop_table("reviews")
    op.drop_index(op.f("ix_case_captures_capture_id"), table_name="case_captures")
    op.drop_table("case_captures")
    op.drop_index(op.f("ix_cases_status"), table_name="cases")
    op.drop_index(op.f("ix_cases_lesion_id"), table_name="cases")
    op.drop_index(op.f("ix_cases_created_by"), table_name="cases")
    op.drop_table("cases")
    op.drop_index(op.f("ix_captures_lesion_id"), table_name="captures")
    op.drop_index(op.f("ix_captures_created_by"), table_name="captures")
    op.drop_table("captures")
    op.drop_index(op.f("ix_lesions_patient_id"), table_name="lesions")
    op.drop_index(op.f("ix_lesions_created_by"), table_name="lesions")
    op.drop_table("lesions")
    op.drop_index(op.f("ix_patients_created_by"), table_name="patients")
    op.drop_table("patients")
    op.drop_index(op.f("ix_audit_events_at"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_actor_id"), table_name="audit_events")
    op.drop_table("audit_events")
