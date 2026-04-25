"""add manifest key id for key rotation

Revision ID: 0006_manifest_key_id
Revises: 0005_task_artifact_manifests
Create Date: 2026-04-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_manifest_key_id"
down_revision = "0005_task_artifact_manifests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "task_artifact_manifests",
        sa.Column("key_id", sa.Text(), nullable=False, server_default="v1"),
    )
    op.alter_column("task_artifact_manifests", "key_id", server_default=None)
    op.create_index("ix_task_manifest_key_id", "task_artifact_manifests", ["key_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_manifest_key_id", table_name="task_artifact_manifests")
    op.drop_column("task_artifact_manifests", "key_id")
