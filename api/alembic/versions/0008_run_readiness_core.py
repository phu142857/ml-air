"""run readiness core: run overrides/training_mode + run_dataset_lineage + dataset stats

Revision ID: 0008_run_readiness_core
Revises: 0007_task_resource_usage
Create Date: 2026-04-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_run_readiness_core"
down_revision = "0007_task_resource_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("training_mode", sa.Text(), nullable=True, server_default=sa.text("'full'")))
    op.add_column("runs", sa.Column("override_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.add_column("datasets", sa.Column("source_uri", sa.Text(), nullable=True))
    op.add_column("datasets", sa.Column("current_size", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("datasets", sa.Column("checksum", sa.Text(), nullable=True))
    op.add_column("datasets", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")))

    op.create_table(
        "run_dataset_lineage",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), sa.ForeignKey("runs.run_id", ondelete="CASCADE"), nullable=False),
        sa.Column("dataset_id", sa.Text(), sa.ForeignKey("datasets.dataset_id", ondelete="SET NULL"), nullable=True),
        sa.Column("dataset_name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("actual_size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("required_size", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_rdl_run_scope", "run_dataset_lineage", ["tenant_id", "project_id", "run_id"], unique=False)
    op.create_index("ix_rdl_dataset", "run_dataset_lineage", ["dataset_id"], unique=False)
    op.create_index("uq_rdl_run_dataset_role", "run_dataset_lineage", ["run_id", "dataset_name", "role"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_rdl_run_dataset_role", table_name="run_dataset_lineage")
    op.drop_index("ix_rdl_dataset", table_name="run_dataset_lineage")
    op.drop_index("ix_rdl_run_scope", table_name="run_dataset_lineage")
    op.drop_table("run_dataset_lineage")

    op.drop_column("datasets", "updated_at")
    op.drop_column("datasets", "checksum")
    op.drop_column("datasets", "current_size")
    op.drop_column("datasets", "source_uri")

    op.drop_column("runs", "override_config")
    op.drop_column("runs", "training_mode")
