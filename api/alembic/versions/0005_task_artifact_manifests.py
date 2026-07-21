"""add signed task artifact manifests

Revision ID: 0005_task_artifact_manifests
Revises: 0004_v03_lineage
Create Date: 2026-04-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_task_artifact_manifests"
down_revision = "0004_v03_lineage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_artifact_manifests",
        sa.Column("manifest_id", sa.Text(), primary_key=True),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("algorithm", sa.Text(), nullable=False, server_default="hmac-sha256"),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("uq_task_artifact_manifest_run_task", "task_artifact_manifests", ["run_id", "task_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_task_artifact_manifest_run_task", table_name="task_artifact_manifests")
    op.drop_table("task_artifact_manifests")
