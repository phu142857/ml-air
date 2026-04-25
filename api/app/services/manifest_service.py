from __future__ import annotations

import json
from uuid import uuid4

from psycopg.types.json import Json

from app.services.db_service import db_conn


def upsert_task_manifest(
    run_id: str,
    task_id: str,
    algorithm: str,
    signature: str,
    payload: dict,
) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO task_artifact_manifests (manifest_id, run_id, task_id, algorithm, signature, payload)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, task_id) DO UPDATE
                SET algorithm = EXCLUDED.algorithm,
                    signature = EXCLUDED.signature,
                    payload = EXCLUDED.payload,
                    created_at = NOW()
                RETURNING manifest_id, run_id, task_id, algorithm, signature, payload, created_at
                """,
                (str(uuid4()), run_id, task_id, algorithm, signature, Json(payload)),
            )
            row = cur.fetchone()
    payload_row = row[5]
    if isinstance(payload_row, str):
        payload_row = json.loads(payload_row)
    return {
        "manifest_id": row[0],
        "run_id": row[1],
        "task_id": row[2],
        "algorithm": row[3],
        "signature": row[4],
        "payload": payload_row,
        "created_at": row[6].isoformat(),
    }
