"""Persist canonical_source_type (PG enum) on versions + accumulation buffers

Revision ID: 0022_dataset_source_kind_enum
Revises: 0021_readiness_eval_indexes
Create Date: 2026-05-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022_dataset_source_kind_enum"
down_revision = "0021_readiness_eval_indexes"
branch_labels = None
depends_on = None

# Mirrors ``app.dataset_source_type.canonical_dataset_source_type`` / ``frontend/lib/dataset-source-type.ts``.
_CANON_SQL = """
CASE
  WHEN lower(trim(coalesce(source_type, ''))) = '' THEN 'unknown'
  WHEN lower(trim(source_type)) IN (
    'csv_import', 'manual_upload', 'import', 'upload', 'uploaded', 'file_import'
  ) THEN 'import'
  WHEN lower(trim(source_type)) IN (
    'runtime_feedback', 'runtime_accumulation', 'runtime_accumulated',
    'buffer_materialized', 'accumulation'
  ) THEN 'runtime_accumulated'
  WHEN lower(trim(source_type)) IN ('manual', 'manual_snapshot', 'manual_materialize') THEN 'manual'
  WHEN lower(trim(source_type)) IN ('generated', 'synthetic', 'derived') THEN 'generated'
  ELSE 'unknown'
END::dataset_source_kind
"""


def upgrade() -> None:
    kind = postgresql.ENUM(
        "import",
        "runtime_accumulated",
        "manual",
        "generated",
        "unknown",
        name="dataset_source_kind",
        create_type=True,
    )
    kind.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "dataset_versions",
        sa.Column("canonical_source_type", kind, nullable=True),
    )
    op.add_column(
        "dataset_accumulation_buffers",
        sa.Column("canonical_source_type", kind, nullable=True),
    )

    op.execute(sa.text(f"UPDATE dataset_versions SET canonical_source_type = {_CANON_SQL}"))
    op.execute(sa.text(f"UPDATE dataset_accumulation_buffers SET canonical_source_type = {_CANON_SQL}"))

    op.alter_column(
        "dataset_versions",
        "canonical_source_type",
        nullable=False,
        server_default=sa.text("'unknown'::dataset_source_kind"),
    )
    op.alter_column(
        "dataset_accumulation_buffers",
        "canonical_source_type",
        nullable=False,
        server_default=sa.text("'unknown'::dataset_source_kind"),
    )


def downgrade() -> None:
    op.drop_column("dataset_accumulation_buffers", "canonical_source_type")
    op.drop_column("dataset_versions", "canonical_source_type")
    op.execute(sa.text("DROP TYPE IF EXISTS dataset_source_kind"))
