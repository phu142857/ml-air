"""Hyperparameter search for AutoML jobs."""

from __future__ import annotations

import itertools
import random
import uuid
from typing import Any


def generate_trials(search_space: dict[str, Any]) -> list[dict[str, Any]]:
    strategy = str(search_space.get("strategy") or "grid").strip().lower()
    params = search_space.get("parameters") or search_space.get("params") or {}
    max_trials = int(search_space.get("max_trials") or 10)
    if strategy == "random":
        return _random_trials(params, max_trials)
    return _grid_trials(params, max_trials)


def _param_values(spec: Any) -> list[Any]:
    if isinstance(spec, list):
        return list(spec)
    if not isinstance(spec, dict):
        return [spec]
    if "values" in spec:
        return list(spec["values"])
    ptype = str(spec.get("type") or "choice").lower()
    if ptype in ("float", "int"):
        lo = spec.get("min", spec.get("low", 0))
        hi = spec.get("max", spec.get("high", 1))
        steps = int(spec.get("steps") or 3)
        if ptype == "int":
            if steps <= 1:
                return [int(lo)]
            span = int(hi) - int(lo)
            return sorted({int(lo + (span * i) / max(steps - 1, 1)) for i in range(steps)})
        if steps <= 1:
            return [float(lo)]
        span = float(hi) - float(lo)
        return [round(float(lo) + span * i / max(steps - 1, 1), 6) for i in range(steps)]
    return [spec.get("default", 0)]


def _grid_trials(params: dict[str, Any], max_trials: int) -> list[dict[str, Any]]:
    keys = list(params.keys())
    if not keys:
        return [{"trial_id": str(uuid.uuid4()), "params": {}, "status": "pending"}]
    value_lists = [_param_values(params[k]) for k in keys]
    combos = list(itertools.product(*value_lists))[:max_trials]
    return [
        {"trial_id": str(uuid.uuid4()), "params": dict(zip(keys, combo)), "status": "pending", "score": None, "run_id": None}
        for combo in combos
    ]


def _random_trials(params: dict[str, Any], max_trials: int) -> list[dict[str, Any]]:
    trials: list[dict[str, Any]] = []
    for _ in range(max(1, max_trials)):
        chosen: dict[str, Any] = {}
        for key, spec in params.items():
            values = _param_values(spec)
            if not values:
                continue
            if isinstance(spec, dict) and str(spec.get("type") or "").lower() == "float" and "min" in spec and "max" in spec:
                chosen[key] = round(random.uniform(float(spec["min"]), float(spec["max"])), 6)
            elif isinstance(spec, dict) and str(spec.get("type") or "").lower() == "int" and "min" in spec and "max" in spec:
                chosen[key] = random.randint(int(spec["min"]), int(spec["max"]))
            else:
                chosen[key] = random.choice(values)
        trials.append({"trial_id": str(uuid.uuid4()), "params": chosen, "status": "pending", "score": None, "run_id": None})
    return trials


def pick_best_trial(trials: list[dict[str, Any]], *, objective: str = "maximize") -> dict[str, Any] | None:
    scored = [t for t in trials if t.get("score") is not None]
    if not scored:
        return None
    reverse = str(objective or "maximize").lower() != "minimize"
    return sorted(scored, key=lambda t: float(t["score"]), reverse=reverse)[0]
