"""case outcomes: action taken and histopathology after the recommendation

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-25 01:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outcomes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=False),
        sa.Column("action_taken", sa.String(length=16), nullable=False),
        sa.Column("procedure_date", sa.Date(), nullable=True),
        sa.Column("histopathology", sa.String(length=16), nullable=True),
        sa.Column("histopathology_notes", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "action_taken IN ('observed', 'biopsied', 'excised', 'referred', 'declined')",
            name=op.f("ck_outcomes_action_taken_valid"),
        ),
        sa.CheckConstraint(
            "histopathology IS NULL OR histopathology IN "
            "('pending', 'benign', 'malignant', 'indeterminate')",
            name=op.f("ck_outcomes_histopathology_valid"),
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], name=op.f("fk_outcomes_case_id_cases")),
        sa.ForeignKeyConstraint(
            ["recorded_by"], ["users.id"], name=op.f("fk_outcomes_recorded_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outcomes")),
        sa.UniqueConstraint("case_id", name=op.f("uq_outcomes_case_id")),
    )
    op.create_index(op.f("ix_outcomes_recorded_by"), "outcomes", ["recorded_by"])


def downgrade() -> None:
    """Drops recorded outcomes: one-way for data. Restore from a database backup."""
    op.drop_index(op.f("ix_outcomes_recorded_by"), table_name="outcomes")
    op.drop_table("outcomes")
