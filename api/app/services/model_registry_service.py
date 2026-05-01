from __future__ import annotations

from datetime import datetime, timezone
import json
import os
import re
from uuid import uuid4
from urllib.parse import urlparse

from app.services.db_service import db_conn


def create_model(tenant_id: str, project_id: str, name: str, description: str | None = None) -> dict:
    model_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO models(model_id, tenant_id, project_id, name, description)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING model_id, tenant_id, project_id, name, description, created_at, updated_at
                """,
                (model_id, tenant_id, project_id, name, description),
            )
            row = cur.fetchone()
    return {
        "model_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "name": row[3],
        "description": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def list_models(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM models
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()
    return [
        {
            "model_id": row[0],
            "tenant_id": row[1],
            "project_id": row[2],
            "name": row[3],
            "description": row[4],
            "created_at": row[5].isoformat(),
            "updated_at": row[6].isoformat(),
        }
        for row in rows
    ]


def get_model(tenant_id: str, project_id: str, model_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM models
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "model_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "name": row[3],
        "description": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def _next_model_version(model_id: str) -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM model_versions WHERE model_id = %s", (model_id,))
            row = cur.fetchone()
            return int(row[0])


def _slug_token(value: str) -> str:
    token = re.sub(r"[^a-zA-Z0-9_.-]+", "-", str(value or "").strip().lower())
    return token.strip("-") or "unknown"


def _default_model_artifact_root() -> str:
    # User-configurable root path for model artifact placement.
    # Example:
    # - file:///mlair/artifacts/models
    # - s3://mlair-artifacts/models
    # - minio://mlair/models
    return str(
        os.getenv("ML_AIR_DEFAULT_MODEL_ARTIFACT_ROOT", "file:///mlair/artifacts/models")
    ).rstrip("/")


def _model_scope_for_id(model_id: str) -> tuple[str, str, str] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id, project_id, name
                FROM models
                WHERE model_id = %s
                """,
                (model_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return str(row[0]), str(row[1]), str(row[2])


def _default_artifact_uri(model_id: str, version_num: int) -> str | None:
    scope = _model_scope_for_id(model_id)
    if not scope:
        return None
    root = _default_model_artifact_root()
    if not root:
        return None
    tenant_id, project_id, model_name = scope
    return (
        f"{root}/"
        f"{_slug_token(tenant_id)}/"
        f"{_slug_token(project_id)}/"
        f"{_slug_token(model_name)}/"
        f"v{int(version_num)}"
    )


def preview_next_model_artifact_uri(model_id: str) -> dict:
    version_num = _next_model_version(model_id)
    uri = _default_artifact_uri(model_id, version_num)
    return {"model_id": model_id, "next_version": version_num, "artifact_uri": uri}


def create_model_version(model_id: str, run_id: str | None, artifact_uri: str | None, stage: str = "staging") -> dict:
    version_id = str(uuid4())
    version_num = _next_model_version(model_id)
    resolved_artifact_uri = str(artifact_uri or "").strip() or _default_artifact_uri(model_id, version_num)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_versions(version_id, model_id, version, run_id, artifact_uri, stage)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (version_id, model_id, version_num, run_id, resolved_artifact_uri, stage),
            )
            row = cur.fetchone()
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
    }


def _safe_filename(name: str) -> str:
    base = os.path.basename(str(name or "").strip())
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", base) or "model.bin"


def _file_uri_to_path(uri: str) -> str:
    parsed = urlparse(uri)
    if parsed.scheme != "file":
        raise ValueError("artifact_upload_only_supports_file_uri")
    return parsed.path


def _default_metadata_payload(model_id: str, version_num: int, model_filename: str, artifact_files: list[str] | None = None) -> dict:
    scope = _model_scope_for_id(model_id) or ("unknown", "unknown", "unknown")
    files = artifact_files or [model_filename]
    return {
        "model_id": model_id,
        "model_name": scope[2],
        "tenant_id": scope[0],
        "project_id": scope[1],
        "version": f"v{version_num}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata_source": "generated",
        "artifacts": {"model": model_filename, "files": files},
    }


def create_model_version_from_upload(
    model_id: str,
    model_filename: str,
    model_content: bytes,
    metadata_filename: str | None = None,
    metadata_content: bytes | None = None,
    run_id: str | None = None,
    stage: str = "staging",
) -> dict:
    version_id = str(uuid4())
    version_num = _next_model_version(model_id)
    artifact_uri = _default_artifact_uri(model_id, version_num)
    if not artifact_uri:
        raise ValueError("model_not_found")

    artifact_dir = _file_uri_to_path(artifact_uri)
    os.makedirs(artifact_dir, exist_ok=True)

    safe_model_filename = _safe_filename(model_filename)
    model_path = os.path.join(artifact_dir, safe_model_filename)
    with open(model_path, "wb") as f:
        f.write(model_content)

    safe_metadata_filename = _safe_filename(metadata_filename or "metadata.json")
    metadata_path = os.path.join(artifact_dir, safe_metadata_filename)
    metadata_generated = metadata_content is None
    if metadata_content is None:
        payload = _default_metadata_payload(model_id, version_num, safe_model_filename)
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=True, indent=2)
    else:
        with open(metadata_path, "wb") as f:
            f.write(metadata_content)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_versions(version_id, model_id, version, run_id, artifact_uri, stage)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (version_id, model_id, version_num, run_id, artifact_uri, stage),
            )
            row = cur.fetchone()
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
        "metadata_generated": metadata_generated,
    }


def create_model_version_from_uploads(
    model_id: str,
    files: list[tuple[str, bytes]],
    run_id: str | None = None,
    stage: str = "staging",
) -> dict:
    if not files:
        raise ValueError("no_files_uploaded")
    version_id = str(uuid4())
    version_num = _next_model_version(model_id)
    artifact_uri = _default_artifact_uri(model_id, version_num)
    if not artifact_uri:
        raise ValueError("model_not_found")

    artifact_dir = _file_uri_to_path(artifact_uri)
    os.makedirs(artifact_dir, exist_ok=True)

    safe_saved_names: list[str] = []
    metadata_content: bytes | None = None
    model_file_name: str | None = None
    model_exts = {".pkl", ".onnx", ".pt", ".bin", ".joblib"}

    for raw_name, content in files:
        safe_name = _safe_filename(raw_name)
        out_path = os.path.join(artifact_dir, safe_name)
        with open(out_path, "wb") as f:
            f.write(content)
        safe_saved_names.append(safe_name)
        lower_name = safe_name.lower()
        ext = os.path.splitext(lower_name)[1]
        if lower_name == "metadata.json":
            metadata_content = content
        if model_file_name is None and ext in model_exts:
            model_file_name = safe_name

    if model_file_name is None:
        raise ValueError("model_file_required")

    metadata_path = os.path.join(artifact_dir, "metadata.json")
    metadata_generated = metadata_content is None
    if metadata_generated:
        payload = _default_metadata_payload(model_id, version_num, model_file_name, safe_saved_names)
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=True, indent=2)
        if "metadata.json" not in safe_saved_names:
            safe_saved_names.append("metadata.json")
    else:
        if "metadata.json" not in [n.lower() for n in safe_saved_names]:
            with open(metadata_path, "wb") as f:
                f.write(metadata_content)
            safe_saved_names.append("metadata.json")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_versions(version_id, model_id, version, run_id, artifact_uri, stage)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (version_id, model_id, version_num, run_id, artifact_uri, stage),
            )
            row = cur.fetchone()
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
        "metadata_generated": metadata_generated,
        "uploaded_files": safe_saved_names,
    }


def list_model_versions(model_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, model_id, version, run_id, artifact_uri, stage, created_at
                FROM model_versions
                WHERE model_id = %s
                ORDER BY version DESC
                """,
                (model_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "version_id": row[0],
            "model_id": row[1],
            "version": row[2],
            "run_id": row[3],
            "artifact_uri": row[4],
            "stage": row[5],
            "created_at": row[6].isoformat(),
        }
        for row in rows
    ]


def delete_model(model_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM models WHERE model_id = %s", (model_id,))
            deleted = cur.rowcount
    return bool(deleted)


def delete_model_version(model_id: str, version: int) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM model_versions WHERE model_id = %s AND version = %s",
                (model_id, int(version)),
            )
            deleted = cur.rowcount
    return bool(deleted)


def promote_model_version(model_id: str, version: int, stage: str = "production") -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE model_versions SET stage = 'archived' WHERE model_id = %s AND stage = %s", (model_id, stage))
            cur.execute(
                """
                UPDATE model_versions
                SET stage = %s
                WHERE model_id = %s AND version = %s
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (stage, model_id, version),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("model_version_not_found")
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
    }


def get_model_status(tenant_id: str, project_id: str, model_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mv.version_id, mv.version, mv.run_id, mv.stage, mv.created_at
                FROM model_versions mv
                JOIN models m ON m.model_id = mv.model_id
                WHERE m.tenant_id = %s AND m.project_id = %s AND m.model_id = %s
                ORDER BY mv.version DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
            if not row:
                return {"model_id": model_id, "status": "UNKNOWN", "blocking_datasets": []}
            run_id = row[2]
            if not run_id:
                return {
                    "model_id": model_id,
                    "status": "UNKNOWN",
                    "latest_version": row[1],
                    "blocking_datasets": [],
                }
            cur.execute(
                """
                SELECT dataset_name, actual_size, required_size, status
                FROM run_dataset_lineage
                WHERE run_id = %s AND role = 'input'
                ORDER BY dataset_name ASC
                """,
                (run_id,),
            )
            ds_rows = cur.fetchall()
    blocking = [
        {
            "dataset": r[0],
            "actual_size": int(r[1] or 0),
            "required_size": int(r[2] or 0),
            "status": r[3],
        }
        for r in ds_rows
        if str(r[3]) != "READY"
    ]
    return {
        "model_id": model_id,
        "latest_version": row[1],
        "run_id": run_id,
        "status": "READY" if not blocking else "NOT_READY",
        "blocking_datasets": blocking,
    }


def _get_mapped_pipeline_id(tenant_id: str, project_id: str, model_id: str) -> str | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pipeline_id
                FROM model_pipeline_mapping
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row or not str(row[0] or "").strip():
        return None
    return str(row[0]).strip()


def resolve_base_model_artifact(tenant_id: str, project_id: str, model_id: str) -> dict | None:
    """Prefer production weights with non-empty artifact_uri; else latest version that has an artifact."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mv.version_id, mv.version, mv.artifact_uri
                FROM model_versions mv
                JOIN models m ON m.model_id = mv.model_id
                WHERE m.tenant_id = %s
                  AND m.project_id = %s
                  AND m.model_id = %s
                  AND mv.stage = 'production'
                  AND mv.artifact_uri IS NOT NULL
                  AND TRIM(mv.artifact_uri) <> ''
                ORDER BY mv.created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
            if row:
                return {
                    "version_id": str(row[0]),
                    "version": int(row[1]) if row[1] is not None else 0,
                    "artifact_uri": str(row[2]),
                    "source": "production",
                }
            cur.execute(
                """
                SELECT mv.version_id, mv.version, mv.artifact_uri
                FROM model_versions mv
                JOIN models m ON m.model_id = mv.model_id
                WHERE m.tenant_id = %s
                  AND m.project_id = %s
                  AND m.model_id = %s
                  AND mv.artifact_uri IS NOT NULL
                  AND TRIM(mv.artifact_uri) <> ''
                ORDER BY mv.version DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            row2 = cur.fetchone()
            if row2:
                return {
                    "version_id": str(row2[0]),
                    "version": int(row2[1]) if row2[1] is not None else 0,
                    "artifact_uri": str(row2[2]),
                    "source": "latest_artifact",
                }
    return None


def upsert_model_pipeline_mapping(tenant_id: str, project_id: str, model_id: str, pipeline_id: str) -> dict:
    pid = str(pipeline_id or "").strip()
    if not pid:
        raise ValueError("pipeline_id_required")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id FROM models
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            if not cur.fetchone():
                raise ValueError("model_not_found")
            cur.execute(
                """
                SELECT 1 FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                LIMIT 1
                """,
                (tenant_id, project_id, pid),
            )
            if not cur.fetchone():
                raise ValueError("pipeline_not_in_project")
            cur.execute(
                """
                INSERT INTO model_pipeline_mapping(
                    tenant_id, project_id, model_id, pipeline_id, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (tenant_id, project_id, model_id) DO UPDATE
                SET pipeline_id = EXCLUDED.pipeline_id, updated_at = NOW()
                RETURNING tenant_id, project_id, model_id, pipeline_id, created_at, updated_at
                """,
                (tenant_id, project_id, model_id, pid),
            )
            row = cur.fetchone()
    return {
        "tenant_id": row[0],
        "project_id": row[1],
        "model_id": row[2],
        "pipeline_id": row[3],
        "created_at": row[4].isoformat(),
        "updated_at": row[5].isoformat(),
    }


def resolve_model_pipeline(tenant_id: str, project_id: str, model_id: str) -> dict:
    mapped = _get_mapped_pipeline_id(tenant_id, project_id, model_id)
    base = resolve_base_model_artifact(tenant_id, project_id, model_id)
    if mapped:
        out: dict = {
            "model_id": model_id,
            "pipeline_id": mapped,
            "model_version": base["version"] if base else None,
            "run_id": None,
            "source": "model_pipeline_mapping",
        }
        if base:
            out["artifact_uri"] = base["artifact_uri"]
            out["base_weights_source"] = base["source"]
            out["base_version_id"] = base["version_id"]
        return out

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.pipeline_id, mv.version, r.run_id
                FROM model_versions mv
                JOIN models m ON m.model_id = mv.model_id
                LEFT JOIN runs r ON r.run_id = mv.run_id
                WHERE m.tenant_id = %s
                  AND m.project_id = %s
                  AND m.model_id = %s
                  AND r.pipeline_id IS NOT NULL
                ORDER BY mv.version DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row:
        out2: dict = {
            "model_id": model_id,
            "pipeline_id": None,
            "model_version": None,
            "run_id": None,
            "source": "unresolved",
        }
        if base:
            out2["artifact_uri"] = base["artifact_uri"]
            out2["base_weights_source"] = base["source"]
            out2["base_version_id"] = base["version_id"]
        return out2
    out3 = {
        "model_id": model_id,
        "pipeline_id": row[0],
        "model_version": int(row[1]) if row[1] is not None else None,
        "run_id": row[2],
        "source": "latest_model_run",
    }
    if base:
        out3["artifact_uri"] = base["artifact_uri"]
        out3["base_weights_source"] = base["source"]
        out3["base_version_id"] = base["version_id"]
    return out3
