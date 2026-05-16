from app.domains.shared.db_service import db_conn


def _is_undefined_table_error(exc: BaseException) -> bool:
    try:
        from psycopg import errors as pg_errors
    except ImportError:
        return False
    return isinstance(exc, pg_errors.UndefinedTable)


_PROJECT_SOURCES = [
    "runs",
    "models",
    "datasets",
    "experiments",
    "pipeline_versions",
    "run_dataset_lineage",
    "model_trigger_policies",
]
_RESERVED_PROJECT_IDS = {"all", "global"}


def _normalize_project_id(raw: object) -> str:
    return str(raw or "").strip()


def _is_reserved_project_id(project_id: str) -> bool:
    return bool(project_id) and project_id.lower() in _RESERVED_PROJECT_IDS


def _load_registry_project_names(tenant_id: str, limit: int) -> dict[str, str]:
    """project_id -> display name from catalog (may be empty if table missing)."""
    tid = _normalize_project_id(tenant_id)
    if not tid:
        return {}
    lim = max(1, min(int(limit or 50), 500))
    out: dict[str, str] = {}
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    SELECT project_id, name
                    FROM tenant_projects
                    WHERE tenant_id = %s
                    ORDER BY project_id ASC
                    LIMIT %s
                    """,
                    (tid, lim),
                )
                for row in cur.fetchall() or []:
                    pid = _normalize_project_id(row[0])
                    if not pid or _is_reserved_project_id(pid):
                        continue
                    name = _normalize_project_id(row[1]) or pid
                    out[pid] = name
            except Exception as e:
                if _is_undefined_table_error(e):
                    return {}
                raise
    return out


def list_projects(tenant_id: str, limit: int) -> list[dict[str, str]]:
    lim = max(1, min(int(limit or 50), 500))
    registry_names = _load_registry_project_names(tenant_id, lim)
    discovered: set[str] = set()
    with db_conn() as conn:
        with conn.cursor() as cur:
            for table_name in _PROJECT_SOURCES:
                cur.execute(
                    f"""
                    SELECT DISTINCT project_id
                    FROM {table_name}
                    WHERE tenant_id = %s
                    ORDER BY project_id ASC
                    LIMIT %s
                    """,
                    (tenant_id, lim),
                )
                rows = cur.fetchall() or []
                for row in rows:
                    pid = _normalize_project_id(row[0])
                    if pid and not _is_reserved_project_id(pid):
                        discovered.add(pid)

    merged_ids = sorted(set(registry_names.keys()) | discovered)
    return [
        {"project_id": pid, "name": registry_names.get(pid, pid)}
        for pid in merged_ids[:lim]
    ]


def _load_registry_tenant_ids(limit: int) -> set[str]:
    lim = max(1, min(int(limit or 50), 500))
    out: set[str] = set()
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    SELECT DISTINCT tenant_id
                    FROM tenant_projects
                    WHERE tenant_id IS NOT NULL AND tenant_id <> ''
                    ORDER BY tenant_id ASC
                    LIMIT %s
                    """,
                    (lim,),
                )
                for row in cur.fetchall() or []:
                    tid = _normalize_project_id(row[0])
                    if tid:
                        out.add(tid)
            except Exception as e:
                if not _is_undefined_table_error(e):
                    raise
    return out


def list_tenants(limit: int) -> list[dict[str, str]]:
    lim = max(1, min(int(limit or 50), 500))
    discovered: set[str] = set()
    with db_conn() as conn:
        with conn.cursor() as cur:
            for table_name in _PROJECT_SOURCES:
                cur.execute(
                    f"""
                    SELECT DISTINCT tenant_id
                    FROM {table_name}
                    WHERE tenant_id IS NOT NULL AND tenant_id <> ''
                    ORDER BY tenant_id ASC
                    LIMIT %s
                    """,
                    (lim,),
                )
                rows = cur.fetchall() or []
                for row in rows:
                    tid = _normalize_project_id(row[0])
                    if tid:
                        discovered.add(tid)
    discovered |= _load_registry_tenant_ids(lim)
    ordered = sorted(discovered)
    return [{"tenant_id": tid, "name": tid} for tid in ordered[:lim]]


def register_project(tenant_id: str, project_id: str, name: str | None = None) -> dict[str, str]:
    tid = _normalize_project_id(tenant_id)
    pid = _normalize_project_id(project_id)
    if not tid or not pid:
        raise ValueError("tenant_id and project_id are required")
    if _is_reserved_project_id(pid):
        raise ValueError("project_id is reserved")
    display = _normalize_project_id(name) or pid
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tenant_projects (tenant_id, project_id, name)
                VALUES (%s, %s, %s)
                ON CONFLICT (tenant_id, project_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    updated_at = now()
                """,
                (tid, pid, display),
            )
    return {"tenant_id": tid, "project_id": pid, "name": display}
