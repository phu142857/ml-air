def list_projects(tenant_id: str, limit: int) -> list[dict[str, str]]:
    default_items = [
        {"project_id": "default_project", "name": "Default Project"},
        {"project_id": "risk_project", "name": "Risk Project"},
    ]
    return default_items[: max(1, min(limit, len(default_items)))]
