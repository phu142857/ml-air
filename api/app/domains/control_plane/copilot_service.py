"""AI Copilot for Hub (Phase 5 Epic 8)."""

from __future__ import annotations

from typing import Any


def suggest(*, action: str, context: dict[str, Any]) -> dict[str, Any]:
    act = str(action or "").strip().lower()
    if act == "explain_failure":
        reason = str(context.get("reason") or context.get("error") or "unknown")
        return {
            "action": act,
            "summary": f"Run failed: {reason}",
            "suggestions": [
                "Check dataset readiness evaluations for blocked policies.",
                "Review task logs for the first failed task in the DAG.",
                "Verify pipeline plugin versions match the compatibility matrix.",
            ],
        }
    if act == "generate_pipeline":
        return {
            "action": act,
            "summary": "Suggested pipeline skeleton",
            "pipeline": {
                "tasks": [
                    {"id": "load_data", "plugin": "dataset.load"},
                    {"id": "train", "plugin": "sklearn.train", "depends_on": ["load_data"]},
                    {"id": "evaluate", "plugin": "sklearn.evaluate", "depends_on": ["train"]},
                ]
            },
        }
    if act == "generate_prompt":
        topic = str(context.get("topic") or "classification")
        return {
            "action": act,
            "prompt": f"You are an ML assistant. Help the user with {topic}. Be concise and cite MLAir resources.",
        }
    if act == "suggest_hyperparameters":
        return {
            "action": act,
            "hyperparameters": {"learning_rate": 0.01, "max_depth": 6, "n_estimators": 200},
        }
    if act == "dataset_analysis":
        size = context.get("current_size") or context.get("rows")
        return {
            "action": act,
            "summary": f"Dataset has {size} rows (approx).",
            "recommendations": ["Run readiness evaluation", "Check drift against production baseline"],
        }
    if act == "run_summary":
        status = str(context.get("status") or "UNKNOWN")
        return {
            "action": act,
            "summary": f"Run status: {status}",
            "highlights": context.get("metrics") or {},
        }
    return {"action": act, "summary": "No copilot handler for this action.", "context_keys": list(context.keys())}
