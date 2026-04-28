from app.services.db_service import db_conn


_PROJECT_SOURCES = [
    "runs",
    "models",
    "datasets",
    "experiments",
    "pipeline_versions",
    "run_dataset_lineage",
    "model_trigger_policies",
]


def list_projects(tenant_id: str, limit: int) -> list[dict[str, str]]:
    lim = max(1, min(int(limit or 50), 500))
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
                    pid = str(row[0] or "").strip()
                    if pid:
                        discovered.add(pid)

    # Always include global/default scope for UX consistency.
    discovered.add("default_project")
    ordered = ["default_project"] + sorted([p for p in discovered if p != "default_project"])
    return [{"project_id": pid, "name": pid} for pid in ordered[:lim]]
